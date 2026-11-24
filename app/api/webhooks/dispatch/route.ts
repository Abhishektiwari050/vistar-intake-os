import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import * as crypto from 'node:crypto';
import { getDb } from '@/lib/db/client';
import { submissions, webhooks } from '@/lib/db/schema';
import { getBlueprintBySlug } from '@/lib/pipeline/run-intake';
import { compileJsonExport } from '@/lib/export/compilers';
import { isValidUuid, parseSafeJson } from '@/lib/security/upload-guard';
import type { AuditEvent } from '@/lib/types/intake';

export async function POST(request: Request): Promise<Response> {
  const jsonRes = await parseSafeJson<{
    submissionId?: string;
    targetUrl?: string;
    webhookId?: string;
    secret?: string;
    onlyVerified?: boolean;
    dryRunSandbox?: boolean;
  }>(request);

  if (!jsonRes.ok) {
    return NextResponse.json({ error: jsonRes.error }, { status: 400 });
  }

  try {
    const body = jsonRes.data;
    if (!body.submissionId || !isValidUuid(body.submissionId)) {
      return NextResponse.json({ error: 'Valid submissionId UUID is required' }, { status: 400 });
    }

    const db = await getDb();
    const found = await db
      .select()
      .from(submissions)
      .where(eq(submissions.id, body.submissionId))
      .limit(1);

    if (!found.length) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    const sub = found[0];
    const blueprint = await getBlueprintBySlug(sub.blueprintSlug);
    if (!blueprint) {
      return NextResponse.json({ error: 'Blueprint missing' }, { status: 404 });
    }

    let destinationUrl = body.targetUrl || '';
    let signingSecret = body.secret || 'whsec_vistar_sandbox_key';

    if (body.webhookId && isValidUuid(body.webhookId)) {
      const hookFound = await db
        .select()
        .from(webhooks)
        .where(eq(webhooks.id, body.webhookId))
        .limit(1);
      if (hookFound.length > 0) {
        destinationUrl = hookFound[0].url;
        signingSecret = hookFound[0].secret;
      }
    }

    const jsonPayload = compileJsonExport(
      sub.rows,
      blueprint,
      sub.assets,
      sub.clientName,
      sub.id,
      body.onlyVerified !== false
    );

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = crypto
      .createHmac('sha256', signingSecret)
      .update(`${timestamp}.${jsonPayload}`)
      .digest('hex');

    const startMs = performance.now();
    let statusCode = 200;
    let responseBody = '';
    let delivered = false;

    if (body.dryRunSandbox || !destinationUrl) {
      // Built-in HMAC signature verification sandbox response
      statusCode = 200;
      delivered = true;
      responseBody = JSON.stringify(
        {
          acknowledged: true,
          verifiedSignature: `t=${timestamp},v1=${signature}`,
          event: 'submission.verified',
          recordsDelivered: JSON.parse(jsonPayload).records.length,
        },
        null,
        2
      );
    } else {
      if (!/^https?:\/\//i.test(destinationUrl)) {
        return NextResponse.json({ error: 'Webhook URL must begin with http:// or https://' }, { status: 400 });
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const resp = await fetch(destinationUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Vistar-Event': 'submission.verified',
            'X-Vistar-Timestamp': timestamp,
            'X-Vistar-Signature': `t=${timestamp},v1=${signature}`,
          },
          body: jsonPayload,
          signal: controller.signal,
        });
        statusCode = resp.status;
        delivered = resp.ok;
        responseBody = (await resp.text()).slice(0, 2000);
      } catch (err) {
        statusCode = 502;
        delivered = false;
        responseBody = err instanceof Error ? err.message : 'Network failure dispatching webhook';
      } finally {
        clearTimeout(timeout);
      }
    }

    const latencyMs = Math.max(1, Math.round(performance.now() - startMs));

    if (body.webhookId && isValidUuid(body.webhookId)) {
      await db
        .update(webhooks)
        .set({ lastStatus: statusCode, lastLatencyMs: latencyMs })
        .where(eq(webhooks.id, body.webhookId));
    }

    const auditEvents: AuditEvent[] = Array.isArray(sub.auditEvents) ? [...sub.auditEvents] : [];
    auditEvents.unshift({
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      actor: 'Webhook Dispatcher',
      action: 'webhook_dispatched',
      detail: `${body.dryRunSandbox ? 'Sandbox HMAC Check' : destinationUrl} -> HTTP ${statusCode} (${latencyMs}ms)`,
    });

    await db
      .update(submissions)
      .set({ auditEvents: auditEvents.slice(0, 100) })
      .where(eq(submissions.id, sub.id));

    return NextResponse.json({
      delivered,
      statusCode,
      latencyMs,
      signatureHeader: `t=${timestamp},v1=${signature}`,
      payloadPreview: jsonPayload,
      responseBody,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Webhook dispatch failed' },
      { status: 500 }
    );
  }
}
