import * as XLSX from 'xlsx';
import sharp from 'sharp';
import type { RawUploadedAsset } from '@/lib/media/healer';

/**
 * Custom workbook generator options
 */
export interface SyntheticWorkbookOptions {
  sheetName?: string;
  bannerRows?: (string | number | null | undefined)[][];
  headerRow: string[];
  dataRows: (string | number | null | undefined)[][];
  footerRows?: (string | number | null | undefined)[][];
  merges?: XLSX.Range[];
  bookType?: 'xlsx' | 'xlsm' | 'xlsb';
}

/**
 * Builds a custom synthetic Excel workbook buffer with configurable banners, headers,
 * data rows, footers, and merged cell ranges.
 */
export function generateSyntheticWorkbook(options: SyntheticWorkbookOptions): Buffer {
  const sheetName = options.sheetName || 'Sheet1';
  const matrix: unknown[][] = [];

  if (options.bannerRows && options.bannerRows.length > 0) {
    matrix.push(...options.bannerRows);
  }

  matrix.push(options.headerRow);
  matrix.push(...options.dataRows);

  if (options.footerRows && options.footerRows.length > 0) {
    matrix.push(...options.footerRows);
  }

  const ws = XLSX.utils.aoa_to_sheet(matrix);

  if (options.merges && options.merges.length > 0) {
    ws['!merges'] = options.merges;
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  return XLSX.write(wb, {
    type: 'buffer',
    bookType: (options.bookType as XLSX.BookType) || 'xlsx',
  }) as Buffer;
}

/**
 * Builds a multi-sheet Excel workbook where one sheet is richer than others
 */
export function generateMultiSheetWorkbook(
  sheets: Array<{ name: string; rows: unknown[][] }>
): Buffer {
  const wb = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const ws = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/**
 * Generates an extreme 1M-row merged cell clamp test workbook
 */
export function generateClampedMergedWorkbook(): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([
    ['MEGA BANNER HEADER', '', ''],
    ['SKU', 'Product Name', 'Price'],
    ['SKU-001', 'Test Widget', '1000'],
  ]);
  // 1,048,575 is max Excel row index
  ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 1048575, c: 16383 } }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/**
 * Returns an empty zero-byte buffer
 */
export function generateZeroByteBuffer(): Buffer {
  return Buffer.alloc(0);
}

/**
 * Returns a buffer with a corrupted PK zip signature header
 */
export function generateCorruptZipHeaderBuffer(): Buffer {
  return Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00, 0xff, 0xff, 0xde, 0xad, 0xbe, 0xef]);
}

/**
 * Returns a buffer of non-image junk bytes
 */
export function generateCorruptImageBuffer(): Buffer {
  return Buffer.from('NOT_AN_IMAGE_JPEG_PAYLOAD_GARBAGE_BYTES_1234567890');
}

/**
 * Returns a buffer of HTML/JavaScript disguised as an image (MIME spoofing probe)
 */
export function generateMimeSpoofedHtmlBuffer(): Buffer {
  return Buffer.from(
    '<!DOCTYPE html><html><body><script>alert("xss")</script></body></html>',
    'utf-8'
  );
}

/**
 * Generates a clean single-color solid image buffer using Sharp
 */
export async function generateColorBoxImage(
  color: { r: number; g: number; b: number },
  width = 640,
  height = 480,
  format: 'png' | 'jpeg' = 'png'
): Promise<Buffer> {
  const pipeline = sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color,
    },
  });

  if (format === 'jpeg') {
    return pipeline.jpeg({ quality: 90 }).toBuffer();
  }
  return pipeline.png().toBuffer();
}

/**
 * Generates an SVG-based synthetic product photo buffer with specified aspect ratio,
 * text label, and background color.
 */
