import { describe, it, expect, beforeEach } from 'vitest';
import * as crypto from 'node:crypto';
import JSZip from 'jszip';
import { resetTestDbSingleton } from '@/lib/db/client';
import { runIntakePipeline, getBlueprintBySlug } from '@/lib/pipeline/run-intake';
import {
  compileSqlScript,
  compileCsvText,
  compileAssetZipBuffer,
} from '@/lib/export/compilers';
import {
  generateSyntheticProductImage,
  generateSyntheticWorkbook,
} from '../helpers/test-generators';
import { PATCH as patchSubmission, GET as getSubmission } from '@app/api/submissions/[id]/route';
import { POST as dispatchWebhook } from '@app/api/webhooks/dispatch/route';
import { POST as postWebhook } from '@app/api/webhooks/route';
import type { RawUploadedAsset } from '@/lib/media/healer';

describe('Tier 3: Pairwise Cross-Feature Combinations Suite', () => {
  beforeEach(() => {
    resetTestDbSingleton();
  });

  describe('Pipeline 1: Sanitizer + Mapping Memory Pipeline', () => {
    it('1.1 Sanitizes multi-row merged headers, hashes fingerprint, and caches mapping on first run', async () => {
      const wb1 = generateSyntheticWorkbook({
        bannerRows: [
          ['VENDOR INVENTORY EXPORT — 2026', '', '', ''],
          ['Confidential internal use only', '', '', ''],
        ],
        headerRow: ['Item Code', 'Product Title', 'MRP (INR)', 'Warehouse Qty'],
        dataRows: [
          ['SKU-10', 'Denim Jacket', 'Rs. 2,999/-', '40'],
          ['SKU-20', 'Chino Pants', '1,799', '65'],
        ],
        merges: [
          { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
          { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
        ],
      });

      const run1 = await runIntakePipeline({
        blueprintSlug: 'shopify-d2c-catalog',
        clientName: 'Vendor Batch Week 1',
        spreadsheetBuffer: wb1,
        columnMappingOverride: {
          sku: 'Item Code',
          title: 'Product Title',
          price: 'MRP (INR)',
          stock: 'Warehouse Qty',
        },
      });

      expect(run1.stats.usedMappingMemory).toBe(false);
      expect(run1.rows.length).toBe(2);
      expect(run1.rows[0].cells.sku.value).toBe('SKU-10');
      expect(run1.rows[0].cells.price.value).toBe(2999);

      // Second run: rearranged headers with different casing should hit identical SHA-256 fingerprint
      const wb2 = generateSyntheticWorkbook({
        bannerRows: [
          ['VENDOR INVENTORY EXPORT — WEEK 2', '', '', ''],
          ['Updated stock counts', '', '', ''],
        ],
        headerRow: ['Warehouse Qty', 'MRP (INR)', 'Product Title', 'Item Code'],
        dataRows: [
          ['50', '2,999', 'Denim Jacket Re-stock', 'SKU-10'],
        ],
        merges: [
          { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
          { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
        ],
      });

      const run2 = await runIntakePipeline({
        blueprintSlug: 'shopify-d2c-catalog',
        clientName: 'Vendor Batch Week 2',
        spreadsheetBuffer: wb2,
      });

      expect(run2.stats.usedMappingMemory).toBe(true);
      expect(run2.rows[0].cells.sku.value).toBe('SKU-10');
      expect(run2.rows[0].cells.price.value).toBe(2999);
      expect(run2.rows[0].cells.stock.value).toBe(50);
    });

    it('1.2 Updating column mapping override persists new mapping in memory cache for subsequent runs', async () => {
      const csv = Buffer.from('field_a,field_b,field_c,field_d\nFA1,FB1,100,5', 'utf8');

      // Initial override
      await runIntakePipeline({
        blueprintSlug: 'shopify-d2c-catalog',
        clientName: 'Override Run 1',
        spreadsheetBuffer: csv,
        columnMappingOverride: {
          sku: 'field_a',
          title: 'field_b',
          price: 'field_c',
          stock: 'field_d',
        },
      });

      // Updated override on same headers
      await runIntakePipeline({
        blueprintSlug: 'shopify-d2c-catalog',
        clientName: 'Override Run 2',
        spreadsheetBuffer: csv,
        columnMappingOverride: {
          sku: 'field_b', // Swapped SKU to field_b
          title: 'field_a',
          price: 'field_c',
          stock: 'field_d',
        },
      });

      // Next run without override uses updated mapping
      const run3 = await runIntakePipeline({
        blueprintSlug: 'shopify-d2c-catalog',
        clientName: 'Override Run 3',
        spreadsheetBuffer: csv,
      });

      expect(run3.stats.usedMappingMemory).toBe(true);
      expect(run3.rows[0].cells.sku.value).toBe('FB1');
      expect(run3.rows[0].cells.title.value).toBe('FA1');
    });
  });

  describe('Pipeline 2: Normalizer + Diff Table + Incremental Approval + Compilers Pipeline', () => {
    it('2.1 Multi-row ingestion preserves amber diffs, supports partial approval and filtered exports', async () => {
      const wb = generateSyntheticWorkbook({
        headerRow: ['SKU', 'Title', 'Price', 'Stock'],
        dataRows: [
          ['sku 101', 'Classic Oxford Shirt', 'Rs. 1,499/-', '50'],
          ['sku 102', 'Linen Summer Shorts', '1200', '30'],
          ['sku 103', 'Leather Weekender Bag', '3.5k', '15'],
          ['sku 104', 'Cashmere Beanie', 'Rs. 899/-', ''], // Missing mandatory stock
        ],
      });

      const sub = await runIntakePipeline({
        blueprintSlug: 'shopify-d2c-catalog',
        clientName: 'Pipeline Brand Co',
        spreadsheetBuffer: wb,
      });

      // 1. Ingestion state verification
      expect(sub.rows.length).toBe(4);
      expect(sub.stats.verifiedRowsCount).toBe(3);
      expect(sub.status).toBe('partial_approved');

      // 2. Diff preservation verification
      const row1Price = sub.rows[0].cells.price;
      expect(row1Price.status).toBe('ai_healed');
      expect(row1Price.originalRaw).toBe('Rs. 1,499/-');
      expect(row1Price.value).toBe(1499);

      const row3Price = sub.rows[2].cells.price;
      expect(row3Price.value).toBe(3500);
      expect(row3Price.status).toBe('ai_healed');

      const row4Stock = sub.rows[3].cells.stock;
      expect(row4Stock.status).toBe('missing_required');
      expect(sub.rows[3].isRowVerified).toBe(false);

      // 3. Filtered export verification (onlyVerified = true)
      const bp = (await getBlueprintBySlug('shopify-d2c-catalog'))!;
      const sqlVerifiedOnly = compileSqlScript(sub.rows, bp, sub.assets, true);
      expect(sqlVerifiedOnly).toContain('SKU-101');
      expect(sqlVerifiedOnly).toContain('SKU-102');
      expect(sqlVerifiedOnly).toContain('SKU-103');
      expect(sqlVerifiedOnly).not.toContain('SKU-104');

      const csvVerifiedOnly = compileCsvText(sub.rows, bp, sub.assets, true);
      expect(csvVerifiedOnly).toContain('SKU-101,Classic Oxford Shirt');
      expect(csvVerifiedOnly).toContain('1499,50');
      expect(csvVerifiedOnly).not.toContain('SKU-104');

      // 4. Operator fixes missing cell via API PATCH
      const patchReq = new Request(`http://localhost/api/submissions/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit_cell',
          rowIndex: 3,
          fieldKey: 'stock',
          newValue: '42',
        }),
      });

      const patchRes = await patchSubmission(patchReq, { params: Promise.resolve({ id: sub.id }) });
      expect(patchRes.status).toBe(200);
      const patchedBody = await patchRes.json();
      expect(patchedBody.submission.rows[3].cells.stock.value).toBe(42);
      expect(patchedBody.submission.rows[3].cells.stock.status).toBe('verified');
      expect(patchedBody.submission.rows[3].isRowVerified).toBe(true);
      expect(patchedBody.submission.stats.verifiedRowsCount).toBe(4);
      expect(patchedBody.submission.status).toBe('verified');

      // 5. Operator approves all remaining AI-healed cells
      const approveReq = new Request(`http://localhost/api/submissions/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve_all_healed' }),
      });
      const approveRes = await patchSubmission(approveReq, { params: Promise.resolve({ id: sub.id }) });
      expect(approveRes.status).toBe(200);
      const approvedBody = await approveRes.json();
      expect(approvedBody.submission.stats.healedCellsCount).toBe(0);

      // 6. Full export now includes all 4 rows
      const sqlAllVerified = compileSqlScript(approvedBody.submission.rows, bp, sub.assets, true);
      expect(sqlAllVerified).toContain('SKU-101');
      expect(sqlAllVerified).toContain('SKU-104');
    });
  });

  describe('Pipeline 3: Media Healer + Multimodal Vision Linking + Perceptual Deduplication + ZIP Package', () => {
    it('3.1 End-to-end media pipeline pads aspect ratio, deduplicates by dHash+RGB, and builds ZIP archive', async () => {
      // 1. Create test images:
      // Hero image for SKU-201 (landscape 1280x720)
      const heroImg = await generateSyntheticProductImage(1280, 720, '#F1F5F9', '#2563EB', 'SKU-201 HERO');
      // Identical copy for perceptual deduplication test (same dHash and mean RGB)
      const dupHeroImg = Buffer.from(heroImg);
      // Ruby red color variant of SKU-201 (contrasting color - must NOT be duplicate)
      const rubyVariantImg = await generateSyntheticProductImage(1280, 720, '#FEF2F2', '#DC2626', 'SKU-201 RED');
      // Front image for SKU-202 (portrait 720x1280)
      const frontImg202 = await generateSyntheticProductImage(720, 1280, '#ECFDF5', '#059669', 'SKU-202 FRONT');

      const rawAssets: RawUploadedAsset[] = [
        { filename: 'sku_201_hero_shoot.jpg', buffer: heroImg, mimeType: 'image/jpeg' },
        { filename: 'sku_201_hero_copy_whatsapp.jpg', buffer: dupHeroImg, mimeType: 'image/jpeg' },
        { filename: 'sku_201_ruby_red_edition.jpg', buffer: rubyVariantImg, mimeType: 'image/jpeg' },
        { filename: 'sku_202_front_portrait.jpg', buffer: frontImg202, mimeType: 'image/jpeg' },
      ];

      const catalogCsv = Buffer.from(
        'sku,title,price,stock\n' +
        'SKU-201,Performance Polo Shirt,1499,100\n' +
        'SKU-202,Tech Fleece Hoodie,2499,60',
        'utf8'
      );

      const sub = await runIntakePipeline({
        blueprintSlug: 'shopify-d2c-catalog',
        clientName: 'Media Pipeline Brand',
        spreadsheetBuffer: catalogCsv,
        mediaAssets: rawAssets,
      });

      // Verification of media pipeline results
      expect(sub.stats.totalAssetsUploaded).toBe(4);
      expect(sub.stats.duplicatesRemoved).toBe(1); // Dup hero removed
      expect(sub.stats.assetsAutoHealed).toBe(3); // 3 clean assets healed

      const cleanAssets = sub.assets.filter((a) => !a.isDuplicate);
      expect(cleanAssets.length).toBe(3);

      // Verify all clean assets have 1080x1080 dimensions
      expect(cleanAssets.every((a) => a.healedWidth === 1080 && a.healedHeight === 1080)).toBe(true);

      // Verify SKU linking
      const linkedTo201 = cleanAssets.filter((a) => a.linkedSku === 'SKU-201');
      const linkedTo202 = cleanAssets.filter((a) => a.linkedSku === 'SKU-202');
      expect(linkedTo201.length).toBe(2); // hero + ruby variant
      expect(linkedTo202.length).toBe(1); // front

      // Verify collision-safe unique filenames
      const filenames = cleanAssets.map((a) => a.healedFilename);
      expect(new Set(filenames).size).toBe(3);
      expect(filenames.some((fn) => fn.startsWith('SKU-201'))).toBe(true);
      expect(filenames.some((fn) => fn.startsWith('SKU-202'))).toBe(true);

      // Compile downloadable Asset ZIP
      const bp = (await getBlueprintBySlug('shopify-d2c-catalog'))!;
      const zipBuf = await compileAssetZipBuffer(sub.rows, bp, sub.assets, sub.clientName);
      expect(zipBuf.length).toBeGreaterThan(1000);

      const zip = await JSZip.loadAsync(zipBuf);
      const filePaths = Object.keys(zip.files);
      expect(filePaths).toContain('manifest.json');
      expect(filePaths.filter((p) => p.startsWith('01_Verified_Assets/')).length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Pipeline 4: Audit Trail + Submissions Lifecycle + Webhook Dispatch Sandbox Pipeline', () => {
    it('4.1 Tracks lifecycle edits in persistent audit trail and dispatches signed HMAC webhook payload', async () => {
      const csv = Buffer.from('sku,title,price,stock\nSKU-301,Wireless Earbuds,2999,50', 'utf8');
      const sub = await runIntakePipeline({
        blueprintSlug: 'shopify-d2c-catalog',
        clientName: 'Audit & Webhook Corp',
        spreadsheetBuffer: csv,
      });

      // 1. Perform cell edit
      const editReq = new Request(`http://localhost/api/submissions/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit_cell',
          rowIndex: 0,
          fieldKey: 'price',
          newValue: '3499',
        }),
      });
      await patchSubmission(editReq, { params: Promise.resolve({ id: sub.id }) });

      // 2. Perform cell revert
      const revertReq = new Request(`http://localhost/api/submissions/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'revert_cell',
          rowIndex: 0,
          fieldKey: 'price',
        }),
      });
      await patchSubmission(revertReq, { params: Promise.resolve({ id: sub.id }) });

      // 3. Fetch submission to verify audit log persistence
      const getRes = await getSubmission(new Request(`http://localhost/api/submissions/${sub.id}`), {
        params: Promise.resolve({ id: sub.id }),
      });
      expect(getRes.status).toBe(200);
      const getBody = await getRes.json();
      const auditLog = getBody.submission.auditEvents;

      expect(auditLog.length).toBeGreaterThanOrEqual(2);
      expect(auditLog.some((e: { action: string }) => e.action === 'cell_edited')).toBe(true);
      expect(auditLog.some((e: { action: string }) => e.action === 'cell_reverted')).toBe(true);

      // 4. Create Webhook endpoint entry
      const whRes = await postWebhook(
        new Request('http://localhost/api/webhooks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: 'Production ERP Webhook',
            url: 'https://erp.partner.com/v1/catalog-intake',
            secret: 'whsec_prod_secret_key_12345678',
          }),
        })
      );
      expect(whRes.status).toBe(201);
      const whBody = await whRes.json();
      const webhookId = whBody.webhook.id;

      // 5. Dispatch Sandbox Webhook test
      const dispatchReq = new Request('http://localhost/api/webhooks/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: sub.id,
          webhookId,
          dryRunSandbox: true,
          onlyVerified: true,
        }),
      });

      const dispatchRes = await dispatchWebhook(dispatchReq);
      expect(dispatchRes.status).toBe(200);
      const dispatchBody = await dispatchRes.json();

      expect(dispatchBody.delivered).toBe(true);
      expect(dispatchBody.statusCode).toBe(200);
      expect(dispatchBody.signatureHeader).toMatch(/^t=[0-9]+,v1=[0-9a-f]{64}$/);

      // Verify HMAC cryptographic signature matches the exact payload sent
      const [tPart, v1Part] = dispatchBody.signatureHeader.split(',');
      const timestamp = tPart.replace('t=', '');
      const receivedV1 = v1Part.replace('v1=', '');

      const expectedHmac = crypto
        .createHmac('sha256', 'whsec_prod_secret_key_12345678')
        .update(`${timestamp}.${dispatchBody.payloadPreview}`)
        .digest('hex');

      expect(receivedV1).toBe(expectedHmac);
    });
  });
});
