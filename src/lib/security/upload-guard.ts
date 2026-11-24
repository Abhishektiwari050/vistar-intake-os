export const MAX_UPLOAD_FILES = 30;
export const MAX_SINGLE_FILE_BYTES = 15 * 1024 * 1024; // 15MB
export const MAX_TOTAL_BATCH_BYTES = 60 * 1024 * 1024; // 60MB

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MACRO_EXT_REGEX = /\.(xlsm|xltm|xlam|xlsb|xla)$/i;
const SPREADSHEET_EXT_REGEX = /\.(xlsx|xls|csv)$/i;
const IMAGE_EXT_REGEX = /\.(png|jpe?g|webp)$/i;

export function isValidUuid(id: string): boolean {
  return UUID_REGEX.test(id);
}

export async function parseSafeJson<T = unknown>(
  request: Request
): Promise<{ ok: true; data: T } | { ok: false; error: string }> {
  try {
    const data = (await request.json()) as T;
    return { ok: true, data };
  } catch {
    return { ok: false, error: 'Malformed or empty JSON payload' };
  }
}

export function isBlockedMacroFile(filename: string): boolean {
  return MACRO_EXT_REGEX.test(filename.toLowerCase());
}

/**
 * Inspects file magic bytes to prevent MIME/extension spoofing (e.g. HTML/JS disguised as .png).
 */
export function verifyFileSignature(
  buffer: Buffer,
  filename: string
): 'jpeg' | 'png' | 'webp' | 'xlsx' | 'xls' | 'csv' | 'invalid' {
  if (!buffer || buffer.length === 0) return 'invalid';

  const lower = filename.toLowerCase();

  // JPEG magic: FF D8 FF
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'jpeg';
  }
  // PNG magic: 89 50 4E 47
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return 'png';
  }
  // WEBP magic: RIFF....WEBP
  if (
    buffer.length >= 12 &&
    buffer.toString('ascii', 0, 4) === 'RIFF' &&
    buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'webp';
  }
  // XLSX (PK Zip) magic: 50 4B 03 04
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
  ) {
    return 'xlsx';
  }
  // Legacy XLS (OLE2 Compound Document): D0 CF 11 E0
  if (
    buffer.length >= 4 &&
    buffer[0] === 0xd0 &&
    buffer[1] === 0xcf &&
    buffer[2] === 0x11 &&
    buffer[3] === 0xe0
  ) {
    return 'xls';
  }

  // CSV plain text validation (reject binary/HTML executables pretending to be CSV)
  if (lower.endsWith('.csv') || !IMAGE_EXT_REGEX.test(lower)) {
    const headSample = buffer.subarray(0, 512).toString('utf8');
    if (/<script|<html|<!doctype/i.test(headSample) || headSample.includes('\x00')) {
      return 'invalid';
    }
    if (SPREADSHEET_EXT_REGEX.test(lower)) {
      return lower.endsWith('.csv') ? 'csv' : 'invalid';
    }
  }

  return 'invalid';
}

export interface ValidatedUploadPayload {
  spreadsheetBuffer?: Buffer;
  mediaAssets: Array<{ filename: string; buffer: Buffer; mimeType: string }>;
}

export async function extractValidatedMultipartFiles(
  formData: FormData
): Promise<{ ok: true; data: ValidatedUploadPayload } | { ok: false; error: string }> {
  const entries = formData.getAll('files');
  if (entries.length > MAX_UPLOAD_FILES) {
    return {
      ok: false,
      error: `Too many files (${entries.length}). Maximum allowed per batch is ${MAX_UPLOAD_FILES}.`,
    };
  }

  let totalBytes = 0;
  let spreadsheetBuffer: Buffer | undefined;
  const mediaAssets: Array<{ filename: string; buffer: Buffer; mimeType: string }> = [];

  for (const entry of entries) {
    if (!(entry instanceof File)) continue;
    const lowerName = entry.name.toLowerCase();

    if (isBlockedMacroFile(lowerName)) {
      return {
        ok: false,
        error: `Blocked unsafe macro-enabled spreadsheet: ${entry.name}`,
      };
    }

    if (entry.size === 0) {
      return {
        ok: false,
        error: `Uploaded file "${entry.name}" is empty (0 bytes).`,
      };
    }

    if (entry.size > MAX_SINGLE_FILE_BYTES) {
      return {
        ok: false,
        error: `File "${entry.name}" exceeds maximum size limit of 15MB.`,
      };
    }

    totalBytes += entry.size;
    if (totalBytes > MAX_TOTAL_BATCH_BYTES) {
      return {
        ok: false,
        error: 'Total batch upload size exceeds 60MB limit.',
      };
    }

    const buf = Buffer.from(await entry.arrayBuffer());
    const sig = verifyFileSignature(buf, lowerName);

    if (sig === 'invalid') {
      return {
        ok: false,
        error: `File "${entry.name}" failed magic-byte signature verification or has an unsupported format.`,
      };
    }

    if (sig === 'xlsx' || sig === 'xls' || sig === 'csv') {
      spreadsheetBuffer = buf;
    } else {
      const mimeMap: Record<'jpeg' | 'png' | 'webp', string> = {
        jpeg: 'image/jpeg',
        png: 'image/png',
        webp: 'image/webp',
      };
      mediaAssets.push({
        filename: entry.name,
        buffer: buf,
        mimeType: mimeMap[sig],
      });
    }
  }

  return { ok: true, data: { spreadsheetBuffer, mediaAssets } };
}

