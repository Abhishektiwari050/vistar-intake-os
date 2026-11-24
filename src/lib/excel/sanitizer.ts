import * as XLSX from 'xlsx';
import * as crypto from 'node:crypto';

export interface SanitizedSheetResult {
  sheetName: string;
  headers: string[];
  rows: Array<Record<string, string>>;
  headerFingerprint: string;
  strippedTopBannerRows: number;
  strippedFooterSummaryRows: number;
  totalRawRows: number;
}

const SUMMARY_ROW_PATTERN = /^\s*(total|grand\s*total|sub\s*total|subtotal|sum|net\s*total|amount\s*payable)\b/i;
const FORMULA_ERROR_PATTERN = /^#(REF!|DIV\/0!|VALUE!|NAME\?|N\/A|NUM!|NULL!)$/i;

/**
 * Normalizes a header cell string for fingerprinting and mapping.
 * Preserves Unicode letters/digits so non-Latin headers never collide on empty strings.
 */
export function normalizeHeaderToken(header: string): string {
  return header
    .replace(/^\uFEFF/, '') // Strip UTF-8 BOM
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Generates deterministic SHA-256 fingerprint of column headers.
 * Used by Mapping Memory to bypass LLM mapping on repeat vendor formats.
 */
export function generateHeaderFingerprint(headers: string[]): string {
  const normalized = headers
    .map((h, i) => normalizeHeaderToken(h) || `col_${i}`)
    .sort()
    .join('|');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

function cleanCellValue(raw: unknown): string {
  if (raw === null || raw === undefined) return '';
  const str = String(raw).replace(/\uFEFF/g, '').trim();
  if (FORMULA_ERROR_PATTERN.test(str)) {
    return '';
  }
  return str;
}

/**
 * Propagates merged cell top-left values across their merged spans on a raw matrix,
 * strictly clamped to actual matrix bounds to prevent Excel template DOS (1M+ rows).
 */
function expandMergedCells(sheet: XLSX.WorkSheet, matrix: unknown[][]): unknown[][] {
  const merges = sheet['!merges'];
  if (!merges || merges.length === 0 || matrix.length === 0) return matrix;

  const cloned = matrix.map((row) => [...row]);
  const maxMatrixRow = cloned.length - 1;
  const maxMatrixCol = Math.max(...cloned.map((r) => r.length), 0) - 1;

  for (const merge of merges) {
    if (merge.s.r > maxMatrixRow || merge.s.c > maxMatrixCol) continue;
    const startVal = cloned[merge.s.r]?.[merge.s.c];
    if (startVal === undefined || startVal === null || String(startVal).trim() === '') continue;

    const endR = Math.min(merge.e.r, maxMatrixRow);
    for (let r = merge.s.r; r <= endR; r++) {
      if (!cloned[r]) continue;
      const endC = Math.min(merge.e.c, Math.max(cloned[r].length - 1, maxMatrixCol));
      for (let c = merge.s.c; c <= endC; c++) {
        if (cloned[r][c] === undefined || cloned[r][c] === null || String(cloned[r][c]).trim() === '') {
          cloned[r][c] = startVal;
        }
      }
    }
  }
  return cloned;
}

/**
 * Detects the true header row index in a messy spreadsheet matrix.
 * Scans up to 40 rows to skip empty rows and multi-row banner titles.
 */
function detectHeaderRowIndex(matrix: unknown[][]): number {
  let bestIdx = 0;
  let bestScore = -1;

  const scanLimit = Math.min(matrix.length, 40);
  for (let i = 0; i < scanLimit; i++) {
    const row = matrix[i] || [];
    const nonEmptyCells = row.map(cleanCellValue).filter(Boolean);
    if (nonEmptyCells.length < 2) continue;

    const uniqueCells = new Set(nonEmptyCells.map((c) => c.toLowerCase()));
    const headerLikeCells = nonEmptyCells.filter(
      (c) =>
        !/\d|@|https?:\/\/|\/-/.test(c) &&
        !/^(?:rs\.?|inr|usd|eur|gbp|[₹$€£])\b/i.test(c)
    );
    const dataLikeCells = nonEmptyCells.length - headerLikeCells.length;

    const score = uniqueCells.size * 2 + headerLikeCells.length * 3 - dataLikeCells * 2 - i * 0.1;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }

  return bestIdx;
}

/**
 * Selects the richest visible worksheet in multi-tab workbooks based on actual populated cell count.
 */
function pickPrimarySheet(workbook: XLSX.WorkBook): { name: string; sheet: XLSX.WorkSheet } {
  let bestName = workbook.SheetNames[0];
  let bestNonEmptyCount = -1;

  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    if (!sheet || !sheet['!ref']) continue;

    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
    const populatedCount = rows.reduce(
      (sum, r) => sum + (Array.isArray(r) ? r.filter((c) => cleanCellValue(c) !== '').length : 0),
      0
    );

    if (populatedCount > bestNonEmptyCount) {
      bestNonEmptyCount = populatedCount;
      bestName = name;
    }
  }

  return { name: bestName, sheet: workbook.Sheets[bestName] };
}

/**
 * Sanitizes an uploaded Excel/CSV buffer into clean normalized row objects.
 */
export function sanitizeSpreadsheetBuffer(buffer: Buffer): SanitizedSheetResult {
  if (!buffer || buffer.length === 0) {
    throw new Error('Uploaded spreadsheet file is empty (0 bytes).');
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: 'buffer',
      cellFormula: false,
      cellDates: true,
      bookVBA: false,
    });
  } catch (err) {
    throw new Error(
      `Corrupted or unreadable spreadsheet: ${err instanceof Error ? err.message : 'Parser error'}`
    );
  }

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('Uploaded workbook contains no readable sheets.');
  }

  const { name: sheetName, sheet } = pickPrimarySheet(workbook);
  if (!sheet || !sheet['!ref']) {
    return {
      sheetName: sheetName || 'empty',
      headers: [],
      rows: [],
      headerFingerprint: generateHeaderFingerprint([]),
      strippedTopBannerRows: 0,
      strippedFooterSummaryRows: 0,
      totalRawRows: 0,
    };
  }

  const rawMatrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: '',
    blankrows: false,
  });

  if (rawMatrix.length === 0) {
    return {
      sheetName,
      headers: [],
      rows: [],
      headerFingerprint: generateHeaderFingerprint([]),
      strippedTopBannerRows: 0,
      strippedFooterSummaryRows: 0,
      totalRawRows: 0,
    };
  }

  const expandedMatrix = expandMergedCells(sheet, rawMatrix);
  const headerIdx = detectHeaderRowIndex(expandedMatrix);
  const rawHeaders = (expandedMatrix[headerIdx] || []).map(cleanCellValue);

  // Deduplicate empty or colliding headers safely (avoids ["Price", "Price_2", "Price"] collisions)
  const headers: string[] = [];
  const usedHeaders = new Set<string>();
  const colPositions: number[] = [];

  for (let c = 0; c < rawHeaders.length; c++) {
    let base = rawHeaders[c];
    if (!base) {
      const hasColData = expandedMatrix
        .slice(headerIdx + 1)
        .some((r) => cleanCellValue(r?.[c]) !== '');
      if (!hasColData) continue;
      base = `column_${c + 1}`;
    }

    let candidate = base;
    let suffix = 2;
    while (usedHeaders.has(candidate)) {
      candidate = `${base}_${suffix}`;
      suffix++;
    }
    usedHeaders.add(candidate);
    headers.push(candidate);
    colPositions.push(c);
  }

  const rawDataRows = expandedMatrix.slice(headerIdx + 1);
  const cleanedRows: Array<Record<string, string>> = [];
  let strippedFooterSummaryRows = 0;

  for (const row of rawDataRows) {
    const cleanedCells = colPositions.map((colIdx) => cleanCellValue(row?.[colIdx]));
    const nonEmptyCount = cleanedCells.filter(Boolean).length;
    if (nonEmptyCount === 0) continue;

    const firstNonEmpty = cleanedCells.find(Boolean) || '';
    if (SUMMARY_ROW_PATTERN.test(firstNonEmpty)) {
      strippedFooterSummaryRows++;
      continue;
    }

    const rowObj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) {
      rowObj[headers[i]] = cleanedCells[i];
    }
    cleanedRows.push(rowObj);
  }

  return {
    sheetName,
    headers,
    rows: cleanedRows,
    headerFingerprint: generateHeaderFingerprint(headers),
    strippedTopBannerRows: headerIdx,
    strippedFooterSummaryRows,
    totalRawRows: rawMatrix.length,
  };
}

