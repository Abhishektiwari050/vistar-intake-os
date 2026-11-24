import { describe, it, expect, beforeEach } from 'vitest';
import * as crypto from 'node:crypto';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { resetTestDbSingleton } from '@/lib/db/client';
import { runIntakePipeline, getBlueprintBySlug } from '@/lib/pipeline/run-intake';
import {
  compileSqlScript,
  compileMarkdownSpec,
  compileExcelBuffer,
  compileCsvText,
  compileJsonExport,
  compileAssetZipBuffer,
} from '@/lib/export/compilers';
import {
  buildChaoticExcelSampleBuffer,
  buildChaoticMediaSampleAssets,
} from '@/lib/demo/chaotic-sample';
import { generateClientFollowUp } from '@/lib/export/chaser';
import { PATCH as patchSubmission, GET as getSubmission } from '@app/api/submissions/[id]/route';
import { POST as dispatchWebhook } from '@app/api/webhooks/dispatch/route';

describe('Tier 4: Real-World Scenarios Integration Suite', () => {
  beforeEach(() => {
    resetTestDbSingleton();
  });

  describe('Scenario 1: Shopify D2C Catalog Onboarding Full Journey', () => {
    it('Executes complete Shopify D2C catalog onboarding from messy vendor dump to verified multi-format export and webhook delivery', async () => {
      // Step 1: Vendor provides chaotic Excel spreadsheet with 2 merged banner rows,
      // non-standard column headers, dirty Indian currency strings, 1 missing stock cell,
      // and a trailing GRAND TOTAL footer row, plus 4 raw product photos including 1 duplicate.
      const excelBuffer = buildChaoticExcelSampleBuffer('ecommerce_catalog');
      const mediaAssets = await buildChaoticMediaSampleAssets('ecommerce_catalog');

      expect(excelBuffer.length).toBeGreaterThan(1000);
      expect(mediaAssets.length).toBe(4);

      // Step 2: Intake Pipeline processes the batch end-to-end
      const sub = await runIntakePipeline({
        blueprintSlug: 'shopify-d2c-catalog',
        clientName: 'Modern Threads D2C Brand',
        spreadsheetBuffer: excelBuffer,
        mediaAssets,
      });

      // Verification of ingestion and triage
      expect(sub.clientName).toBe('Modern Threads D2C Brand');
      expect(sub.rows.length).toBe(4); // 4 clean rows, GRAND TOTAL was stripped
      expect(sub.stats.strippedNoiseRows).toBeGreaterThanOrEqual(3); // 2 banner rows + 1 total row
      expect(sub.stats.totalAssetsUploaded).toBe(4);
      expect(sub.stats.duplicatesRemoved).toBe(1); // Perceptual duplicate collapsed
      expect(sub.stats.assetsAutoHealed).toBe(3); // 3 clean assets padded to 1080x1080

      // Verification of Incremental Batch Approval status (3 of 4 rows are valid, 1 missing stock)
      expect(sub.stats.verifiedRowsCount).toBe(3);
      expect(sub.status).toBe('partial_approved');

      // Verify diff preservation on AI-healed price cell
      const row0Price = sub.rows[0].cells.price;
      expect(row0Price.status).toBe('ai_healed');
      expect(row0Price.originalRaw).toBe('Rs. 1,499/-');
      expect(row0Price.value).toBe(1499);

      // Verify SKU standardization
      expect(sub.rows[0].cells.sku.value).toBe('SKU-101');
      expect(sub.rows[1].cells.sku.value).toBe('SKU-102');
      expect(sub.rows[2].cells.sku.value).toBe('SKU-103');
      expect(sub.rows[3].cells.sku.value).toBe('SKU-104');

      // Verify missing stock on SKU-104 flags isRowVerified = false
      expect(sub.rows[3].cells.stock.status).toBe('missing_required');
      expect(sub.rows[3].isRowVerified).toBe(false);

      // Step 3: Verified-only export excludes unverified SKU-104
      const bp = (await getBlueprintBySlug('shopify-d2c-catalog'))!;
      const partialSql = compileSqlScript(sub.rows, bp, sub.assets, true);
      expect(partialSql).toContain('SKU-101');
      expect(partialSql).toContain('SKU-102');
      expect(partialSql).toContain('SKU-103');
      expect(partialSql).not.toContain('SKU-104');

      // Step 4: Studio Console operator fixes missing stock inline via PATCH API
      const patchStockReq = new Request(`http://localhost/api/submissions/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit_cell',
          rowIndex: 3,
          fieldKey: 'stock',
          newValue: '75',
        }),
      });

      const patchStockRes = await patchSubmission(patchStockReq, { params: Promise.resolve({ id: sub.id }) });
      expect(patchStockRes.status).toBe(200);
      const patchedSubData = (await patchStockRes.json()).submission;

      // Status upgrades to verified with all 4 rows verified
      expect(patchedSubData.rows[3].cells.stock.value).toBe(75);
      expect(patchedSubData.rows[3].cells.stock.status).toBe('verified');
      expect(patchedSubData.rows[3].isRowVerified).toBe(true);
      expect(patchedSubData.stats.verifiedRowsCount).toBe(4);
      expect(patchedSubData.status).toBe('verified');

      // Step 5: Studio Operator bulk-approves all auto-healed cells
      const bulkApproveReq = new Request(`http://localhost/api/submissions/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve_all_healed' }),
      });

      const bulkApproveRes = await patchSubmission(bulkApproveReq, { params: Promise.resolve({ id: sub.id }) });
      expect(bulkApproveRes.status).toBe(200);
      const fullyApprovedSub = (await bulkApproveRes.json()).submission;
      expect(fullyApprovedSub.stats.healedCellsCount).toBe(0);

      // Verify Audit Trail recorded operator actions
      expect(fullyApprovedSub.auditEvents.length).toBeGreaterThanOrEqual(2);
      expect(fullyApprovedSub.auditEvents.some((e: { action: string }) => e.action === 'cell_edited')).toBe(true);
      expect(fullyApprovedSub.auditEvents.some((e: { action: string }) => e.action === 'bulk_healed_approved')).toBe(true);

      // Step 6: Multi-target export compiler exports all 6 production artifacts
      // 1. PostgreSQL .sql
      const fullSql = compileSqlScript(fullyApprovedSub.rows, bp, fullyApprovedSub.assets, true);
      expect(fullSql).toContain('CREATE TABLE IF NOT EXISTS "catalog_products"');
      expect(fullSql).toContain('SKU-101');
      expect(fullSql).toContain('SKU-104');

      // 2. Markdown .md
      const fullMd = compileMarkdownSpec(
        fullyApprovedSub.rows,
        bp,
        fullyApprovedSub.assets,
        fullyApprovedSub.clientName,
        true
      );
      expect(fullMd).toContain('# Verified Onboarding Package: Modern Threads D2C Brand');
      expect(fullMd).toContain('SKU-101');
      expect(fullMd).toContain('SKU-104');

      // 3. Excel .xlsx
      const fullXlsx = compileExcelBuffer(fullyApprovedSub.rows, bp, fullyApprovedSub.assets, true);
      expect(fullXlsx.length).toBeGreaterThan(500);
      const parsedXlsx = XLSX.read(fullXlsx, { type: 'buffer' });
      expect(parsedXlsx.SheetNames).toContain('Verified_Intake');

      // 4. RFC 4180 .csv
      const fullCsv = compileCsvText(fullyApprovedSub.rows, bp, fullyApprovedSub.assets, true);
      expect(fullCsv).toContain('SKU-101');
      expect(fullCsv).toContain('SKU-104');

      // 5. JSON export
      const fullJson = compileJsonExport(
        fullyApprovedSub.rows,
        bp,
        fullyApprovedSub.assets,
        fullyApprovedSub.clientName,
        fullyApprovedSub.id,
        true
      );
      const parsedJson = JSON.parse(fullJson);
      expect(parsedJson.records.length).toBe(4);
      expect(parsedJson.records.every((r: { isRowVerified: boolean }) => r.isRowVerified)).toBe(true);

      // 6. Asset ZIP archive
      const fullZipBuf = await compileAssetZipBuffer(
        fullyApprovedSub.rows,
        bp,
        fullyApprovedSub.assets,
        fullyApprovedSub.clientName
      );
      expect(fullZipBuf.length).toBeGreaterThan(1000);
      const zip = await JSZip.loadAsync(fullZipBuf);
      expect(zip.file('manifest.json')).not.toBeNull();
      const verifiedFiles = Object.keys(zip.files).filter((k) => k.startsWith('01_Verified_Assets/'));
      expect(verifiedFiles.length).toBeGreaterThanOrEqual(3);

      // Step 7: Webhook Sandbox Dispatch validates HMAC signature
      const dispatchReq = new Request('http://localhost/api/webhooks/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: sub.id,
          dryRunSandbox: true,
          onlyVerified: true,
          secret: 'whsec_d2c_merchant_erp_key',
        }),
      });

      const dispatchRes = await dispatchWebhook(dispatchReq);
      expect(dispatchRes.status).toBe(200);
      const dispatchData = await dispatchRes.json();

      expect(dispatchData.delivered).toBe(true);
      expect(dispatchData.statusCode).toBe(200);
      expect(dispatchData.signatureHeader).toMatch(/^t=[0-9]+,v1=[0-9a-f]{64}$/);
    });
  });

  describe('Scenario 2: Agency Client Project Kickoff Full Journey', () => {
    it('Executes complete Agency Kickoff scenario from raw unformatted notes to client follow-up chaser and verified onboarding package', async () => {
      // Step 1: Client pastes unformatted text notes from WhatsApp into dropzone
      const rawNotes =
        'Ticket ID,Feature / Deliverable,Contact Email,Fee Estimate,Urgency\n' +
        'mod 01,  EXECUTIVE DASHBOARD  ,rahul@acmefin.in,"Rs. 45,000/-",High\n' +
        'mod 02,WhatsApp Notification Relay,priya.ops@acmefin.in,25k,Medium\n' +
        'mod 03,GST Invoice PDF Export,invalid-contact-email,"Rs. 18,500",High\n' +
        'mod 04,Audit Security Matrix,security@acmefin.in,"32,000",Normal';

      const logo1 = await buildChaoticMediaSampleAssets('agency_kickoff');

      // Step 2: Intake pipeline parses text notes and normalizes agency deliverables
      const sub = await runIntakePipeline({
        blueprintSlug: 'agency-client-kickoff',
        clientName: 'Acme Fintech Corp',
        rawText: rawNotes,
        mediaAssets: logo1,
      });

      expect(sub.clientName).toBe('Acme Fintech Corp');
      expect(sub.rows.length).toBe(4);
      expect(sub.stats.totalAssetsUploaded).toBe(3);
      expect(sub.stats.duplicatesRemoved).toBe(1); // Perceptual duplicate logo removed

      // Verify normalization:
      // Module IDs standardized to uppercase with hyphens
      expect(sub.rows[0].cells.module_id.value).toBe('MOD-01');
      expect(sub.rows[1].cells.module_id.value).toBe('MOD-02');
      expect(sub.rows[2].cells.module_id.value).toBe('MOD-03');
      expect(sub.rows[3].cells.module_id.value).toBe('MOD-04');

      // Currency fees normalized
      expect(sub.rows[0].cells.allocated_budget.value).toBe(45000);
      expect(sub.rows[1].cells.allocated_budget.value).toBe(25000);
      expect(sub.rows[2].cells.allocated_budget.value).toBe(18500);
      expect(sub.rows[3].cells.allocated_budget.value).toBe(32000);

      // Email validation: module 3 failed
      expect(sub.rows[2].cells.owner_email.status).toBe('invalid_format');
      expect(sub.rows[2].isRowVerified).toBe(false);

      // Overall batch status: 3/4 verified
      expect(sub.stats.verifiedRowsCount).toBe(3);
      expect(sub.status).toBe('partial_approved');

      // Step 3: Automated Client Follow-up Chaser analyzes incomplete submission
      const bp = (await getBlueprintBySlug('agency-client-kickoff'))!;
      const chaserReport = generateClientFollowUp(
        sub,
        bp,
        `https://intake.vistar.tech/submissions/${sub.id}`
      );

      expect(chaserReport.completionPercent).toBe(75);
      expect(chaserReport.verifiedCount).toBe(3);
      expect(chaserReport.totalCount).toBe(4);
      expect(chaserReport.missingItems.length).toBe(2);
      expect(chaserReport.missingItems[0].identifier).toBe('MOD-03');
      expect(chaserReport.missingItems[0].issues).toContain('Invalid Client Stakeholder Email ("invalid-contact-email")');
      expect(chaserReport.missingItems[1].identifier).toBe('MOD-04');
      expect(chaserReport.missingItems[1].issues).toContain('Missing linked product/brand image');

      // Ready-to-send copy verification
      expect(chaserReport.whatsappText).toContain('Acme Fintech Corp');
      expect(chaserReport.whatsappText).toContain('*75% verified*');
      expect(chaserReport.whatsappText).toContain(`https://intake.vistar.tech/submissions/${sub.id}`);

      expect(chaserReport.emailText).toContain('Action Needed: Complete Remaining Items for Acme Fintech Corp');
      expect(chaserReport.emailText).toContain(`https://intake.vistar.tech/submissions/${sub.id}`);

      // Step 4: Account manager resolves missing email via inline cell edit PATCH
      const fixEmailReq = new Request(`http://localhost/api/submissions/${sub.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'edit_cell',
          rowIndex: 2,
          fieldKey: 'owner_email',
          newValue: 'priya.finance@acmefin.in',
        }),
      });

      const fixEmailRes = await patchSubmission(fixEmailReq, { params: Promise.resolve({ id: sub.id }) });
      expect(fixEmailRes.status).toBe(200);
      const verifiedSub = (await fixEmailRes.json()).submission;

      expect(verifiedSub.rows[2].cells.owner_email.value).toBe('priya.finance@acmefin.in');
      expect(verifiedSub.rows[2].cells.owner_email.status).toBe('verified');
      expect(verifiedSub.rows[2].isRowVerified).toBe(true);
      expect(verifiedSub.stats.verifiedRowsCount).toBe(4);
      expect(verifiedSub.status).toBe('verified');

      // Step 5: Compile verified Markdown onboarding spec for engineering team
      const mdSpec = compileMarkdownSpec(
        verifiedSub.rows,
        bp,
        verifiedSub.assets,
        verifiedSub.clientName,
        true
      );
      expect(mdSpec).toContain('# Verified Onboarding Package: Acme Fintech Corp');
      expect(mdSpec).toContain('MOD-01');
      expect(mdSpec).toContain('MOD-02');
      expect(mdSpec).toContain('MOD-03');
      expect(mdSpec).toContain('MOD-04');
      expect(mdSpec).toContain('priya.finance@acmefin.in');
    });
  });
});
