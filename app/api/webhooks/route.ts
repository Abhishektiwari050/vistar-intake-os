import { NextResponse } from 'next/server';
import { desc, eq } from 'drizzle-orm';
import * as crypto from 'node:crypto';
import { getDb } from '@/lib/db/client';
import { webhooks } from '@/lib/db/schema';
import { isValidUuid, parseSafeJson } from '@/lib/security/upload-guard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const CreateWebhookSchema = z.object({
  name: z.string().min(2).max(80),
  url: z
    .string()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), 'URL must use http:// or https://'),
  secret: z.string().min(8).optional(),
});

export async function GET(): Promise<Response> {
  try {
    const db = await getDb();
    const list = await db.select().from(webhooks).orderBy(desc(webhooks.createdAt));
    return NextResponse.json({ webhooks: list });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to load webhooks' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request): Promise<Response> {
  const jsonRes = await parseSafeJson(request);
  if (!jsonRes.ok) {
    return NextResponse.json({ error: jsonRes.error }, { status: 400 });
  }

  try {
    const parsed = CreateWebhookSchema.safeParse(jsonRes.data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const secret = parsed.data.secret || `whsec_${crypto.randomBytes(20).toString('hex')}`;
    const db = await getDb();
    const [created] = await db
      .insert(webhooks)
      .values({
        name: parsed.data.name,
        url: parsed.data.url,
        secret,
        enabled: true,
      })
      .returning();

    return NextResponse.json({ webhook: created }, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to create webhook' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    const id = url.searchParams.get('id') || '';
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid webhook UUID' }, { status: 400 });
    }

    const db = await getDb();
    const deleted = await db.delete(webhooks).where(eq(webhooks.id, id)).returning();
    if (!deleted.length) {
      return NextResponse.json({ error: 'Webhook not found' }, { status: 404 });
    }
    return NextResponse.json({ deleted: true, id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete webhook' },
      { status: 500 }
    );
  }
}