/**
 * Parses messy raw pasted text (TSV, CSV, or pipe/markdown tables) into the same clean format.
 */
export function sanitizeRawTextInput(rawText: string): SanitizedSheetResult {
  const trimmed = rawText.trim();
  if (!trimmed) {
    return {
      sheetName: 'raw_text',
      headers: [],
      rows: [],
      headerFingerprint: generateHeaderFingerprint([]),
      strippedTopBannerRows: 0,
      strippedFooterSummaryRows: 0,
      totalRawRows: 0,
    };
  }

  // Quote unquoted comma-formatted currency values (e.g. "Rs. 2,999/-") in messy CSV pastes
  // so thousand separators do not split rows into extra columns.
  const normalized = trimmed
    .split(/\r?\n/)
    .map((line) => {
      if (line.includes('"')) return line;
      return line.replace(
        /(^|[,;\t])(\s*)((?:Rs\.?|INR|USD|EUR|GBP|[₹$€£])\s*-?\d{1,3}(?:,\d{2,3})+(?:\.\d+)?(?:\s*\/-)?)(\s*)(?=$|[,;\t])/gi,
        '$1$2"$3"$4'
      );
    })
    .join('\n');

  const buffer = Buffer.from(normalized, 'utf-8');
  return sanitizeSpreadsheetBuffer(buffer);
}
