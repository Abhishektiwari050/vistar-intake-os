import { describe, it, expect, beforeEach } from 'vitest';
import * as XLSX from 'xlsx';
import {
  sanitizeSpreadsheetBuffer,
  generateHeaderFingerprint,
  normalizeHeaderToken,
} from '@/lib/excel/sanitizer';
import { normalizeCell } from '@/lib/triage/normalizer';
import {
  computeDifferenceHash,
  healAndLinkAssets,
} from '@/lib/media/healer';
import {
  compileSqlScript,
  compileMarkdownSpec,
  sanitizeSpreadsheetValue,
} from '@/lib/export/compilers';
import {
  verifyFileSignature,
  isBlockedMacroFile,
  isValidUuid,
} from '@/lib/security/upload-guard';
import { resetTestDbSingleton } from '@/lib/db/client';
import { getBlueprintBySlug } from '@/lib/pipeline/run-intake';
import {
  generateClampedMergedWorkbook,
  generateZeroByteBuffer,
  generateCorruptZipHeaderBuffer,
  generateCorruptImageBuffer,
  generateMimeSpoofedHtmlBuffer,
  generateColorBoxImage,
  generateSyntheticWorkbook,
} from '../helpers/test-generators';
import type { NormalizedRow, SchemaFieldRule } from '@/lib/types/intake';

