import { describe, it, expect, beforeEach } from 'vitest';
import {
  sanitizeSpreadsheetBuffer,
  generateHeaderFingerprint,
} from '@/lib/excel/sanitizer';
import { normalizeCell, resolveColumnMapping } from '@/lib/triage/normalizer';
import { computeDifferenceHash, hammingDistance, healAndLinkAssets } from '@/lib/media/healer';
import {
  buildChaoticExcelSampleBuffer,
  buildChaoticMediaSampleAssets,
} from '@/lib/demo/chaotic-sample';
import { resetTestDbSingleton } from '@/lib/db/client';
import { runIntakePipeline, getBlueprintBySlug } from '@/lib/pipeline/run-intake';
import {
  compileAssetZipBuffer,
  compileExcelBuffer,
  compileMarkdownSpec,
  compileSqlScript,
} from '@/lib/export/compilers';

describe('Vistar Intake OS — Core Engine Suite', () => {
  beforeEach(() => {
    resetTestDbSingleton();
  });

  it('1. Pre-Ingestion Excel Sanitizer unmerges banners and strips trailing GRAND TOTAL rows', () => {
    const buffer = buildChaoticExcelSampleBuffer('ecommerce_catalog');
    const result = sanitizeSpreadsheetBuffer(buffer);

    expect(result.strippedTopBannerRows).toBeGreaterThanOrEqual(2);
    expect(result.strippedFooterSummaryRows).toBe(1);
    expect(result.rows.length).toBe(4);
    expect(result.headers).toContain('Article No');
    expect(result.headers).toContain('Amt (INR)');

    // Verify no row starts with GRAND TOTAL
    const hasTotalRow = result.rows.some((r) =>
      Object.values(r).some((v) => /grand\s*total/i.test(v))
    );
    expect(hasTotalRow).toBe(false);
  });

  it('2. Header Fingerprint generates consistent SHA-256 regardless of column ordering', () => {
    const fp1 = generateHeaderFingerprint(['Article No', 'Amt (INR)', 'Item Name']);
    const fp2 = generateHeaderFingerprint(['item_name', 'amt_inr', 'article_no']);
    expect(fp1).toBe(fp2);
    expect(fp1.length).toBe(64);
  });

  it('3. Normalizer cleans messy currency, SKUs, GSTINs, and preserves originalRaw diff', () => {
    const priceCell = normalizeCell('Rs. 1,499/-', {
      key: 'price',
      label: 'Unit Price',
      type: 'currency',
      required: true,
      aliases: [],
    });
    expect(priceCell.value).toBe(1499);
    expect(priceCell.originalRaw).toBe('Rs. 1,499/-');
    expect(priceCell.status).toBe('ai_healed');

    const kCell = normalizeCell('3.2k', {
      key: 'price',
      label: 'Unit Price',
      type: 'currency',
      required: true,
      aliases: [],
    });
    expect(kCell.value).toBe(3200);

    const skuCell = normalizeCell('sku 101', {
      key: 'sku',
      label: 'SKU',
      type: 'sku',
      required: true,
      aliases: [],
    });
    expect(skuCell.value).toBe('SKU-101');
    expect(skuCell.status).toBe('ai_healed');

    const badEmail = normalizeCell('invalid-email-format', {
      key: 'owner_email',
      label: 'Email',
      type: 'email',
      required: true,
      aliases: [],
    });
    expect(badEmail.status).toBe('invalid_format');
  });

  it('4. Media Auto-Healer detects perceptual duplicates via 64-bit dHash and pads off-ratio photos to 1080x1080', async () => {
    const blueprint = await getBlueprintBySlug('shopify-d2c-catalog');
    expect(blueprint).not.toBeNull();
    if (!blueprint) return;

    const excelBuf = buildChaoticExcelSampleBuffer('ecommerce_catalog');
    const sanitized = sanitizeSpreadsheetBuffer(excelBuf);
    const { mapping } = await resolveColumnMapping(sanitized.headers, blueprint.schemaRules);
    expect(Object.keys(mapping).length).toBeGreaterThanOrEqual(5);

    const rawMedia = await buildChaoticMediaSampleAssets('ecommerce_catalog');
    expect(rawMedia.length).toBe(4);

    // Compute raw dHashes directly to verify perceptual similarity
    const hashPolo = await computeDifferenceHash(rawMedia[0].buffer);
    const hashDup = await computeDifferenceHash(rawMedia[1].buffer);
    expect(hammingDistance(hashPolo, hashDup)).toBeLessThanOrEqual(4);

    const submission = await runIntakePipeline({
      blueprintSlug: 'shopify-d2c-catalog',
      clientName: 'Test D2C Client',
      spreadsheetBuffer: excelBuf,
      mediaAssets: rawMedia,
    });

    // 4 raw images -> 1 duplicate dropped -> 3 clean healed assets
    expect(submission.stats.totalAssetsUploaded).toBe(4);
    expect(submission.stats.duplicatesRemoved).toBe(1);
    expect(submission.stats.assetsAutoHealed).toBe(3);

    const cleanAssets = submission.assets.filter((a) => !a.isDuplicate);
    expect(cleanAssets.length).toBe(3);
    expect(cleanAssets.every((a) => a.healedWidth === 1080 && a.healedHeight === 1080)).toBe(true);
    expect(cleanAssets.some((a) => a.healedFilename.startsWith('SKU-101'))).toBe(true);
  });

  it('5. Mapping Memory caches SHA-256 header signature and hits cache on subsequent uploads', async () => {
    const excelBuf = buildChaoticExcelSampleBuffer('ecommerce_catalog');

    const run1 = await runIntakePipeline({
      blueprintSlug: 'shopify-d2c-catalog',
      clientName: 'Vendor Week 1',
      spreadsheetBuffer: excelBuf,
    });
    expect(run1.stats.usedMappingMemory).toBe(false);

    const run2 = await runIntakePipeline({
      blueprintSlug: 'shopify-d2c-catalog',
      clientName: 'Vendor Week 2',
      spreadsheetBuffer: excelBuf,
    });
    expect(run2.stats.usedMappingMemory).toBe(true);
  });

  it('6. Multi-Target Export Compilers produce valid SQL, Markdown, XLSX, and Asset ZIP respecting Incremental Batch Approval', async () => {
    const excelBuf = buildChaoticExcelSampleBuffer('ecommerce_catalog');
    const rawMedia = await buildChaoticMediaSampleAssets('ecommerce_catalog');

    const submission = await runIntakePipeline({
      blueprintSlug: 'shopify-d2c-catalog',
      clientName: 'Export Verification Co',
      spreadsheetBuffer: excelBuf,
      mediaAssets: rawMedia,
    });
    const blueprint = await getBlueprintBySlug('shopify-d2c-catalog');
    expect(blueprint).not.toBeNull();
    if (!blueprint) return;

    // Row 4 is missing stock -> 3/4 verified -> Incremental batch approval
    expect(submission.stats.verifiedRowsCount).toBe(3);
    expect(submission.status).toBe('partial_approved');

    const sqlVerifiedOnly = compileSqlScript(submission.rows, blueprint, submission.assets, true);
    expect(sqlVerifiedOnly).toContain('CREATE TABLE IF NOT EXISTS "catalog_products"');
    expect(sqlVerifiedOnly).toContain('SKU-101');
    expect(sqlVerifiedOnly).not.toContain('SKU-104');

    const md = compileMarkdownSpec(
      submission.rows,
      blueprint,
      submission.assets,
      submission.clientName,
      true
    );
    expect(md).toContain('# Verified Onboarding Package: Export Verification Co');
    expect(md).toContain('SKU-101');

    const xlsxOut = compileExcelBuffer(submission.rows, blueprint, submission.assets, true);
    expect(xlsxOut.length).toBeGreaterThan(500);

    const zipOut = await compileAssetZipBuffer(
      submission.rows,
      blueprint,
      submission.assets,
      submission.clientName
    );
    expect(zipOut.length).toBeGreaterThan(1000);
  });
});
