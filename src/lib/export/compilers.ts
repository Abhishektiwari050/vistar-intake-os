import * as XLSX from 'xlsx';
import JSZip from 'jszip';
import type { Blueprint, NormalizedRow, ProcessedAsset } from '@/lib/types/intake';

function quoteIdent(ident: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(ident)) {
    throw new Error(`Invalid SQL identifier blocked: ${ident}`);
  }
  return `"${ident.replace(/"/g, '""')}"`;
}

function sqlEscape(val: string | number | null | undefined): string {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  return `'${String(val).replace(/'/g, "''")}'`;
}

/**
 * Prevents Spreadsheet / DDE Formula Injection in Excel and CSV exports.
 * Forces leading =, +, -, @, tab, or carriage return cells to evaluate as literal text.
 */
export function sanitizeSpreadsheetValue(val: unknown): string | number {
  if (val === null || val === undefined) return '';
  if (typeof val === 'number') return val;
  const str = String(val);
  if (/^[=+\-@\t\r]/.test(str)) {
    return `'${str}`;
  }
  return str;
}

function escapeHtmlChars(val: string): string {
  return val.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] || c));
}

function csvEscapeField(val: unknown): string {
  const safeVal = sanitizeSpreadsheetValue(val);
  const str = String(safeVal);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Compiles verified/selected rows into a ready-to-execute PostgreSQL DDL + INSERT script
 * with strict identifier quoting (SEC-1 hardened).
 */
export function compileSqlScript(
  rows: NormalizedRow[],
  blueprint: Blueprint,
  assets: ProcessedAsset[],
  onlyVerified = true
): string {
  const targetRows = onlyVerified ? rows.filter((r) => r.isRowVerified) : rows;
  const quotedTable = quoteIdent(blueprint.sqlTableName || 'intake_records');

  const colDefs = blueprint.schemaRules.map((rule) => {
    const sqlType =
      rule.type === 'number' || rule.type === 'currency' ? 'NUMERIC(12,2)' : 'TEXT';
    const nullable = rule.required ? ' NOT NULL' : '';
    return `  ${quoteIdent(rule.key)} ${sqlType}${nullable}`;
  });
  colDefs.push('  "linked_asset_file" TEXT');
  colDefs.push('  "created_at" TIMESTAMPTZ DEFAULT NOW()');

  const ddl = `CREATE TABLE IF NOT EXISTS ${quotedTable} (\n  "id" SERIAL PRIMARY KEY,\n${colDefs.join(',\n')}\n);\n\n`;

  if (targetRows.length === 0) {
    return `${ddl}-- No verified rows selected for export.`;
  }

  const colNames = [
    ...blueprint.schemaRules.map((r) => quoteIdent(r.key)),
    quoteIdent('linked_asset_file'),
  ];
  const valuesSql = targetRows.map((row) => {
    const assetMatch = assets.find((a) => !a.isDuplicate && !a.error && a.linkedRowId === row.rowId);
    const vals = blueprint.schemaRules.map((r) => sqlEscape(row.cells[r.key]?.value));
    vals.push(sqlEscape(assetMatch?.healedFilename ?? null));
    return `  (${vals.join(', ')})`;
  });

  return `${ddl}INSERT INTO ${quotedTable} (${colNames.join(', ')})\nVALUES\n${valuesSql.join(',\n')};`;
}

/**
 * Compiles verified rows and media diagnostics into an executive Markdown specification
 * with HTML tag escaping (SEC-5 hardened).
 */
export function compileMarkdownSpec(
  rows: NormalizedRow[],
  blueprint: Blueprint,
  assets: ProcessedAsset[],
  clientName: string,
  onlyVerified = true
): string {
  const targetRows = onlyVerified ? rows.filter((r) => r.isRowVerified) : rows;
  const safeClientName = escapeHtmlChars(clientName);
  const headers = [...blueprint.schemaRules.map((r) => escapeHtmlChars(r.label)), 'Verified Asset'];
  const divider = headers.map(() => '---');

  const tableLines = [
    `| ${headers.join(' | ')} |`,
    `| ${divider.join(' | ')} |`,
  ];

  for (const row of targetRows) {
    const assetMatch = assets.find((a) => !a.isDuplicate && !a.error && a.linkedRowId === row.rowId);
    const rowCols = blueprint.schemaRules.map((r) => {
      const val = row.cells[r.key]?.value ?? '-';
      return escapeHtmlChars(String(val)).replace(/\|/g, '\\|');
    });
    rowCols.push(assetMatch ? `\`${escapeHtmlChars(assetMatch.healedFilename)}\`` : '_Pending_');
    tableLines.push(`| ${rowCols.join(' | ')} |`);
  }

  const cleanAssets = assets.filter((a) => !a.isDuplicate && !a.error);
  const assetChecklist = cleanAssets.map(
    (a) =>
      `- [x] **${escapeHtmlChars(a.healedFilename)}** (${a.healedWidth}x${a.healedHeight} ${a.mimeType.split('/')[1]?.toUpperCase() || 'IMG'}) — from \`${escapeHtmlChars(a.originalFilename)}\``
  );

  return [
    `# Verified Onboarding Package: ${safeClientName}`,
    `**Blueprint:** ${escapeHtmlChars(blueprint.name)}`,
    `**Verified Records:** ${targetRows.length} / ${rows.length}`,
    `**Normalized Assets:** ${cleanAssets.length}`,
    '',
    '## Normalized Data Table',
    ...tableLines,
    '',
    '## Verified Media Pack',
    ...(assetChecklist.length > 0 ? assetChecklist : ['_No media assets attached._']),
  ].join('\n');
}

/**
 * Compiles normalized rows into an RFC-4180 compliant CSV string with formula injection protection.
 */
export function compileCsvText(
  rows: NormalizedRow[],
  blueprint: Blueprint,
  assets: ProcessedAsset[],
  onlyVerified = true
): string {
  const targetRows = onlyVerified ? rows.filter((r) => r.isRowVerified) : rows;
  const headers = [...blueprint.schemaRules.map((r) => r.key), 'linked_asset_file'];

  const lines = [headers.map(csvEscapeField).join(',')];
  for (const row of targetRows) {
    const assetMatch = assets.find((a) => !a.isDuplicate && !a.error && a.linkedRowId === row.rowId);
    const cols = blueprint.schemaRules.map((r) => row.cells[r.key]?.value ?? '');
    cols.push(assetMatch?.healedFilename ?? '');
    lines.push(cols.map(csvEscapeField).join(','));
  }
  return lines.join('\r\n');
}

/**
 * Compiles structured JSON payload matching API/webhook egress schema.
 */
export function compileJsonExport(
  rows: NormalizedRow[],
  blueprint: Blueprint,
  assets: ProcessedAsset[],
  clientName: string,
  submissionId: string,
  onlyVerified = true
): string {
  const targetRows = onlyVerified ? rows.filter((r) => r.isRowVerified) : rows;
  const records = targetRows.map((row) => {
    const data: Record<string, string | number | null> = {};
    for (const rule of blueprint.schemaRules) {
      data[rule.key] = row.cells[rule.key]?.value ?? null;
    }
    const assetMatch = assets.find((a) => !a.isDuplicate && !a.error && a.linkedRowId === row.rowId);
    return {
      rowId: row.rowId,
      isRowVerified: row.isRowVerified,
      data,
      linkedAsset: assetMatch
        ? {
            filename: assetMatch.healedFilename,
            dimensions: `${assetMatch.healedWidth}x${assetMatch.healedHeight}`,
            dHash: assetMatch.dHash,
          }
        : null,
    };
  });

  return JSON.stringify(
    {
      submissionId,
      clientName,
      blueprint: blueprint.slug,
      sqlTableName: blueprint.sqlTableName,
      exportedAt: new Date().toISOString(),
      totalVerified: rows.filter((r) => r.isRowVerified).length,
      totalRows: rows.length,
      records,
    },
    null,
    2
  );
}

/**
 * Compiles normalized rows into a clean .xlsx Buffer with formula injection escaping (SEC-2 hardened).
 */
export function compileExcelBuffer(
  rows: NormalizedRow[],
  blueprint: Blueprint,
  assets: ProcessedAsset[],
  onlyVerified = true
): Buffer {
  const targetRows = onlyVerified ? rows.filter((r) => r.isRowVerified) : rows;
  const sheetData = targetRows.map((row) => {
    const record: Record<string, string | number> = {};
    for (const rule of blueprint.schemaRules) {
      record[rule.key] = sanitizeSpreadsheetValue(row.cells[rule.key]?.value);
    }
    const assetMatch = assets.find((a) => !a.isDuplicate && !a.error && a.linkedRowId === row.rowId);
    record['linked_asset_file'] = sanitizeSpreadsheetValue(assetMatch?.healedFilename ?? '');
    return record;
  });

  const ws = XLSX.utils.json_to_sheet(sheetData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Verified_Intake');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

/**
 * Bundles all valid non-duplicate healed images plus a JSON manifest into a downloadable ZIP buffer.
 */
export async function compileAssetZipBuffer(
  rows: NormalizedRow[],
  blueprint: Blueprint,
  assets: ProcessedAsset[],
  clientName: string,
  verifiedOnly: boolean = false
): Promise<Buffer> {
  const zip = new JSZip();
  const folder = zip.folder('01_Verified_Assets');

  const targetRows = verifiedOnly ? rows.filter((r) => r.isRowVerified) : rows;
  const verifiedRowIds = new Set(targetRows.map((r) => r.rowId));

  const cleanAssets = assets.filter(
    (a) =>
      !a.isDuplicate &&
      !a.error &&
      a.dataUrl &&
      (!verifiedOnly || !a.linkedRowId || verifiedRowIds.has(a.linkedRowId))
  );
  for (const asset of cleanAssets) {
    const base64Data = asset.dataUrl.split(',')[1] || '';
    folder?.file(asset.healedFilename, Buffer.from(base64Data, 'base64'));
  }

  zip.file(
    'manifest.json',
    JSON.stringify(
      {
        clientName,
        blueprint: blueprint.slug,
        exportedAt: new Date().toISOString(),
        totalVerifiedRows: rows.filter((r) => r.isRowVerified).length,
        totalAssets: cleanAssets.length,
        assets: cleanAssets.map((a) => ({
          filename: a.healedFilename,
          originalFilename: a.originalFilename,
          sku: a.linkedSku || null,
          dimensions: `${a.healedWidth}x${a.healedHeight}`,
          dHash: a.dHash,
        })),
      },
      null,
      2
    )
  );

  return zip.generateAsync({ type: 'nodebuffer' });
}