describe('Tier 2: Boundary & Hostile Corner Cases Suite', () => {
  beforeEach(() => {
    resetTestDbSingleton();
  });

  describe('Boundary 1: Malformed Files & Spreadsheet Range DOS', () => {
    it('1.1 Zero-byte file throws descriptive error indicating file is empty', () => {
      const zeroBuf = generateZeroByteBuffer();
      expect(() => sanitizeSpreadsheetBuffer(zeroBuf)).toThrow(/empty/i);
    });

    it('1.2 Corrupt PK zip header throws unreadable/corrupted error', () => {
      const corruptBuf = generateCorruptZipHeaderBuffer();
      expect(() => sanitizeSpreadsheetBuffer(corruptBuf)).toThrow(/corrupted|unreadable/i);
    });

    it('1.3 Clamps 1,048,575-row merged cell range without OOM or infinite loop', () => {
      const buf = generateClampedMergedWorkbook();
      const start = Date.now();
      const result = sanitizeSpreadsheetBuffer(buf);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(10000);
      expect(result.rows.length).toBe(1);
      expect(result.rows[0]['SKU']).toBe('SKU-001');
    });

    it('1.4 Handles completely blank worksheet with zero rows gracefully', () => {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([]);
      XLSX.utils.book_append_sheet(wb, ws, 'Blank');
      const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

      const result = sanitizeSpreadsheetBuffer(buf);
      expect(result.rows.length).toBe(0);
      expect(result.totalRawRows).toBe(0);
    });

    it('1.5 Handles worksheet with only a header row and zero data rows', () => {
      const wb = generateSyntheticWorkbook({
        headerRow: ['SKU', 'Title', 'Price'],
        dataRows: [],
      });

      const result = sanitizeSpreadsheetBuffer(wb);
      expect(result.headers).toEqual(['SKU', 'Title', 'Price']);
      expect(result.rows.length).toBe(0);
    });
  });

  describe('Boundary 2: Formula Error Neutralization & Edge Cases', () => {
    it('2.1 Lowercase #value! and #n/a are stripped case-insensitively', () => {
      const csv = Buffer.from('SKU,Col1,Col2\nS1,#value!,#n/a\nS2,#ref!,#div/0!', 'utf8');
      const result = sanitizeSpreadsheetBuffer(csv);
      expect(result.rows[0]['Col1']).toBe('');
      expect(result.rows[0]['Col2']).toBe('');
      expect(result.rows[1]['Col1']).toBe('');
      expect(result.rows[1]['Col2']).toBe('');
    });

    it('2.2 Quoted formula error strings in CSV are stripped', () => {
      const csv = Buffer.from('SKU,Price\nSKU-1,"#VALUE!"\nSKU-2,"#N/A"', 'utf8');
      const result = sanitizeSpreadsheetBuffer(csv);
      expect(result.rows[0]['Price']).toBe('');
      expect(result.rows[1]['Price']).toBe('');
    });

    it('2.3 Alphanumeric strings containing error substrings (e.g. REF#123) are preserved', () => {
      const csv = Buffer.from('RefCode,Description\nREF#123,Customer Return Reference', 'utf8');
      const result = sanitizeSpreadsheetBuffer(csv);
      expect(result.rows[0]['RefCode']).toBe('REF#123');
      expect(result.rows[0]['Description']).toBe('Customer Return Reference');
    });

    it('2.4 Formula error padded with surrounding whitespace is stripped', () => {
      const csv = Buffer.from('SKU,Status\nS1,  #N/A  \nS2,  #DIV/0!  ', 'utf8');
      const result = sanitizeSpreadsheetBuffer(csv);
      expect(result.rows[0]['Status']).toBe('');
      expect(result.rows[1]['Status']).toBe('');
    });

    it('2.5 Preserves text values that look like equations but are valid product descriptions', () => {
      const csv = Buffer.from('Title,Formula\nT-Shirt,50% Cotton + 50% Polyester', 'utf8');
      const result = sanitizeSpreadsheetBuffer(csv);
      expect(result.rows[0]['Formula']).toBe('50% Cotton + 50% Polyester');
    });
  });

  describe('Boundary 3: Unicode Headers, Punctuation & Disambiguation', () => {
    it('3.1 Generates distinct SHA-256 fingerprints for Hindi and Chinese headers', () => {
      const hindiFp = generateHeaderFingerprint(['उत्पाद', 'कीमत', 'मात्रा']);
      const chineseFp = generateHeaderFingerprint(['产品', '价格', '数量']);
      expect(hindiFp).not.toBe(chineseFp);
      expect(hindiFp.length).toBe(64);
      expect(chineseFp.length).toBe(64);
    });

    it('3.2 Disambiguates duplicate column headers by appending suffixes', () => {
      const csv = Buffer.from('Price,Price,Price\n100,200,300', 'utf8');
      const result = sanitizeSpreadsheetBuffer(csv);
      expect(result.headers).toEqual(['Price', 'Price_2', 'Price_3']);
      expect(result.rows[0]['Price']).toBe('100');
      expect(result.rows[0]['Price_2']).toBe('200');
      expect(result.rows[0]['Price_3']).toBe('300');
    });

    it('3.3 Handles headers with complex punctuation and currency symbols', () => {
      const token = normalizeHeaderToken('$$$ Unit MRP (INR incl. taxes) $$$');
      expect(token).toBe('unit_mrp_inr_incl_taxes');
    });

    it('3.4 Permuted column order produces identical SHA-256 fingerprint', () => {
      const fpOrder1 = generateHeaderFingerprint(['PartNo', 'Warehouse', 'Shelf', 'Stock']);
      const fpOrder2 = generateHeaderFingerprint(['Stock', 'Shelf', 'PartNo', 'Warehouse']);
      expect(fpOrder1).toBe(fpOrder2);
    });

    it('3.5 Handles empty header string gracefully', () => {
      const fp = generateHeaderFingerprint(['', '   ', 'SKU']);
      expect(fp.length).toBe(64);
    });
  });

  describe('Boundary 4: Normalizer Hostile Currency & Extremes', () => {
    const currencyRule: SchemaFieldRule = {
      key: 'price',
      label: 'Unit Price',
      type: 'currency',
      required: true,
      aliases: [],
    };

    it('4.1 Flags standard negative currency as invalid_format', () => {
      const res = normalizeCell('-1499', currencyRule);
      expect(res.status).toBe('invalid_format');
      expect(res.reason).toMatch(/negative/i);
    });

    it('4.2 Flags accounting parenthesis negative currency (500) as invalid_format', () => {
      const res = normalizeCell('(500)', currencyRule);
      expect(res.status).toBe('invalid_format');
      expect(res.reason).toMatch(/negative/i);
    });

    it('4.3 Flags currency prefixed negative with currency symbol as invalid_format', () => {
      const res1 = normalizeCell('Rs. -499', currencyRule);
      expect(res1.status).toBe('invalid_format');

      const res2 = normalizeCell('-$50.00', currencyRule);
      expect(res2.status).toBe('invalid_format');
    });

    it('4.4 Normalizes zero currency (0 or ₹0) to numeric 0 with verified status', () => {
      const res1 = normalizeCell('0', currencyRule);
      expect(res1.value).toBe(0);
      expect(res1.status).toBe('verified');

      const res2 = normalizeCell('₹0', currencyRule);
      expect(res2.value).toBe(0);
      expect(res2.status).toBe('ai_healed');
    });

    it('4.5 Rejects non-numeric text values (Free, N/A, TBD) as invalid_format', () => {
      expect(normalizeCell('Free', currencyRule).status).toBe('invalid_format');
      expect(normalizeCell('N/A', currencyRule).status).toBe('invalid_format');
      expect(normalizeCell('TBD', currencyRule).status).toBe('invalid_format');
      expect(normalizeCell('Call for price', currencyRule).status).toBe('invalid_format');
    });
  });

  describe('Boundary 5: SKU Standardization Hostile Inputs', () => {
    const skuRule: SchemaFieldRule = {
      key: 'sku',
      label: 'SKU Code',
      type: 'sku',
      required: true,
      aliases: [],
    };

    it('5.1 Rejects symbol-only SKUs (###, ---, ***) as invalid_format', () => {
      expect(normalizeCell('###', skuRule).status).toBe('invalid_format');
      expect(normalizeCell('---', skuRule).status).toBe('invalid_format');
      expect(normalizeCell('***', skuRule).status).toBe('invalid_format');
      expect(normalizeCell('@#$%^&', skuRule).status).toBe('invalid_format');
    });

    it('5.2 Treats whitespace-only SKU as missing_required', () => {
      const res = normalizeCell('   ', skuRule);
      expect(res.status).toBe('missing_required');
      expect(res.value).toBeNull();
    });

    it('5.3 Normalizes single-character alphanumeric SKU correctly', () => {
      const res = normalizeCell('a', skuRule);
      expect(res.value).toBe('A');
      expect(res.status).toBe('ai_healed');
    });

    it('5.4 Handles 100-character long SKU without truncation', () => {
      const longRaw = 'PART_' + 'A'.repeat(90) + '_END';
      const res = normalizeCell(longRaw, skuRule);
      expect(res.status).toBe('ai_healed');
      expect(String(res.value).startsWith('PART-')).toBe(true);
      expect(String(res.value).endsWith('-END')).toBe(true);
    });

    it('5.5 Strips non-alphanumeric punctuation while keeping alphanumeric tokens joined by hyphen', () => {
      const res = normalizeCell('SKU #101 / Batch (2026)', skuRule);
      expect(res.value).toBe('SKU-101-BATCH-2026');
    });
  });

  describe('Boundary 6: Deterministic Zod Schema Boundary Violations', () => {
    it('6.1 Rejects GSTIN with invalid state code 00', () => {
      const gstinRule: SchemaFieldRule = {
        key: 'gstin',
        label: 'GSTIN',
        type: 'gstin',
        required: true,
        aliases: [],
      };

      // 00 is not a valid Indian state (valid are 01-38, 97, 99)
      expect(normalizeCell('00AABCU9603R1ZM', gstinRule).status).toBe('invalid_format');
      // 07 (Delhi) is valid
      expect(normalizeCell('07AABCU9603R1ZM', gstinRule).status).toBe('verified');
      // 27 (Maharashtra) is valid
      expect(normalizeCell('27AABCU9603R1ZM', gstinRule).status).toBe('verified');
    });

    it('6.2 Rejects malicious URL schemas (javascript:alert(1), data:text/html)', () => {
      const urlRule: SchemaFieldRule = {
        key: 'url',
        label: 'Store URL',
        type: 'url',
        required: true,
        aliases: [],
      };

      expect(normalizeCell('javascript:alert(1)', urlRule).status).toBe('invalid_format');
      expect(normalizeCell('data:text/html,<script>alert(1)</script>', urlRule).status).toBe('invalid_format');
      expect(normalizeCell('vbscript:msgbox(1)', urlRule).status).toBe('invalid_format');
      expect(normalizeCell('https://store.vistar.tech/catalog?ref=promo#hero', urlRule).status).toBe('verified');
    });

    it('6.3 Rejects malformed email missing @ or TLD', () => {
      const emailRule: SchemaFieldRule = {
        key: 'email',
        label: 'Email',
        type: 'email',
        required: true,
        aliases: [],
      };

      expect(normalizeCell('user@', emailRule).status).toBe('invalid_format');
      expect(normalizeCell('@domain.com', emailRule).status).toBe('invalid_format');
      expect(normalizeCell('user@localhost', emailRule).status).toBe('invalid_format');
      expect(normalizeCell('valid.partner+tag@sub.domain.co.in', emailRule).status).toBe('verified');
    });

    it('6.4 Rejects negative number for quantity field', () => {
      const qtyRule: SchemaFieldRule = {
        key: 'stock',
        label: 'Quantity',
        type: 'number',
        required: true,
        aliases: [],
      };

      expect(normalizeCell('-10', qtyRule).status).toBe('invalid_format');
      expect(normalizeCell('-5 pcs', qtyRule).status).toBe('invalid_format');
      expect(normalizeCell('0 units', qtyRule).status).toBe('ai_healed');
      expect(normalizeCell('150 pcs', qtyRule).value).toBe(150);
    });

    it('6.5 Handles extreme numeric overflow gracefully', () => {
      const numRule: SchemaFieldRule = {
        key: 'stock',
        label: 'Quantity',
        type: 'number',
        required: true,
        aliases: [],
      };
      expect(normalizeCell('999999999999999999999999999999', numRule).status).toBe('invalid_format');
    });
  });

  describe('Boundary 7: Media Auto-Healer Extremes & Corrupt File Isolation', () => {
    it('7.1 Isolates corrupt image buffer without crashing and records error', async () => {
      const corruptBuf = generateCorruptImageBuffer();
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
        [{ filename: 'bad_image.jpg', buffer: corruptBuf, mimeType: 'image/jpeg' }],
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
      expect(res.assets[0].error).toBeDefined();
    });

    it('7.2 Prevents placeholder hyphen SKU (-) from matching arbitrary filenames (SEC-7)', async () => {
      const img = await generateColorBoxImage({ r: 50, g: 50, b: 50 }, 200, 200);
      const rows: NormalizedRow[] = [
        {
          rowIndex: 0,
          rowId: 'row_empty',
          cells: {
            sku: { value: '-', originalRaw: '-', status: 'verified', confidence: 1 },
            title: { value: 'Blank Placeholder', originalRaw: 'Blank', status: 'verified', confidence: 1 },
          },
          linkedAssetIds: [],
          isRowVerified: true,
          pendingApproval: false,
        },
      ];

      const res = await healAndLinkAssets(
        [{ filename: 'random_photo_shot.png', buffer: img, mimeType: 'image/png' }],
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

    it('7.3 Increments collision suffix cleanly up to 10 photos for single SKU', async () => {
      const img = await generateColorBoxImage({ r: 10, g: 20, b: 30 }, 200, 200);
      const rows: NormalizedRow[] = [
        {
          rowIndex: 0,
          rowId: 'row_multi',
          cells: {
            sku: { value: 'MULTI-1', originalRaw: 'MULTI-1', status: 'verified', confidence: 1 },
            title: { value: 'Multi Angle Item', originalRaw: 'Multi', status: 'verified', confidence: 1 },
          },
          linkedAssetIds: [],
          isRowVerified: true,
          pendingApproval: false,
        },
      ];

      const uploadBatch = Array.from({ length: 6 }, (_, i) => ({
        filename: `multi_1_angle_${i + 1}.png`,
        buffer: img,
        mimeType: 'image/png',
      }));

      const res = await healAndLinkAssets(uploadBatch, rows, {
        minWidth: 100,
        minHeight: 100,
        targetWidth: 1080,
        targetHeight: 1080,
        aspectRatio: '1:1',
        outputFormat: 'webp',
        deduplicateByHash: false,
        autoHealOffRatio: true,
      });

      expect(res.assets[0].healedFilename).toBe('MULTI-1-multi-angle-item.webp');
      expect(res.assets[1].healedFilename).toBe('MULTI-1-multi-angle-item-2.webp');
      expect(res.assets[2].healedFilename).toBe('MULTI-1-multi-angle-item-3.webp');
      expect(res.assets[3].healedFilename).toBe('MULTI-1-multi-angle-item-4.webp');
      expect(res.assets[4].healedFilename).toBe('MULTI-1-multi-angle-item-5.webp');
      expect(res.assets[5].healedFilename).toBe('MULTI-1-multi-angle-item-6.webp');
    });

    it('7.4 Handles pure 1x1 pixel image without divide-by-zero or crash', async () => {
      const tinyImg = await generateColorBoxImage({ r: 255, g: 255, b: 255 }, 1, 1);
      const hash = await computeDifferenceHash(tinyImg);
      expect(hash.length).toBe(16);
    });

    it('7.5 Solid black and solid white images yield valid uniform dHashes', async () => {
      const black = await generateColorBoxImage({ r: 0, g: 0, b: 0 }, 100, 100);
      const white = await generateColorBoxImage({ r: 255, g: 255, b: 255 }, 100, 100);
      const hashBlack = await computeDifferenceHash(black);
      const hashWhite = await computeDifferenceHash(white);
      expect(hashBlack).toMatch(/^[0-9a-f]{16}$/);
      expect(hashWhite).toMatch(/^[0-9a-f]{16}$/);
    });
  });

  describe('Boundary 8: Export Security & Injection Defenses', () => {
    it('8.1 Quotes formula characters (=, +, -, @, \\t, \\r) in CSV/Excel export values', () => {
      expect(sanitizeSpreadsheetValue('=SUM(A1:A10)')).toBe("'=SUM(A1:A10)");
      expect(sanitizeSpreadsheetValue('+cmd|/C calc')).toBe("'+cmd|/C calc");
      expect(sanitizeSpreadsheetValue('-10*20')).toBe("'-10*20");
      expect(sanitizeSpreadsheetValue('@SUM(B1)')).toBe("'@SUM(B1)");
      expect(sanitizeSpreadsheetValue('\tmalicious')).toBe("'\tmalicious");
      expect(sanitizeSpreadsheetValue('\rmalicious')).toBe("'\rmalicious");
    });

    it('8.2 Retains numeric numbers as numbers without prepending quotes', () => {
      expect(sanitizeSpreadsheetValue(500)).toBe(500);
      expect(sanitizeSpreadsheetValue(0)).toBe(0);
      expect(sanitizeSpreadsheetValue(99.99)).toBe(99.99);
    });

    it('8.3 Blocks malicious SQL table name identifiers (SEC-1)', async () => {
      const bp = (await getBlueprintBySlug('shopify-d2c-catalog'))!;
      const maliciousBp = { ...bp, sqlTableName: 'bad_table; DROP TABLE users;--' };
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

      expect(() => compileSqlScript(rows, maliciousBp, [], true)).toThrow(/Invalid SQL identifier/);
    });

    it('8.4 Quotes SQL identifiers in double quotes and escapes single quotes in data values', async () => {
      const bp = (await getBlueprintBySlug('shopify-d2c-catalog'))!;
      const rows: NormalizedRow[] = [
        {
          rowIndex: 0,
          rowId: 'r1',
          cells: {
            sku: { value: "O'Reilly", originalRaw: "O'Reilly", status: 'verified', confidence: 1 },
            title: { value: 'Book Title', originalRaw: 'Book Title', status: 'verified', confidence: 1 },
          },
          linkedAssetIds: [],
          isRowVerified: true,
          pendingApproval: false,
        },
      ];

      const sql = compileSqlScript(rows, bp, [], true);
      expect(sql).toContain("''Reilly'");
    });

    it('8.5 Escapes HTML entities (<, >, &) in Markdown export (SEC-5)', async () => {
      const bp = (await getBlueprintBySlug('shopify-d2c-catalog'))!;
      const rows: NormalizedRow[] = [
        {
          rowIndex: 0,
          rowId: 'r1',
          cells: {
            sku: { value: 'SKU-X', originalRaw: 'SKU-X', status: 'verified', confidence: 1 },
            title: { value: '<img src=x onerror=alert(1)> & "Safe"', originalRaw: 'val', status: 'verified', confidence: 1 },
          },
          linkedAssetIds: [],
          isRowVerified: true,
          pendingApproval: false,
        },
      ];

      const md = compileMarkdownSpec(rows, bp, [], 'AT&T <Corporate>', true);
      expect(md).toContain('&lt;img src=x onerror=alert(1)&gt;');
      expect(md).toContain('&amp;');
      expect(md).not.toContain('<img');
    });
  });

  describe('Boundary 9: Upload Guard MIME Spoofing & Macro Blocking', () => {
    it('9.1 Rejects HTML payload disguised as photo.png', () => {
      const htmlBuf = generateMimeSpoofedHtmlBuffer();
      expect(verifyFileSignature(htmlBuf, 'photo.png')).toBe('invalid');
    });

    it('9.2 Rejects executable payload disguised as catalog.xlsx', () => {
      const exeBuf = Buffer.from('MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xff\xff', 'binary');
      expect(verifyFileSignature(exeBuf, 'catalog.xlsx')).toBe('invalid');
    });

    it('9.3 Rejects macro extensions case-insensitively (.XLSM, .XlSm)', () => {
      expect(isBlockedMacroFile('INVENTORY.XLSM')).toBe(true);
      expect(isBlockedMacroFile('Catalog.XlSm')).toBe(true);
      expect(isBlockedMacroFile('sheet.xLtM')).toBe(true);
    });

    it('9.4 Blocks double extension trick (safe.xlsx.xlsm)', () => {
      expect(isBlockedMacroFile('safe.xlsx.xlsm')).toBe(true);
    });

    it('9.5 Validates UUID strings strictly', () => {
      expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
      expect(isValidUuid('not-a-uuid')).toBe(false);
      expect(isValidUuid('550e8400-e29b-41d4-a716-446655440000; drop table')).toBe(false);
    });
  });
});
