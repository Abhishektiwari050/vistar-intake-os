import * as XLSX from 'xlsx';
import sharp from 'sharp';
import type { RawUploadedAsset } from '@/lib/media/healer';

/**
 * Generates an authentic messy multi-row Excel buffer containing:
 * - Merged title banner across rows 1-2
 * - Non-standard column names ("Article No", "Amt_INR", "Qty Pcs")
 * - Dirty currency formats ("Rs. 1,499/-", "2.5k")
 * - Uppercase shouting text and extra whitespace
 * - One missing mandatory field to demonstrate Incremental Batch Approval
 * - Trailing "GRAND TOTAL" summary row that must be stripped
 */
export function buildChaoticExcelSampleBuffer(targetType: 'ecommerce_catalog' | 'agency_kickoff'): Buffer {
  let matrix: unknown[][];

  if (targetType === 'agency_kickoff') {
    matrix = [
      ['ACME FINTECH REDESIGN — CLIENT NOTES EXPORT', '', '', '', ''],
      ['Exported from Notion / WhatsApp Notes', '', '', '', ''],
      [],
      ['Ticket ID', 'Feature / Deliverable', 'Contact Email', 'Fee Estimate', 'Urgency'],
      ['mod 01', '  EXECUTIVE ANALYTICS DASHBOARD  ', 'rahul@acmefin.in', 'Rs. 45,000/-', 'High'],
      ['mod 02', 'WhatsApp Notification Relay', 'priya.ops@acmefin.in', '25k', 'Medium'],
      ['mod 03', 'GST Invoice PDF Export', 'invalid-email-format', 'Rs. 18,500', 'High'],
      ['mod 04', 'Role Based Auth Matrix', 'rahul@acmefin.in', '32,000', 'Normal'],
      ['TOTAL', '', '', '1,20,500', ''],
    ];
  } else {
    matrix = [
      ['VISTAR DEMO BRAND — SUPPLIER INVENTORY DUMP (MESSY)', '', '', '', '', ''],
      ['Generated from legacy tally sheet — DO NOT EDIT', '', '', '', '', ''],
      [],
      ['Article No', 'Item Name', 'Collection', 'Amt (INR)', 'Units Left', 'Supplier GST'],
      ['sku 101', '  CRIMSON COTTON POLO SHIRT  ', 'Menswear', 'Rs. 1,499/-', '120 pcs', '07AABCU9603R1ZM'],
      ['sku 102', 'Oxford Linen Overshirt', 'Menswear', '2,499', '45', '07 aabcu9603r1zm'],
      ['sku 103', 'Canvas Weekender Tote Bag', 'Accessories', '3.2k', '80 units', '07AABCU9603R1ZM'],
      ['sku 104', 'Matte Ceramic Espresso Set', 'Homeware', 'Rs. 899/-', '', '07AABCU9603R1ZM'],
      ['GRAND TOTAL', '', '', '₹8,097', '245', ''],
    ];
  }

  const ws = XLSX.utils.aoa_to_sheet(matrix);
  ws['!merges'] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 5 } },
    { s: { r: 1, c: 0 }, e: { r: 1, c: 5 } },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Raw_Inventory_Export');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

async function createSampleImageBuffer(
  width: number,
  height: number,
  bgHex: string,
  accentHex: string,
  label: string
): Promise<Buffer> {
  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${bgHex}" />
      <rect x="${width * 0.15}" y="${height * 0.15}" width="${width * 0.7}" height="${height * 0.7}" rx="28" fill="${accentHex}" opacity="0.9" />
      <circle cx="${width * 0.5}" cy="${height * 0.44}" r="${Math.min(width, height) * 0.16}" fill="#FFFFFF" opacity="0.25" />
      <text x="50%" y="68%" font-family="sans-serif" font-size="${Math.round(width * 0.06)}" font-weight="bold" fill="#FFFFFF" text-anchor="middle">${label}</text>
    </svg>
  `;
  return sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toBuffer();
}

/**
 * Generates 4 synthetic raw off-ratio product images + 1 perceptual duplicate
 * so the demo showcases aspect-ratio healing, SKU linking, and dHash deduplication.
 */
export async function buildChaoticMediaSampleAssets(
  targetType: 'ecommerce_catalog' | 'agency_kickoff'
): Promise<RawUploadedAsset[]> {
  if (targetType === 'agency_kickoff') {
    const logo1 = await createSampleImageBuffer(1200, 620, '#F1F5F9', '#4F46E5', 'ACME MARK');
    const logoDup = await createSampleImageBuffer(1180, 610, '#F1F5F9', '#4F46E5', 'ACME MARK');
    const icon2 = await createSampleImageBuffer(800, 900, '#EEF2FF', '#059669', 'DASHBOARD UI');
    return [
      { filename: 'mod_01_dashboard_preview.jpg', buffer: icon2, mimeType: 'image/jpeg' },
      { filename: 'mod_02_brand_logo.jpg', buffer: logo1, mimeType: 'image/jpeg' },
      { filename: 'WhatsApp Image 2026-11-11 (copy).jpg', buffer: logoDup, mimeType: 'image/jpeg' },
    ];
  }

  const polo = await createSampleImageBuffer(720, 1080, '#FEF2F2', '#DC2626', 'CRIMSON POLO');
  const poloDuplicate = await createSampleImageBuffer(700, 1050, '#FEF2F2', '#DC2626', 'CRIMSON POLO');
  const overshirt = await createSampleImageBuffer(1280, 720, '#EFF6FF', '#2563EB', 'OXFORD LINEN');
  const tote = await createSampleImageBuffer(900, 600, '#FFFBEB', '#D97706', 'CANVAS TOTE');

  return [
    { filename: 'crimson_polo_raw_phone.jpg', buffer: polo, mimeType: 'image/jpeg' },
    { filename: 'IMG_8492_WhatsApp_duplicate.jpg', buffer: poloDuplicate, mimeType: 'image/jpeg' },
    { filename: 'oxford_linen_shoot.jpg', buffer: overshirt, mimeType: 'image/jpeg' },
    { filename: 'sku_103_tote_bag.jpg', buffer: tote, mimeType: 'image/jpeg' },
  ];
}
