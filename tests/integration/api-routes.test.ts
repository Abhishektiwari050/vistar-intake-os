import { describe, it, expect, beforeEach } from 'vitest';
import { resetTestDbSingleton } from '@/lib/db/client';
import { GET as getBlueprints, POST as postBlueprint } from '@app/api/blueprints/route';
import {
  GET as getBlueprintBySlugRoute,
  PATCH as patchBlueprint,
  DELETE as deleteBlueprint,
} from '@app/api/blueprints/[slug]/route';
import { POST as postIntake } from '@app/api/intake/route';
import { POST as postIntakePreview } from '@app/api/intake/preview/route';
import {
  GET as getSubmission,
  PATCH as patchSubmission,
  DELETE as deleteSubmission,
} from '@app/api/submissions/[id]/route';
import { GET as exportSubmission } from '@app/api/submissions/[id]/export/route';
import {
  GET as getWebhooks,
  POST as postWebhook,
  DELETE as deleteWebhook,
} from '@app/api/webhooks/route';
import { POST as dispatchWebhook } from '@app/api/webhooks/dispatch/route';

describe('API Route Handlers Integration Suite', () => {
  beforeEach(() => {
    resetTestDbSingleton();
  });

  it('Blueprints CRUD: GET defaults, POST validates SQL keys & rejects duplicate slug 409, PATCH & DELETE custom blueprint', async () => {
    const res1 = await getBlueprints();
    expect(res1.status).toBe(200);
    const body1 = await res1.json();
    expect(body1.blueprints.length).toBeGreaterThanOrEqual(2);

    // Malformed JSON -> 400
    const badJsonReq = new Request('http://localhost/api/blueprints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{invalid-json',
    });
    expect((await postBlueprint(badJsonReq)).status).toBe(400);

    // Unsafe SQL identifier in schemaRules[].key -> 400
    const badSqlKeyReq = new Request('http://localhost/api/blueprints', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Auto Parts',
        slug: 'auto-parts',
        description: 'Auto parts blueprint',
        targetType: 'ecommerce_catalog',
        sqlTableName: 'auto_parts',
        schemaRules: [
          { key: 'id; DROP TABLE leads;--', label: 'SKU', type: 'sku', required: true, aliases: [] },
        ],
        mediaRules: {
          minWidth: 500,
          minHeight: 500,
          targetWidth: 1080,
          targetHeight: 1080,
          aspectRatio: '1:1',
          outputFormat: 'webp',
          deduplicateByHash: true,
          autoHealOffRatio: true,
        },
      }),
    });
    expect((await postBlueprint(badSqlKeyReq)).status).toBe(400);

    // Valid custom blueprint -> 201
    const validPayload = {
      name: 'Auto Parts Catalog',
      slug: 'auto-parts',
      description: 'Auto parts catalog validation rules',
      targetType: 'ecommerce_catalog',
      sqlTableName: 'auto_parts_tbl',
      schemaRules: [
        { key: 'sku', label: 'Part SKU', type: 'sku', required: true, aliases: ['part_no'] },
        { key: 'price', label: 'Price', type: 'currency', required: true, aliases: ['rate'] },
      ],
      mediaRules: {
        minWidth: 500,
        minHeight: 500,
        targetWidth: 1080,
        targetHeight: 1080,
        aspectRatio: '1:1',
        outputFormat: 'webp',
        deduplicateByHash: true,
        autoHealOffRatio: true,
      },
    };
    const createRes = await postBlueprint(
      new Request('http://localhost/api/blueprints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPayload),
      })
    );
    expect(createRes.status).toBe(201);

    // Duplicate slug -> 409 Conflict
    const dupRes = await postBlueprint(
      new Request('http://localhost/api/blueprints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validPayload),
      })
    );
    expect(dupRes.status).toBe(409);

    // PATCH & GET & DELETE [slug]
    const patchRes = await patchBlueprint(
      new Request('http://localhost/api/blueprints/auto-parts', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Auto Parts Updated' }),
      }),
      { params: Promise.resolve({ slug: 'auto-parts' }) }
    );
    expect(patchRes.status).toBe(200);
    expect((await patchRes.json()).blueprint.name).toBe('Auto Parts Updated');

    const getRes = await getBlueprintBySlugRoute(
      new Request('http://localhost/api/blueprints/auto-parts'),
      { params: Promise.resolve({ slug: 'auto-parts' }) }
    );
    expect(getRes.status).toBe(200);

    const delRes = await deleteBlueprint(
      new Request('http://localhost/api/blueprints/auto-parts', { method: 'DELETE' }),
      { params: Promise.resolve({ slug: 'auto-parts' }) }
    );
    expect(delRes.status).toBe(200);
  });

  it('Intake Preview & Upload Security: blocks .xlsm macros, MIME spoofing, and persists mapping overrides', async () => {
    // 1. Staged Mapping Preview
    const previewRes = await postIntakePreview(
      new Request('http://localhost/api/intake/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blueprintSlug: 'shopify-d2c-catalog',
          simulateChaotic: true,
        }),
      })
    );
    expect(previewRes.status).toBe(200);
    const previewJson = await previewRes.json();
    expect(previewJson.preview.cleanRowsCount).toBe(4);
    expect(previewJson.preview.columns.length).toBeGreaterThanOrEqual(5);

    // 2. Block .xlsm macro upload
    const formMacro = new FormData();
    formMacro.append('blueprintSlug', 'shopify-d2c-catalog');
    formMacro.append(
      'files',
      new File([Buffer.from('dummy-macro')], 'evil.xlsm', { type: 'application/vnd.ms-excel' })
    );
    const macroRes = await postIntake(
      new Request('http://localhost/api/intake', { method: 'POST', body: formMacro })
    );
    expect(macroRes.status).toBe(400);
    expect((await macroRes.json()).error).toMatch(/macro/i);

    // 3. Block MIME-spoofed HTML disguised as .png
    const formSpoof = new FormData();
    formSpoof.append('blueprintSlug', 'shopify-d2c-catalog');
    formSpoof.append(
      'files',
      new File([Buffer.from('<html><script>alert(1)</script></html>')], 'fake.png', {
        type: 'image/png',
      })
    );
    const spoofRes = await postIntake(
      new Request('http://localhost/api/intake', { method: 'POST', body: formSpoof })
    );
    expect(spoofRes.status).toBe(400);
    expect((await spoofRes.json()).error).toMatch(/magic-byte/i);
  });

  it('Submissions Lifecycle: validates UUIDs (400), edits/reverts/approves cells with auditEvents, exports 6 formats, dispatches HMAC webhook, and DELETEs', async () => {
    // Invalid UUID returns 400 (never 500)
    const badUuidGet = await getSubmission(new Request('http://localhost/api/submissions/not-a-uuid'), {
      params: Promise.resolve({ id: 'not-a-uuid' }),
    });
    expect(badUuidGet.status).toBe(400);

    // Create chaotic simulation submission
    const simRes = await postIntake(
      new Request('http://localhost/api/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          blueprintSlug: 'shopify-d2c-catalog',
          clientName: '🚀 हिंदी Client',
          simulateChaotic: true,
        }),
      })
    );
    expect(simRes.status).toBe(201);
    const { submission } = await simRes.json();
    const id = submission.id as string;

    // Inline cell fix on missing stock (row 3)
    const fixRes = await patchSubmission(
      new Request(`http://localhost/api/submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit_cell',
          rowIndex: 3,
          fieldKey: 'stock',
          newValue: '75',
        }),
      }),
      { params: Promise.resolve({ id }) }
    );
    expect(fixRes.status).toBe(200);
    const fixedBody = await fixRes.json();
    expect(fixedBody.submission.status).toBe('verified');
    expect(fixedBody.submission.auditEvents.length).toBe(1);

    // Bulk approve auto-healed cells
    const bulkRes = await patchSubmission(
      new Request(`http://localhost/api/submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve_all_healed' }),
      }),
      { params: Promise.resolve({ id }) }
    );
    expect(bulkRes.status).toBe(200);
    const bulkBody = await bulkRes.json();
    expect(bulkBody.submission.stats.healedCellsCount).toBe(0);

    // Export all 6 formats + check RFC 5987 Content-Disposition on non-ASCII clientName
    for (const fmt of ['sql', 'md', 'csv', 'json', 'xlsx', 'zip']) {
      const expRes = await exportSubmission(
        new Request(`http://localhost/api/submissions/${id}/export?format=${fmt}`),
        { params: Promise.resolve({ id }) }
      );
      expect(expRes.status).toBe(200);
      const disp = expRes.headers.get('Content-Disposition') || '';
      expect(disp).toContain('filename=');
      expect(disp).toContain("filename*=UTF-8''");
    }

    // Webhook CRUD & HMAC Sandbox Dispatch
    const whCreate = await postWebhook(
      new Request('http://localhost/api/webhooks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test Hook', url: 'https://example.com/hook' }),
      })
    );
    expect(whCreate.status).toBe(201);
    const whJson = await whCreate.json();

    const whList = await getWebhooks();
    expect((await whList.json()).webhooks.length).toBe(1);

    const dispatchRes = await dispatchWebhook(
      new Request('http://localhost/api/webhooks/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: id, dryRunSandbox: true }),
      })
    );
    expect(dispatchRes.status).toBe(200);
    const dispJson = await dispatchRes.json();
    expect(dispJson.delivered).toBe(true);
    expect(dispJson.signatureHeader).toContain('v1=');

    const whDel = await deleteWebhook(
      new Request(`http://localhost/api/webhooks?id=${whJson.webhook.id}`, { method: 'DELETE' })
    );
    expect(whDel.status).toBe(200);

    // DELETE submission & confirm 404
    const delSub = await deleteSubmission(
      new Request(`http://localhost/api/submissions/${id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id }) }
    );
    expect(delSub.status).toBe(200);

    const afterDel = await getSubmission(new Request(`http://localhost/api/submissions/${id}`), {
      params: Promise.resolve({ id }),
    });
    expect(afterDel.status).toBe(404);
  });
});
