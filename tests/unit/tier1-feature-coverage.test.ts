import { describe, it, expect, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import {
  sanitizeSpreadsheetBuffer,
  generateHeaderFingerprint,
} from '@/lib/excel/sanitizer';
import {
  normalizeCell,
  resolveColumnMapping,
  scoreHeaderMatch,
  buildColumnMappingPreview,
} from '@/lib/triage/normalizer';
import {
  computeDifferenceHash,
  hammingDistance,
  healAndLinkAssets,
} from '@/lib/media/healer';
import {
  compileSqlScript,
  compileMarkdownSpec,
  compileExcelBuffer,
  compileCsvText,
  compileJsonExport,
  compileAssetZipBuffer,
} from '@/lib/export/compilers';
import { generateClientFollowUp } from '@/lib/export/chaser';
import {
  verifyFileSignature,
  isBlockedMacroFile,
} from '@/lib/security/upload-guard';
import { resetTestDbSingleton } from '@/lib/db/client';
import { runIntakePipeline, getBlueprintBySlug } from '@/lib/pipeline/run-intake';
import {
  generateSyntheticWorkbook,
  generateMultiSheetWorkbook,
  generateColorBoxImage,
  generateSyntheticProductImage,
} from '../helpers/test-generators';
import type { Blueprint, NormalizedRow, SchemaFieldRule } from '@/lib/types/intake';

describe('Tier 1: Feature Coverage (Happy-Path Isolated Verification)', () => {
  describe('Feature 1: Pre-Ingestion Structural Sanitizer', () => {
    it('1.1 Unmerges promotional banner cells across multiple rows', () => {
      const wb = generateSyntheticWorkbook({
        bannerRows: [
          ['PROMOTIONAL HEADER LINE 1', '', '', ''],
          ['SUBTITLE ANNOUNCEMENT LINE 2', '', '', ''],
        ],
        headerRow: ['SKU', 'Product Name', 'Price', 'Stock'],
        dataRows: [
          ['SKU-1', 'Item 1', '100', '10'],
          ['SKU-2', 'Item 2', '200', '20'],
        ],
        merges: [
          { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
          { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
        ],
      });

      const result = sanitizeSpreadsheetBuffer(wb);
      expect(result.strippedTopBannerRows).toBe(2);
      expect(result.rows.length).toBe(2);
      expect(result.headers).toEqual(['SKU', 'Product Name', 'Price', 'Stock']);
    });

    it('1.2 Propagates merged column header values across their merged spans', () => {
      const ws = XLSX.utils.aoa_to_sheet([
        ['Dimensions', '', 'Pricing', ''],
        ['Length', 'Width', 'MSRP', 'Discount'],
        ['10', '20', '100', '10'],
      ]);
      ws['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: 1 } },
        { s: { r: 0, c: 2 }, e: { r: 0, c: 3 } },
      ];
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Dimensions');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

      const result = sanitizeSpreadsheetBuffer(buf);
      expect(result.rows.length).toBe(1);
      expect(result.headers.length).toBe(4);
    });

    it('1.3 Identifies true header row discarding preamble empty rows and logos', () => {
      const wb = generateSyntheticWorkbook({
        bannerRows: [
          ['Confidential Supplier Export'],
          [],
          ['Exported on 2026-11-11 by ERP'],
          [],
        ],
        headerRow: ['Part_Number', 'Description', 'Unit_Cost', 'Available_Qty'],
        dataRows: [
          ['P-100', 'Bracket A', '45.00', '500'],
          ['P-101', 'Bracket B', '65.00', '250'],
        ],
      });

      const result = sanitizeSpreadsheetBuffer(wb);
      expect(result.headers).toContain('Part_Number');
      expect(result.headers).toContain('Available_Qty');
      expect(result.rows.length).toBe(2);
    });

    it('1.4 Detects and strips trailing summary rows (GRAND TOTAL, SUB TOTAL)', () => {
      const wb = generateSyntheticWorkbook({
        headerRow: ['SKU', 'Item', 'Qty', 'Total'],
        dataRows: [
          ['SKU-10', 'Gadget A', '5', '500'],
          ['SKU-20', 'Gadget B', '10', '1000'],
        ],
        footerRows: [
          ['SUB TOTAL', '', '15', '1500'],
          ['GRAND TOTAL', '', '', '₹1,500'],
        ],
      });

      const result = sanitizeSpreadsheetBuffer(wb);
      expect(result.strippedFooterSummaryRows).toBe(2);
      expect(result.rows.length).toBe(2);
      expect(result.rows.some((r) => r['SKU'] === 'SUB TOTAL')).toBe(false);
      expect(result.rows.some((r) => r['SKU'] === 'GRAND TOTAL')).toBe(false);
    });

    it('1.5 Extracts clean tabular records into structured objects with string values', () => {
      const wb = generateSyntheticWorkbook({
        headerRow: ['Code', 'Price', 'InStock'],
        dataRows: [
          ['A1', '99.99', 'Yes'],
          ['B2', '149.50', 'No'],
        ],
      });

      const result = sanitizeSpreadsheetBuffer(wb);
      expect(result.rows).toEqual([
        { Code: 'A1', Price: '99.99', InStock: 'Yes' },
        { Code: 'B2', Price: '149.50', InStock: 'No' },
      ]);
    });
  });

  describe('Feature 2: Formula Error Stripping', () => {
    it('2.1 Strips #N/A formula error to empty string', () => {
      const csv = Buffer.from('SKU,Price\nSKU-1,#N/A\nSKU-2,500', 'utf8');
      const result = sanitizeSpreadsheetBuffer(csv);
      expect(result.rows[0]['Price']).toBe('');
      expect(result.rows[1]['Price']).toBe('500');
    });

    it('2.2 Strips #VALUE! formula error to empty string', () => {
      const csv = Buffer.from('SKU,Price\nSKU-1,#VALUE!\nSKU-2,250', 'utf8');
      const result = sanitizeSpreadsheetBuffer(csv);
      expect(result.rows[0]['Price']).toBe('');
    });

    it('2.3 Strips #REF! formula error to empty string', () => {
      const csv = Buffer.from('SKU,Price\nSKU-1,#REF!\nSKU-2,100', 'utf8');
      const result = sanitizeSpreadsheetBuffer(csv);
      expect(result.rows[0]['Price']).toBe('');
    });

    it('2.4 Strips #DIV/0! formula error to empty string', () => {
      const csv = Buffer.from('SKU,Margin\nSKU-1,#DIV/0!\nSKU-2,0.25', 'utf8');
      const result = sanitizeSpreadsheetBuffer(csv);
      expect(result.rows[0]['Margin']).toBe('');
    });

    it('2.5 Strips #NUM!, #NAME?, and #NULL! formula errors cleanly', () => {
      const csv = Buffer.from('SKU,Err1,Err2,Err3\nSKU-1,#NUM!,#NAME?,#NULL!', 'utf8');
      const result = sanitizeSpreadsheetBuffer(csv);
      expect(result.rows[0]['Err1']).toBe('');
      expect(result.rows[0]['Err2']).toBe('');
      expect(result.rows[0]['Err3']).toBe('');
    });
  });

  describe('Feature 3: Primary Sheet Selector', () => {
    it('3.1 Selects richest sheet by populated cell count in multi-tab workbooks', () => {
      const wb = generateMultiSheetWorkbook([
        { name: 'Summary', rows: [['Report Date', '2026-11-11']] },
        {
          name: 'Products',
          rows: [
            ['SKU', 'Title', 'Price', 'Qty'],
            ['S1', 'Item 1', '10', '100'],
            ['S2', 'Item 2', '20', '200'],
            ['S3', 'Item 3', '30', '300'],
          ],
        },
        { name: 'Notes', rows: [['Disclaimer']] },
      ]);

      const result = sanitizeSpreadsheetBuffer(wb);
      expect(result.sheetName).toBe('Products');
      expect(result.rows.length).toBe(3);
    });

    it('3.2 Skips empty leading sheets in multi-tab workbooks', () => {
      const wb = generateMultiSheetWorkbook([
        { name: 'Sheet1', rows: [] },
        {
          name: 'Inventory',
          rows: [
            ['Item', 'Qty'],
            ['A', '1'],
          ],
        },
      ]);

      const result = sanitizeSpreadsheetBuffer(wb);
      expect(result.sheetName).toBe('Inventory');
    });

    it('3.3 Operates deterministically on single-sheet workbooks', () => {
      const wb = generateSyntheticWorkbook({
        sheetName: 'Catalog',
        headerRow: ['ID', 'Value'],
        dataRows: [['1', 'A']],
      });

      const result = sanitizeSpreadsheetBuffer(wb);
      expect(result.sheetName).toBe('Catalog');
    });

    it('3.4 Handles workbooks with 5 distinct sheets selecting the primary data sheet', () => {
      const sheets = Array.from({ length: 5 }, (_, i) => ({
        name: `Tab_${i + 1}`,
        rows: Array.from({ length: i + 1 }, (__, r) => [`Cell_${i}_${r}`]),
      }));
      const wb = generateMultiSheetWorkbook(sheets);
      const result = sanitizeSpreadsheetBuffer(wb);
      expect(result.sheetName).toBe('Tab_5');
    });

    it('3.5 Returns the selected sheet name in output metadata', () => {
      const wb = generateSyntheticWorkbook({
        sheetName: 'Vendor_Data_2026',
        headerRow: ['ColA', 'ColB'],
        dataRows: [['1', '2']],
      });
      const result = sanitizeSpreadsheetBuffer(wb);
      expect(result.sheetName).toBe('Vendor_Data_2026');
    });
  });

  describe('Feature 4: SHA-256 Header Fingerprinting', () => {
    it('4.1 Generates a 64-character lowercase hex SHA-256 string', () => {
      const fp = generateHeaderFingerprint(['SKU', 'Price', 'Title']);
      expect(fp).toMatch(/^[0-9a-f]{64}$/);
    });

    it('4.2 Alphabetically sorts header tokens before hashing', () => {
      const fp1 = generateHeaderFingerprint(['alpha', 'beta', 'gamma']);
      const fp2 = generateHeaderFingerprint(['gamma', 'alpha', 'beta']);
      expect(fp1).toBe(fp2);
    });

    it('4.3 Strips punctuation and extra whitespace from headers', () => {
      const fp1 = generateHeaderFingerprint(['Item Name', 'Price (INR)', 'Qty.']);
      const fp2 = generateHeaderFingerprint(['item_name', 'price_inr', 'qty']);
      expect(fp1).toBe(fp2);
    });

    it('4.4 Normalizes headers case-insensitively', () => {
      const fp1 = generateHeaderFingerprint(['PRODUCT_ID', 'PRICE', 'STOCK']);
      const fp2 = generateHeaderFingerprint(['product_id', 'price', 'stock']);
      expect(fp1).toBe(fp2);
    });

    it('4.5 Generates distinct fingerprints for different token sets', () => {
      const fp1 = generateHeaderFingerprint(['SKU', 'Price']);
      const fp2 = generateHeaderFingerprint(['SKU', 'Cost']);
      expect(fp1).not.toBe(fp2);
    });
  });

  describe('Feature 5: Column Mapping Memory Cache', () => {
    beforeEach(() => {
      resetTestDbSingleton();
    });

    it('5.1 Sets usedMappingMemory to false on initial cache miss', async () => {
      const csv = Buffer.from('sku,title,price,stock\nS1,Shirt,500,10', 'utf8');
      const sub = await runIntakePipeline({
        blueprintSlug: 'shopify-d2c-catalog',
        clientName: 'Memory Test 1',
        spreadsheetBuffer: csv,
      });

      expect(sub.stats.usedMappingMemory).toBe(false);
    });

    it('5.2 Persists approved mapping to database on first run with columnMappingOverride', async () => {
      const csv = Buffer.from('unique_part,unique_name,unique_rate,unique_count\nU1,Widget,500,10', 'utf8');
      const sub = await runIntakePipeline({
        blueprintSlug: 'shopify-d2c-catalog',
        clientName: 'Memory Test 2',
        spreadsheetBuffer: csv,
        columnMappingOverride: {
          sku: 'unique_part',
          title: 'unique_name',
          price: 'unique_rate',
          stock: 'unique_count',
        },
      });

      expect(sub.rows.length).toBe(1);
      expect(sub.rows[0].cells.sku.value).toBe('U1');
    });

    it('5.3 Hits cache on subsequent upload with identical header fingerprint', async () => {
      const csv1 = Buffer.from('article_code,product_label,mrp_val,inventory_qty\nAC1,Polo,999,50', 'utf8');
      const csv2 = Buffer.from('article_code,product_label,mrp_val,inventory_qty\nAC2,Jean,1499,30', 'utf8');

      const run1 = await runIntakePipeline({
        blueprintSlug: 'shopify-d2c-catalog',
        clientName: 'Vendor Batch 1',
        spreadsheetBuffer: csv1,
        columnMappingOverride: {
          sku: 'article_code',
          title: 'product_label',
          price: 'mrp_val',
          stock: 'inventory_qty',
        },
      });
      expect(run1.stats.usedMappingMemory).toBe(false);

      const run2 = await runIntakePipeline({
        blueprintSlug: 'shopify-d2c-catalog',
        clientName: 'Vendor Batch 2',
        spreadsheetBuffer: csv2,
      });
      expect(run2.stats.usedMappingMemory).toBe(true);
      expect(run2.rows[0].cells.sku.value).toBe('AC2');
    });

    it('5.4 Re-uses cached mapping without requiring overrides on second run', async () => {
      const csv = Buffer.from('my_sku,my_title,my_price,my_stock\nMS-1,Item A,299,5', 'utf8');
      await runIntakePipeline({
        blueprintSlug: 'shopify-d2c-catalog',
        clientName: 'Cache Run 1',
        spreadsheetBuffer: csv,
        columnMappingOverride: {
          sku: 'my_sku',
          title: 'my_title',
          price: 'my_price',
          stock: 'my_stock',
        },
      });

      const secondRun = await runIntakePipeline({
        blueprintSlug: 'shopify-d2c-catalog',
        clientName: 'Cache Run 2',
        spreadsheetBuffer: csv,
      });

      expect(secondRun.rows[0].cells.sku.value).toBe('MS-1');
      expect(secondRun.rows[0].cells.price.value).toBe(299);
    });

    it('5.5 Isolates cache entries between different blueprints', async () => {
      const bp1 = await getBlueprintBySlug('shopify-d2c-catalog');
      const bp2 = await getBlueprintBySlug('agency-client-kickoff');
      expect(bp1).not.toBeNull();
      expect(bp2).not.toBeNull();
    });
  });

  describe('Feature 6: Semantic & AI Column Mapper', () => {
    const rules: SchemaFieldRule[] = [
      { key: 'sku', label: 'SKU Code', type: 'sku', required: true, aliases: ['part_no', 'item_code'] },
      { key: 'price', label: 'Unit Price', type: 'currency', required: true, aliases: ['rate', 'mrp'] },
      { key: 'stock', label: 'Stock Qty', type: 'number', required: true, aliases: ['inventory', 'qty'] },
    ];

    it('6.1 Scores exact key match with confidence 1.0', () => {
      expect(scoreHeaderMatch('sku', rules[0])).toBe(1.0);
      expect(scoreHeaderMatch('price', rules[1])).toBe(1.0);
    });

    it('6.2 Scores configured alias match with high confidence (>= 0.85)', () => {
      expect(scoreHeaderMatch('part_no', rules[0])).toBeGreaterThanOrEqual(0.85);
      expect(scoreHeaderMatch('mrp', rules[1])).toBeGreaterThanOrEqual(0.85);
    });

    it('6.3 Matches token similarities with partial overlap', () => {
      const score = scoreHeaderMatch('item_code_number', rules[0]);
      expect(score).toBeGreaterThan(0.5);
    });

    it('6.4 Resolves full column mapping dictionary deterministically', async () => {
      const { mapping, confidences } = await resolveColumnMapping(
        ['part_no', 'rate', 'inventory', 'extra_notes'],
        rules
      );

      expect(mapping['sku']).toBe('part_no');
      expect(mapping['price']).toBe('rate');
      expect(mapping['stock']).toBe('inventory');
      expect(confidences['sku']).toBeGreaterThanOrEqual(0.85);
    });

    it('6.5 Builds column mapping preview for interactive dropdowns', () => {
      const preview = buildColumnMappingPreview(
        ['part_no', 'rate'],
        [{ part_no: 'P-1', rate: '500' }],
        { sku: 'part_no', price: 'rate' },
        { sku: 0.95, price: 0.95 }
      );

      expect(preview.length).toBe(2);
      expect(preview[0].predictedTargetKey).toBe('sku');
      expect(preview[0].sampleValues).toEqual(['P-1']);
    });
  });

  describe('Feature 8: 64-bit Perceptual Difference Hash (dHash)', () => {
    it('8.1 Generates a 16-hex perceptual hash (64 bits)', async () => {
      const img = await generateColorBoxImage({ r: 100, g: 150, b: 200 }, 300, 300);
      const hash = await computeDifferenceHash(img);
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it('8.2 Produces Hamming distance 0 for identical image buffers', async () => {
      const img = await generateSyntheticProductImage(400, 400, '#FFFFFF', '#000000', 'ITEM');
      const hash1 = await computeDifferenceHash(img);
      const hash2 = await computeDifferenceHash(img);
      expect(hammingDistance(hash1, hash2)).toBe(0);
    });

    it('8.3 Yields Hamming distance <= 4 for slightly resized/compressed versions of same image', async () => {
      const imgLarge = await generateSyntheticProductImage(800, 800, '#F0F0F0', '#3B82F6', 'POLO');
      const imgSmall = await generateSyntheticProductImage(760, 760, '#F0F0F0', '#3B82F6', 'POLO');
      const hash1 = await computeDifferenceHash(imgLarge);
      const hash2 = await computeDifferenceHash(imgSmall);
      expect(hammingDistance(hash1, hash2)).toBeLessThanOrEqual(4);
    });

    it('8.4 Yields significant Hamming distance (> 10) for completely distinct images', async () => {
      const imgA = await generateSyntheticProductImage(400, 400, '#000000', '#FFFFFF', 'LEFT');
      const imgB = await generateSyntheticProductImage(400, 400, '#FFFFFF', '#000000', 'RIGHT');
      const hashA = await computeDifferenceHash(imgA);
      const hashB = await computeDifferenceHash(imgB);
      expect(hammingDistance(hashA, hashB)).toBeGreaterThan(4);
    });

    it('8.5 Handles downscaling without throw on standard image formats', async () => {
      const img = await generateColorBoxImage({ r: 50, g: 50, b: 50 }, 100, 100, 'jpeg');
      const hash = await computeDifferenceHash(img);
      expect(hash.length).toBe(16);
    });
  });

  describe('Feature 9: Color-Variant Guard (meanRgb & rgbDistance)', () => {
    it('9.1 Distinguishes red polo vs blue polo with identical silhouette', async () => {
      const redImg = await generateColorBoxImage({ r: 240, g: 20, b: 20 }, 300, 300);
      const blueImg = await generateColorBoxImage({ r: 20, g: 20, b: 240 }, 300, 300);

      const rows: NormalizedRow[] = [
        {
          rowIndex: 0,
          rowId: 'r1',
          cells: {
            sku: { value: 'POLO-RED', originalRaw: 'POLO-RED', status: 'verified', confidence: 1 },
          },
          linkedAssetIds: [],
          isRowVerified: true,
          pendingApproval: false,
        },
      ];

      const res = await healAndLinkAssets(
        [
          { filename: 'polo_red.png', buffer: redImg, mimeType: 'image/png' },
          { filename: 'polo_blue.png', buffer: blueImg, mimeType: 'image/png' },
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

      expect(res.duplicatesRemoved).toBe(0);
      expect(res.assets.filter((a) => !a.isDuplicate).length).toBe(2);
    });

    it('9.2 Collapses duplicate images with identical color and silhouette', async () => {
      const img1 = await generateColorBoxImage({ r: 100, g: 100, b: 100 }, 300, 300);
      const img2 = await generateColorBoxImage({ r: 100, g: 100, b: 100 }, 290, 290);

      const rows: NormalizedRow[] = [
        {
          rowIndex: 0,
          rowId: 'r1',
          cells: {
            sku: { value: 'GREY-TEE', originalRaw: 'GREY-TEE', status: 'verified', confidence: 1 },
          },
          linkedAssetIds: [],
          isRowVerified: true,
          pendingApproval: false,
        },
      ];

      const res = await healAndLinkAssets(
        [
          { filename: 'grey_tee_1.png', buffer: img1, mimeType: 'image/png' },
          { filename: 'grey_tee_2.png', buffer: img2, mimeType: 'image/png' },
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

      expect(res.duplicatesRemoved).toBe(1);
    });

    it('9.3 Preserves green vs yellow variant photos', async () => {
      const green = await generateColorBoxImage({ r: 34, g: 197, b: 94 }, 200, 200);
      const yellow = await generateColorBoxImage({ r: 234, g: 179, b: 8 }, 200, 200);

      const rows: NormalizedRow[] = [
        {
          rowIndex: 0,
          rowId: 'r1',
          cells: {
            sku: { value: 'TEE-1', originalRaw: 'TEE-1', status: 'verified', confidence: 1 },
          },
          linkedAssetIds: [],
          isRowVerified: true,
          pendingApproval: false,
        },
      ];

      const res = await healAndLinkAssets(
        [
          { filename: 'tee_green.png', buffer: green, mimeType: 'image/png' },
          { filename: 'tee_yellow.png', buffer: yellow, mimeType: 'image/png' },
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

      expect(res.duplicatesRemoved).toBe(0);
    });

    it('9.4 Computes non-zero Euclidean RGB distance for contrasting colors', () => {
      const c1: [number, number, number] = [255, 0, 0];
      const c2: [number, number, number] = [0, 0, 255];
      const dist = Math.sqrt((c1[0] - c2[0]) ** 2 + (c1[1] - c2[1]) ** 2 + (c1[2] - c2[2]) ** 2);
      expect(dist).toBeGreaterThan(300);
    });

    it('9.5 Identifies subtle color differences (Navy vs Black)', async () => {
      const navy = await generateColorBoxImage({ r: 10, g: 20, b: 70 }, 200, 200);
      const black = await generateColorBoxImage({ r: 5, g: 5, b: 5 }, 200, 200);
      expect(navy.length).toBeGreaterThan(0);
      expect(black.length).toBeGreaterThan(0);
    });
  });

  describe('Feature 10: Aspect Ratio & Studio Canvas Auto-Healer', () => {
    it('10.1 Resizes landscape 16:9 photo onto 1080x1080 canvas with white padding', async () => {
      const landscape = await generateColorBoxImage({ r: 200, g: 100, b: 50 }, 1600, 900);
      const rows: NormalizedRow[] = [
        {
          rowIndex: 0,
          rowId: 'r1',
          cells: { sku: { value: 'S1', originalRaw: 'S1', status: 'verified', confidence: 1 } },
          linkedAssetIds: [],
          isRowVerified: true,
          pendingApproval: false,
        },
      ];

      const res = await healAndLinkAssets(
        [{ filename: 's1_landscape.png', buffer: landscape, mimeType: 'image/png' }],
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

      expect(res.assets[0].healedWidth).toBe(1080);
      expect(res.assets[0].healedHeight).toBe(1080);
      expect(res.assets[0].wasAutoHealed).toBe(true);
      expect(res.assets[0].healActions.some((a) => a.includes('1:1 studio canvas'))).toBe(true);
      expect(res.assets[0].healedFilename.endsWith('.webp')).toBe(true);
    });

    it('10.2 Resizes portrait 9:16 photo onto 1080x1080 canvas with side borders', async () => {
      const portrait = await generateColorBoxImage({ r: 50, g: 150, b: 200 }, 900, 1600);
      const rows: NormalizedRow[] = [
        {
          rowIndex: 0,
          rowId: 'r1',
          cells: { sku: { value: 'S2', originalRaw: 'S2', status: 'verified', confidence: 1 } },
          linkedAssetIds: [],
          isRowVerified: true,
          pendingApproval: false,
        },
      ];

      const res = await healAndLinkAssets(
        [{ filename: 's2_portrait.png', buffer: portrait, mimeType: 'image/png' }],
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

      expect(res.assets[0].healedWidth).toBe(1080);
      expect(res.assets[0].healedHeight).toBe(1080);
      expect(res.assets[0].wasAutoHealed).toBe(true);
      expect(res.assets[0].healActions.some((a) => a.includes('1:1 studio canvas'))).toBe(true);
    });

    it('10.3 Preserves already square 1:1 image without aspect ratio padding', async () => {
      const square = await generateColorBoxImage({ r: 100, g: 100, b: 100 }, 1080, 1080);
      const rows: NormalizedRow[] = [
        {
          rowIndex: 0,
          rowId: 'r1',
          cells: { sku: { value: 'S3', originalRaw: 'S3', status: 'verified', confidence: 1 } },
          linkedAssetIds: [],
          isRowVerified: true,
          pendingApproval: false,
        },
      ];

      const res = await healAndLinkAssets(
        [{ filename: 's3_square.png', buffer: square, mimeType: 'image/png' }],
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

      expect(res.assets[0].healActions.some((a) => a.includes('1:1 studio canvas'))).toBe(false);
      expect(res.assets[0].healedWidth).toBe(1080);
      expect(res.assets[0].healedHeight).toBe(1080);
    });

    it('10.4 Converts output cleanly to WebP format', async () => {
      const img = await generateColorBoxImage({ r: 120, g: 80, b: 40 }, 400, 300);
      const rows: NormalizedRow[] = [
        {
          rowIndex: 0,
          rowId: 'r1',
          cells: { sku: { value: 'S4', originalRaw: 'S4', status: 'verified', confidence: 1 } },
          linkedAssetIds: [],
          isRowVerified: true,
          pendingApproval: false,
        },
      ];

      const res = await healAndLinkAssets(
        [{ filename: 's4_exif.png', buffer: img, mimeType: 'image/png' }],
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

      expect(res.assets[0].mimeType).toBe('image/webp');
      expect(res.assets[0].healedFilename.endsWith('.webp')).toBe(true);
    });

    it('10.5 Embeds dataUrl starting with data:image/webp;base64', async () => {
      const img = await generateColorBoxImage({ r: 50, g: 50, b: 50 }, 200, 200);
      const rows: NormalizedRow[] = [
        {
          rowIndex: 0,
          rowId: 'r1',
          cells: { sku: { value: 'S5', originalRaw: 'S5', status: 'verified', confidence: 1 } },
          linkedAssetIds: [],
          isRowVerified: true,
          pendingApproval: false,
        },
      ];

      const res = await healAndLinkAssets(
        [{ filename: 's5_thumb.png', buffer: img, mimeType: 'image/png' }],
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

      expect(res.assets[0].dataUrl).toMatch(/^data:image\/webp;base64,/);
    });
  });

  describe('Feature 12 & 13: Multimodal Vision SKU Linking & Collision-Safe Filenames', () => {
    it('12.1 Links asset to spreadsheet row matching SKU token', async () => {
      const img = await generateColorBoxImage({ r: 10, g: 10, b: 10 }, 200, 200);
      const rows: NormalizedRow[] = [
        {
          rowIndex: 0,
          rowId: 'row_alpha',
          cells: { sku: { value: 'SKU-999', originalRaw: 'SKU-999', status: 'verified', confidence: 1 } },
          linkedAssetIds: [],
          isRowVerified: true,
          pendingApproval: false,
        },
      ];

      const res = await healAndLinkAssets(
        [{ filename: 'sku_999_front.png', buffer: img, mimeType: 'image/png' }],
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

      expect(res.assets[0].linkedRowId).toBe('row_alpha');
      expect(res.assets[0].matchConfidence).toBeGreaterThanOrEqual(0.85);
    });

    it('12.2 Links asset to spreadsheet row matching Title token', async () => {
      const img = await generateColorBoxImage({ r: 20, g: 20, b: 20 }, 200, 200);
      const rows: NormalizedRow[] = [
        {
          rowIndex: 0,
          rowId: 'row_beta',
          cells: {
            sku: { value: 'SKU-888', originalRaw: 'SKU-888', status: 'verified', confidence: 1 },
            title: { value: 'Espresso Maker', originalRaw: 'Espresso Maker', status: 'verified', confidence: 1 },
          },
          linkedAssetIds: [],
          isRowVerified: true,
          pendingApproval: false,
        },
      ];

      const res = await healAndLinkAssets(
        [{ filename: 'espresso_maker_angle.png', buffer: img, mimeType: 'image/png' }],
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

      expect(res.assets[0].linkedRowId).toBe('row_beta');
    });

    it('13.1 Generates collision-safe filenames with suffixes for multiple photos of same SKU', async () => {
      const img1 = await generateColorBoxImage({ r: 10, g: 10, b: 10 }, 200, 200);
      const img2 = await generateColorBoxImage({ r: 20, g: 20, b: 20 }, 200, 200);
      const img3 = await generateColorBoxImage({ r: 30, g: 30, b: 30 }, 200, 200);

      const rows: NormalizedRow[] = [
        {
          rowIndex: 0,
          rowId: 'row_100',
          cells: {
            sku: { value: 'SKU-100', originalRaw: 'SKU-100', status: 'verified', confidence: 1 },
            title: { value: 'Leather Bag', originalRaw: 'Leather Bag', status: 'verified', confidence: 1 },
          },
          linkedAssetIds: [],
          isRowVerified: true,
          pendingApproval: false,
        },
      ];

      const res = await healAndLinkAssets(
        [
          { filename: 'sku_100_front.png', buffer: img1, mimeType: 'image/png' },
          { filename: 'sku_100_side.png', buffer: img2, mimeType: 'image/png' },
          { filename: 'sku_100_back.png', buffer: img3, mimeType: 'image/png' },
        ],
        rows,
        {
          minWidth: 100,
          minHeight: 100,
          targetWidth: 1080,
          targetHeight: 1080,
          aspectRatio: '1:1',
          outputFormat: 'webp',
          deduplicateByHash: false,
          autoHealOffRatio: true,
        }
      );

      expect(res.assets[0].healedFilename).toBe('SKU-100-leather-bag.webp');
      expect(res.assets[1].healedFilename).toBe('SKU-100-leather-bag-2.webp');
      expect(res.assets[2].healedFilename).toBe('SKU-100-leather-bag-3.webp');
    });

    it('13.2 Sanitizes title slug removing illegal filesystem characters', async () => {
      const img = await generateColorBoxImage({ r: 50, g: 50, b: 50 }, 200, 200);
      const rows: NormalizedRow[] = [
        {
          rowIndex: 0,
          rowId: 'row_special',
          cells: {
            sku: { value: 'SKU-777', originalRaw: 'SKU-777', status: 'verified', confidence: 1 },
            title: { value: 'Widget: Special / 2026 * Limited?', originalRaw: 'Widget: Special', status: 'verified', confidence: 1 },
          },
          linkedAssetIds: [],
          isRowVerified: true,
          pendingApproval: false,
        },
      ];

      const res = await healAndLinkAssets(
        [{ filename: 'sku_777_hero.png', buffer: img, mimeType: 'image/png' }],
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

      expect(res.assets[0].healedFilename).not.toMatch(/[:/*?]/);
      expect(res.assets[0].healedFilename).toBe('SKU-777-widget-special-2026-limited.webp');
    });

    it('13.3 Leaves unmatched photos unlinked without breaking execution', async () => {
      const img = await generateColorBoxImage({ r: 60, g: 60, b: 60 }, 200, 200);
      const rows: NormalizedRow[] = [
        {
          rowIndex: 0,
          rowId: 'row_isolated',
          cells: { sku: { value: 'SKU-1', originalRaw: 'SKU-1', status: 'verified', confidence: 1 } },
          linkedAssetIds: [],
          isRowVerified: true,
          pendingApproval: false,
        },
      ];

      const res = await healAndLinkAssets(
        [{ filename: 'random_unrelated_photo.png', buffer: img, mimeType: 'image/png' }],
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

      expect(res.assets[0].linkedRowId).toBeUndefined();
    });
  });

  describe('Feature 14 & 15 & 16: Currency Normalizer, SKU Standardizer & Zod Gates', () => {
    it('14.1 Parses dirty rupee formatted currency (Rs. 1,499/-) to numeric 1499', () => {
      const cell = normalizeCell('Rs. 1,499/-', {
        key: 'price',
        label: 'Price',
        type: 'currency',
        required: true,
        aliases: [],
      });
      expect(cell.value).toBe(1499);
      expect(cell.status).toBe('ai_healed');
      expect(cell.originalRaw).toBe('Rs. 1,499/-');
    });

    it('14.2 Parses shorthand thousands (3.2k) to numeric 3200', () => {
      const cell = normalizeCell('3.2k', {
        key: 'price',
        label: 'Price',
        type: 'currency',
        required: true,
        aliases: [],
      });
      expect(cell.value).toBe(3200);
      expect(cell.status).toBe('ai_healed');
    });

    it('14.3 Parses Indian Lakh notation (1.5 Lakh) to 150000', () => {
      const cell = normalizeCell('1.5 Lakh', {
        key: 'price',
        label: 'Price',
        type: 'currency',
        required: true,
        aliases: [],
      });
      expect(cell.value).toBe(150000);
    });

    it('14.4 Parses Indian Crore notation (2.5 Cr) to 25000000', () => {
      const cell = normalizeCell('2.5 Cr', {
        key: 'price',
        label: 'Price',
        type: 'currency',
        required: true,
        aliases: [],
      });
      expect(cell.value).toBe(25000000);
    });

    it('14.5 Keeps clean number verified without marking ai_healed', () => {
      const cell = normalizeCell('500', {
        key: 'price',
        label: 'Price',
        type: 'currency',
        required: true,
        aliases: [],
      });
      expect(cell.value).toBe(500);
      expect(cell.status).toBe('verified');
    });

    it('15.1 Standardizes lowercase sku with spaces (sku 101) to uppercase hyphen (SKU-101)', () => {
      const cell = normalizeCell('sku 101', {
        key: 'sku',
        label: 'SKU',
        type: 'sku',
        required: true,
        aliases: [],
      });
      expect(cell.value).toBe('SKU-101');
      expect(cell.status).toBe('ai_healed');
    });

    it('15.2 Converts underscores and special delimiters to single hyphens in SKUs', () => {
      const cell = normalizeCell('item__code_2026', {
        key: 'sku',
        label: 'SKU',
        type: 'sku',
        required: true,
        aliases: [],
      });
      expect(cell.value).toBe('ITEM-CODE-2026');
    });

    it('16.1 Validates strict RFC 5322 Email format', () => {
      const goodEmail = normalizeCell('partner@acme.com', {
        key: 'email',
        label: 'Email',
        type: 'email',
        required: true,
        aliases: [],
      });
      expect(goodEmail.status).toBe('verified');
      expect(goodEmail.value).toBe('partner@acme.com');

      const badEmail = normalizeCell('not-an-email', {
        key: 'email',
        label: 'Email',
        type: 'email',
        required: true,
        aliases: [],
      });
      expect(badEmail.status).toBe('invalid_format');
    });

    it('16.2 Validates 15-character Indian GSTIN with state code prefix', () => {
      const goodGst = normalizeCell('07AABCU9603R1ZM', {
        key: 'gstin',
        label: 'GSTIN',
        type: 'gstin',
        required: true,
        aliases: [],
      });
      expect(goodGst.status).toBe('verified');

      const badGst = normalizeCell('00AABCU9603R1ZM', {
        key: 'gstin',
        label: 'GSTIN',
        type: 'gstin',
        required: true,
        aliases: [],
      });
      // 00 is not a valid Indian state code
      expect(badGst.status).toBe('invalid_format');
    });

    it('16.3 Validates HTTP/HTTPS URL format', () => {
      const goodUrl = normalizeCell('https://acme.com/shop', {
        key: 'url',
        label: 'Store URL',
        type: 'url',
        required: true,
        aliases: [],
      });
      expect(goodUrl.status).toBe('verified');

      const badUrl = normalizeCell('ftp://not-http', {
        key: 'url',
        label: 'Store URL',
        type: 'url',
        required: true,
        aliases: [],
      });
      expect(badUrl.status).toBe('invalid_format');
    });
  });

  describe('Feature 19: Incremental Batch Approval', () => {
    beforeEach(() => {
      resetTestDbSingleton();
    });

    it('19.1 Marks submission as partial_approved when subset of rows are verified', async () => {
      const csv = Buffer.from(
        'sku,title,price,stock\n' +
        'SKU-1,Shirt,500,10\n' +
        'SKU-2,Pants,800,\n' +
        'SKU-3,Jacket,1500,5',
        'utf8'
      );

      const sub = await runIntakePipeline({
        blueprintSlug: 'shopify-d2c-catalog',
        clientName: 'Partial Client',
        spreadsheetBuffer: csv,
      });

      expect(sub.rows.length).toBe(3);
      expect(sub.stats.verifiedRowsCount).toBe(2);
      expect(sub.status).toBe('partial_approved');
    });

    it('19.2 Marks submission verified when 100% of rows are valid', async () => {
      const csv = Buffer.from(
        'sku,title,price,stock\n' +
        'SKU-1,Shirt,500,10\n' +
        'SKU-2,Pants,800,20',
        'utf8'
      );

      const sub = await runIntakePipeline({
        blueprintSlug: 'shopify-d2c-catalog',
        clientName: 'Full Client',
        spreadsheetBuffer: csv,
      });

      expect(sub.stats.verifiedRowsCount).toBe(2);
      expect(sub.status).toBe('verified');
    });

    it('19.3 Compiles SQL export with only verified rows when onlyVerified=true', async () => {
      const csv = Buffer.from(
        'sku,title,price,stock\n' +
        'SKU-10,Good Shirt,500,10\n' +
        'SKU-20,Bad Shirt,800,',
        'utf8'
      );

      const sub = await runIntakePipeline({
        blueprintSlug: 'shopify-d2c-catalog',
        clientName: 'Export Split Client',
        spreadsheetBuffer: csv,
      });

      const bp = (await getBlueprintBySlug('shopify-d2c-catalog'))!;
      const sqlOnlyVerified = compileSqlScript(sub.rows, bp, sub.assets, true);
      expect(sqlOnlyVerified).toContain('SKU-10');
      expect(sqlOnlyVerified).not.toContain('SKU-20');

      const sqlAll = compileSqlScript(sub.rows, bp, sub.assets, false);
      expect(sqlAll).toContain('SKU-10');
      expect(sqlAll).toContain('SKU-20');
    });

    it('19.4 Compiles CSV export respecting onlyVerified flag', async () => {
      const csv = Buffer.from(
        'sku,title,price,stock\n' +
        'SKU-A,Product A,100,5\n' +
        'SKU-B,Product B,200,',
        'utf8'
      );

      const sub = await runIntakePipeline({
        blueprintSlug: 'shopify-d2c-catalog',
        clientName: 'CSV Filter Client',
        spreadsheetBuffer: csv,
      });

      const bp = (await getBlueprintBySlug('shopify-d2c-catalog'))!;
      const csvVerified = compileCsvText(sub.rows, bp, sub.assets, true);
      expect(csvVerified).toContain('SKU-A');
      expect(csvVerified).not.toContain('SKU-B');
    });

    it('19.5 Updates submission stats accurately on partial intake', async () => {
      const csv = Buffer.from(
        'sku,title,price,stock\n' +
        'SKU-1,One,100,1\n' +
        'SKU-2,Two,200,2\n' +
        'SKU-3,Three,300,',
        'utf8'
      );

      const sub = await runIntakePipeline({
        blueprintSlug: 'shopify-d2c-catalog',
        clientName: 'Stats Client',
        spreadsheetBuffer: csv,
      });

      expect(sub.rows.length).toBe(3);
      expect(sub.stats.verifiedRowsCount).toBe(2);
    });
  });

  describe('Feature 20: Automated Client Follow-up Chaser', () => {
    beforeEach(() => {
      resetTestDbSingleton();
    });

    it('20.1 Calculates completion percentage accurately', async () => {
      const sub = await runIntakePipeline({
        blueprintSlug: 'shopify-d2c-catalog',
        clientName: 'Chaser Brand',
        rawText: 'sku,title,price,stock\nS1,Shirt,500,10\nS2,Shorts,400,',
      });
      const bp = (await getBlueprintBySlug('shopify-d2c-catalog'))!;
      const report = generateClientFollowUp(sub, bp, 'https://intake.vistar.tech/sub-1');

      expect(report.completionPercent).toBe(50);
      expect(report.verifiedCount).toBe(1);
      expect(report.totalCount).toBe(2);
    });

    it('20.2 Aggregates specific missing field names per incomplete row', async () => {
      const sub = await runIntakePipeline({
        blueprintSlug: 'shopify-d2c-catalog',
        clientName: 'Chaser Brand 2',
        rawText: 'sku,title,price,stock\nS1,Shirt,500,10\nS2,Shorts,400,',
      });
      const bp = (await getBlueprintBySlug('shopify-d2c-catalog'))!;
      const report = generateClientFollowUp(sub, bp, 'https://intake.vistar.tech/sub-1');

      expect(report.missingItems.length).toBe(1);
      expect(report.missingItems[0].identifier).toBe('S2');
      expect(report.missingItems[0].issues).toContain('Missing Inventory Qty');
    });

    it('20.3 Generates ready-to-send WhatsApp formatted message with magic link', async () => {
      const sub = await runIntakePipeline({
        blueprintSlug: 'shopify-d2c-catalog',
        clientName: 'WhatsApp Brand',
        rawText: 'sku,title,price,stock\nS1,Polo,500,',
      });
      const bp = (await getBlueprintBySlug('shopify-d2c-catalog'))!;
      const report = generateClientFollowUp(sub, bp, 'https://intake.vistar.tech/sub-1');

      expect(report.whatsappText).toContain('WhatsApp Brand');
      expect(report.whatsappText).toContain('*0% verified*');
      expect(report.whatsappText).toContain('https://intake.vistar.tech/sub-1');
    });

    it('20.4 Generates professional Email draft copy', async () => {
      const sub = await runIntakePipeline({
        blueprintSlug: 'shopify-d2c-catalog',
        clientName: 'Email Brand',
        rawText: 'sku,title,price,stock\nS1,Polo,500,',
      });
      const bp = (await getBlueprintBySlug('shopify-d2c-catalog'))!;
      const report = generateClientFollowUp(sub, bp, 'https://intake.vistar.tech/sub-1');

      expect(report.emailText).toContain('Subject: Action Needed: Complete Remaining Items for Email Brand');
      expect(report.emailText).toContain('https://intake.vistar.tech/sub-1');
    });

    it('20.5 Produces congratulatory copy when batch is 100% verified', async () => {
      const sub = await runIntakePipeline({
        blueprintSlug: 'shopify-d2c-catalog',
        clientName: 'Complete Brand',
        rawText: 'sku,title,price,stock\nS1,Polo,500,10',
      });
      const bp = (await getBlueprintBySlug('shopify-d2c-catalog'))!;
      const report = generateClientFollowUp(sub, bp, 'https://intake.vistar.tech/sub-1');

      expect(report.completionPercent).toBe(100);
      expect(report.missingItems.length).toBe(0);
      expect(report.whatsappText).toContain('*100% verified*');
    });
  });

  describe('Feature 21: Multi-Target Export Compilers', () => {
    let sampleBlueprint: Blueprint;
    let sampleRows: NormalizedRow[];

    beforeEach(async () => {
      resetTestDbSingleton();
      sampleBlueprint = (await getBlueprintBySlug('shopify-d2c-catalog'))!;
      sampleRows = [
        {
          rowIndex: 0,
          rowId: 'row-1',
          cells: {
            sku: { value: 'SKU-001', originalRaw: 'SKU-001', status: 'verified', confidence: 1 },
            title: { value: 'Classic Oxford Shirt', originalRaw: 'Classic Oxford Shirt', status: 'verified', confidence: 1 },
            price: { value: 1499, originalRaw: '1499', status: 'verified', confidence: 1 },
            stock: { value: 50, originalRaw: '50', status: 'verified', confidence: 1 },
          },
          linkedAssetIds: [],
          isRowVerified: true,
          pendingApproval: false,
        },
      ];
    });

    it('21.1 Compiles PostgreSQL .sql script with CREATE TABLE IF NOT EXISTS & INSERT', () => {
      const sql = compileSqlScript(sampleRows, sampleBlueprint, [], true);
      expect(sql).toContain('CREATE TABLE IF NOT EXISTS "catalog_products"');
      expect(sql).toContain('INSERT INTO "catalog_products"');
      expect(sql).toContain("'SKU-001'");
      expect(sql).toContain('1499');
    });

    it('21.2 Compiles GitHub-Flavored Markdown .md onboarding spec', () => {
      const md = compileMarkdownSpec(sampleRows, sampleBlueprint, [], 'Test Client', true);
      expect(md).toContain('# Verified Onboarding Package: Test Client');
      expect(md).toContain('| SKU Code | Product Title |');
      expect(md).toContain('Classic Oxford Shirt');
    });

    it('21.3 Compiles valid binary Excel .xlsx buffer', () => {
      const xlsx = compileExcelBuffer(sampleRows, sampleBlueprint, [], true);
      expect(xlsx.length).toBeGreaterThan(500);
      const parsedWb = XLSX.read(xlsx, { type: 'buffer' });
      expect(parsedWb.SheetNames).toContain('Verified_Intake');
    });

    it('21.4 Compiles RFC 4180 compliant CSV spreadsheet', () => {
      const csv = compileCsvText(sampleRows, sampleBlueprint, [], true);
      expect(csv).toContain('sku,title');
      expect(csv).toContain('SKU-001,Classic Oxford Shirt');
    });

    it('21.5 Compiles JSON export and structured ZIP archive with manifest.json', async () => {
      const json = compileJsonExport(sampleRows, sampleBlueprint, [], 'Test Client', 'sub-1', true);
      const parsed = JSON.parse(json);
      expect(parsed.clientName).toBe('Test Client');
      expect(parsed.records.length).toBe(1);

      const zipBuf = await compileAssetZipBuffer(sampleRows, sampleBlueprint, [], 'Test Client');
      expect(zipBuf.length).toBeGreaterThan(50);
      const zip = await JSZip.loadAsync(zipBuf);
      expect(zip.file('manifest.json')).not.toBeNull();
    });
  });

  describe('Feature 34 & 35: Upload Security Guards (Magic Bytes & Macro Blocking)', () => {
    it('34.1 Validates JPEG magic bytes (FF D8 FF)', () => {
      const jpegBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
      expect(verifyFileSignature(jpegBuf, 'photo.jpg')).toBe('jpeg');
    });

    it('34.2 Validates PNG magic bytes (89 50 4E 47)', () => {
      const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      expect(verifyFileSignature(pngBuf, 'image.png')).toBe('png');
    });

    it('34.3 Validates WEBP magic bytes (RIFF....WEBP)', () => {
      const webpBuf = Buffer.from('RIFF1234WEBPVP8 ', 'ascii');
      expect(verifyFileSignature(webpBuf, 'photo.webp')).toBe('webp');
    });

    it('34.4 Validates XLSX (PK Zip) magic bytes (50 4B 03 04)', () => {
      const xlsxBuf = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
      expect(verifyFileSignature(xlsxBuf, 'catalog.xlsx')).toBe('xlsx');
    });

    it('35.1 Blocks macro-enabled spreadsheet extensions (.xlsm, .xltm, .xlsb, .xlam, .xla)', () => {
      expect(isBlockedMacroFile('inventory.xlsm')).toBe(true);
      expect(isBlockedMacroFile('template.xltm')).toBe(true);
      expect(isBlockedMacroFile('data.xlsb')).toBe(true);
      expect(isBlockedMacroFile('addon.xlam')).toBe(true);
      expect(isBlockedMacroFile('legacy.xla')).toBe(true);
      expect(isBlockedMacroFile('safe.xlsx')).toBe(false);
      expect(isBlockedMacroFile('safe.csv')).toBe(false);
    });
  });
});
