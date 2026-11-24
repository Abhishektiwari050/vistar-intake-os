import { describe, it, expect, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import sharp from 'sharp';
import {
  sanitizeSpreadsheetBuffer,
  generateHeaderFingerprint,
  normalizeHeaderToken,
} from '@/lib/excel/sanitizer';
import { normalizeCell } from '@/lib/triage/normalizer';
import { healAndLinkAssets } from '@/lib/media/healer';
import {
  compileAssetZipBuffer,
  compileCsvText,
  compileExcelBuffer,
  compileJsonExport,
  compileMarkdownSpec,
  compileSqlScript,
  sanitizeSpreadsheetValue,
} from '@/lib/export/compilers';
import { generateClientFollowUp } from '@/lib/export/chaser';
import { resetTestDbSingleton } from '@/lib/db/client';
import { getBlueprintBySlug, runIntakePipeline } from '@/lib/pipeline/run-intake';
import type { Blueprint, NormalizedRow } from '@/lib/types/intake';
import JSZip from 'jszip';

async function makeColorBox(color: { r: number; g: number; b: number }, w = 200, h = 120): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 3, background: color },
  })
    .png()
    .toBuffer();
}

describe('Security & Production Edge Cases Suite', () => {
  beforeEach(() => {
    resetTestDbSingleton();
  });

  it('SEC-6 & Corrupt Excel: bounds 1M-row merged templates and rejects 0-byte/corrupt spreadsheets cleanly', () => {
    expect(() => sanitizeSpreadsheetBuffer(Buffer.alloc(0))).toThrow(/empty/i);
    // Test malicious PK zip header corruption
    expect(() => sanitizeSpreadsheetBuffer(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff]))).toThrow(
      /corrupted|unreadable/i
    );

    // Merged cell range extending to row 1,048,575 must clamp without hanging or OOM
    const ws = XLSX.utils.aoa_to_sheet([
      ['MERGED BANNER', '', ''],
      ['SKU', 'Price', 'Stock'],
      ['SKU-1', '500', '10'],
    ]);
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 1048575, c: 16383 } }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

    const result = sanitizeSpreadsheetBuffer(buf);
    expect(result.rows.length).toBe(1);
    expect(result.rows[0]['SKU']).toBe('SKU-1');
  });

  it('Unicode & Duplicate Headers: non-Latin headers retain distinct SHA-256 fingerprints and avoid collisions', () => {
    expect(normalizeHeaderToken('उत्पाद_नाम')).toBe('उत्पाद_नाम');
    expect(normalizeHeaderToken('商品名称')).toBe('商品名称');

    const fpHindi = generateHeaderFingerprint(['उत्पाद_नाम', 'कीमत']);
    const fpChinese = generateHeaderFingerprint(['商品名称', '价格']);
    expect(fpHindi).not.toBe(fpChinese);

    const csv = Buffer.from('Price,Price_2,Price\n100,200,300', 'utf8');
    const sanitized = sanitizeSpreadsheetBuffer(csv);
    expect(sanitized.headers).toEqual(['Price', 'Price_2', 'Price_3']);
  });

  it('Normalizer Edge Cases: flags negative currency, handles crores, rejects symbol-only SKU & javascript URLs', () => {
    const neg = normalizeCell('-1499', {
      key: 'price',
      label: 'Price',
      type: 'currency',
      required: true,
      aliases: [],
    });
    expect(neg.status).toBe('invalid_format');

    const acctNeg = normalizeCell('(500)', {
      key: 'price',
      label: 'Price',
      type: 'currency',
      required: true,
      aliases: [],
    });
    expect(acctNeg.status).toBe('invalid_format');

    const crore = normalizeCell('1.5 Cr', {
      key: 'price',
      label: 'Price',
      type: 'currency',
      required: true,
      aliases: [],
    });
    expect(crore.value).toBe(15000000);

    const badSku = normalizeCell('###', {
      key: 'sku',
      label: 'SKU',
      type: 'sku',
      required: true,
      aliases: [],
    });
    expect(badSku.status).toBe('invalid_format');

    const xssUrl = normalizeCell('javascript:alert(1)', {
      key: 'website',
      label: 'Website',
      type: 'url',
      required: true,
      aliases: [],
    });
    expect(xssUrl.status).toBe('invalid_format');

    const badGstState = normalizeCell('00AABCU9603R1ZM', {
      key: 'gst',
      label: 'GSTIN',
      type: 'gstin',
      required: true,
      aliases: [],
    });
    expect(badGstState.status).toBe('invalid_format');
  });

  it('REL-1 & SEC-7 & SKU Collision: isolates corrupt images, avoids empty-SKU match, preserves color variants, and suffixes ZIP collisions', async () => {
    const redImg = await makeColorBox({ r: 220, g: 30, b: 30 });
    const blueImg = await makeColorBox({ r: 30, g: 60, b: 220 });
    const corruptBuf = Buffer.from('not-a-valid-image-buffer');

    const rows: NormalizedRow[] = [
      {
        rowIndex: 0,
        rowId: 'row_1',
        cells: {
          sku: { value: 'SKU-101', originalRaw: 'SKU-101', status: 'verified', confidence: 1 },
          title: { value: 'Cotton Tee', originalRaw: 'Cotton Tee', status: 'verified', confidence: 1 },
        },
        linkedAssetIds: [],
        isRowVerified: true,
        pendingApproval: false,
      },
      {
        rowIndex: 1,
        rowId: 'row_2',
        cells: {
          sku: { value: '-', originalRaw: '-', status: 'verified', confidence: 1 },
          title: { value: 'Empty Placeholder', originalRaw: '-', status: 'verified', confidence: 1 },
        },
        linkedAssetIds: [],
        isRowVerified: true,
        pendingApproval: false,
      },
    ];

    const res = await healAndLinkAssets(
      [
        { filename: 'sku_101_front.png', buffer: redImg, mimeType: 'image/png' },
        { filename: 'sku_101_side.png', buffer: blueImg, mimeType: 'image/png' },
        { filename: 'corrupt_file.jpg', buffer: corruptBuf, mimeType: 'image/jpeg' },
      ],
      rows,
      {
        minWidth: 100,
        minHeight: 100,
        targetWidth: 1080,
        targetHeight: 1080,
        aspectRatio: '1:1',
        outputFormat: 'webp',
        deduplicateByHash: true,
        autoHealOffRatio: true,
      }
    );

    expect(res.corruptAssetsCount).toBe(1);
    expect(res.duplicatesRemoved).toBe(0); // Red vs Blue must NOT collide
    const valid = res.assets.filter((a) => !a.error);
    expect(valid.length).toBe(2);
    expect(valid[0].linkedRowId).toBe('row_1');
    expect(valid[1].linkedRowId).toBe('row_1');
    expect(valid[0].healedFilename).toBe('SKU-101-cotton-tee.webp');
    expect(valid[1].healedFilename).toBe('SKU-101-cotton-tee-2.webp'); // Unique ZIP filename

    // Ensure ZIP retains BOTH images cleanly
    const blueprint = (await getBlueprintBySlug('shopify-d2c-catalog'))!;
    const zipBuf = await compileAssetZipBuffer(rows, blueprint, res.assets, 'Test');
    const loadedZip = await JSZip.loadAsync(zipBuf);
    const filesInFolder = Object.keys(loadedZip.files);
    expect(filesInFolder).toContain('01_Verified_Assets/SKU-101-cotton-tee.webp');
    expect(filesInFolder).toContain('01_Verified_Assets/SKU-101-cotton-tee-2.webp');
  });

  it('SEC-1, SEC-2, SEC-5: SQL identifier quoting, formula injection escaping, and Markdown XSS neutralization', () => {
    expect(sanitizeSpreadsheetValue("=cmd|'/C calc'!A0")).toBe("'=cmd|'/C calc'!A0");
    expect(sanitizeSpreadsheetValue('+HYPERLINK("http://evil.com")')).toBe(
      '\'+HYPERLINK("http://evil.com")'
    );

    const maliciousBp: Blueprint = {
      id: 'bp-1',
      slug: 'test',
      name: 'Test',
      description: 'Test',
      targetType: 'ecommerce_catalog',
      sqlTableName: 'bad; DROP TABLE users;--',
      schemaRules: [{ key: 'title', label: 'Title', type: 'string', required: true, aliases: [] }],
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
      createdAt: new Date().toISOString(),
    };

    const sampleRows: NormalizedRow[] = [
      {
        rowIndex: 0,
        rowId: 'row_1',
        cells: {
          title: { value: '=1+1', originalRaw: '=1+1', status: 'verified', confidence: 1 },
        },
        linkedAssetIds: [],
        isRowVerified: true,
        pendingApproval: false,
      },
    ];

    expect(() => compileSqlScript(sampleRows, maliciousBp, [], true)).toThrow(/Invalid SQL identifier/);

    const safeBp = { ...maliciousBp, sqlTableName: 'safe_products' };
    const sql = compileSqlScript(sampleRows, safeBp, [], true);
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "safe_products"');

    const csv = compileCsvText(sampleRows, safeBp, [], true);
    expect(csv).toContain("'=1+1");

    const md = compileMarkdownSpec(sampleRows, safeBp, [], '<script>alert(1)</script>', true);
    expect(md).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(md).not.toContain('<script>');

    const json = compileJsonExport(sampleRows, safeBp, [], 'Client', 'sub-1', true);
    expect(JSON.parse(json).records[0].data.title).toBe('=1+1');

    const xlsx = compileExcelBuffer(sampleRows, safeBp, [], true);
    expect(xlsx.length).toBeGreaterThan(200);
  });

  it('Client Follow-Up Generator compiles missing items report cleanly', async () => {
    const sub = await runIntakePipeline({
      blueprintSlug: 'shopify-d2c-catalog',
      clientName: 'Chaser Test Brand',
      rawText: 'sku,title,price,stock\nSKU-1,Valid Shirt,500,10\nSKU-2,Missing Stock Shirt,900,',
    });
    const bp = (await getBlueprintBySlug('shopify-d2c-catalog'))!;
    const report = generateClientFollowUp(sub, bp, 'https://intake.vistar.tech/123');

    expect(report.completionPercent).toBe(50);
    expect(report.missingItems.length).toBe(1);
    expect(report.missingItems[0].identifier).toBe('SKU-2');
    expect(report.whatsappText).toContain('50% verified');
    expect(report.emailText).toContain('Missing Inventory Qty');
  });
});