export async function generateSyntheticProductImage(
  width: number,
  height: number,
  bgHex: string,
  accentHex: string,
  label: string
): Promise<Buffer> {
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${bgHex}" />
      <rect x="${width * 0.1}" y="${height * 0.1}" width="${width * 0.8}" height="${height * 0.8}" rx="16" fill="${accentHex}" opacity="0.85" />
      <circle cx="${width * 0.5}" cy="${height * 0.45}" r="${Math.min(width, height) * 0.2}" fill="#FFFFFF" opacity="0.3" />
      <text x="50%" y="75%" font-family="sans-serif" font-size="${Math.max(14, Math.round(width * 0.05))}" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${label}</text>
    </svg>
  `;
  return sharp(Buffer.from(svg)).jpeg({ quality: 90 }).toBuffer();
}

/**
 * Builds a suite of test raw assets:
 * - 1 standard product front image
 * - 1 near-identical duplicate image (same silhouette/color, minor dimension offset)
 * - 1 color-variant image (identical shape, distinct contrasting color)
 * - 1 extreme landscape image (e.g., 1600x400 banner)
 */
export async function generateSyntheticMediaAssetSet(skuPrefix = 'SKU-200'): Promise<RawUploadedAsset[]> {
  const baseImg = await generateSyntheticProductImage(800, 1000, '#F8FAFC', '#3B82F6', `${skuPrefix} Front`);
  // Slight crop/scale difference for dHash duplicate test
  const dupImg = await generateSyntheticProductImage(780, 980, '#F8FAFC', '#3B82F6', `${skuPrefix} Front`);
  // Red color variant (should NOT collide despite same silhouette)
  const redVariant = await generateSyntheticProductImage(800, 1000, '#FEF2F2', '#EF4444', `${skuPrefix} Red`);
  // Extreme landscape
  const wideImg = await generateSyntheticProductImage(1600, 400, '#ECFDF5', '#10B981', `${skuPrefix} Wide Banner`);

  return [
    { filename: `${skuPrefix.toLowerCase()}_front_original.jpg`, buffer: baseImg, mimeType: 'image/jpeg' },
    { filename: `${skuPrefix.toLowerCase()}_front_compressed_copy.jpg`, buffer: dupImg, mimeType: 'image/jpeg' },
    { filename: `${skuPrefix.toLowerCase()}_variant_ruby_red.jpg`, buffer: redVariant, mimeType: 'image/jpeg' },
    { filename: `${skuPrefix.toLowerCase()}_panoramic_banner.jpg`, buffer: wideImg, mimeType: 'image/jpeg' },
  ];
}

/**
 * Generates raw CSV text from array of headers and rows
 */
export function generateRawCsv(headers: string[], rows: (string | number)[][]): string {
  const lines: string[] = [];
  lines.push(headers.map((h) => (h.includes(',') ? `"${h}"` : h)).join(','));
  for (const row of rows) {
    lines.push(
      row
        .map((val) => {
          if (val === null || val === undefined) return '';
          const str = String(val);
          return str.includes(',') || str.includes('"') || str.includes('\n')
            ? `"${str.replace(/"/g, '""')}"`
            : str;
        })
        .join(',')
    );
  }
  return lines.join('\n');
}

/**
 * Standard test set of dirty currency strings mapped to expected parsed values
 */
export const DIRTY_CURRENCY_FIXTURES = [
  { raw: 'Rs. 1,499/-', expectedValue: 1499, expectedStatus: 'ai_healed' },
  { raw: '₹ 2,450.00', expectedValue: 2450, expectedStatus: 'ai_healed' },
  { raw: '3.5k', expectedValue: 3500, expectedStatus: 'ai_healed' },
  { raw: '1.2 Lakh', expectedValue: 120000, expectedStatus: 'ai_healed' },
  { raw: '2.5 Cr', expectedValue: 25000000, expectedStatus: 'ai_healed' },
  { raw: '$49.99', expectedValue: 49.99, expectedStatus: 'ai_healed' },
  { raw: '500', expectedValue: 500, expectedStatus: 'verified' },
  { raw: '0', expectedValue: 0, expectedStatus: 'verified' },
  { raw: '-1499', expectedValue: null, expectedStatus: 'invalid_format' },
  { raw: '(500)', expectedValue: null, expectedStatus: 'invalid_format' },
  { raw: 'Free', expectedValue: null, expectedStatus: 'invalid_format' },
  { raw: 'N/A', expectedValue: null, expectedStatus: 'invalid_format' },
];
