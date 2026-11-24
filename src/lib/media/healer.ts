import sharp from 'sharp';
import * as crypto from 'node:crypto';
import type { DuplicateMetrics, MediaRuleConfig, NormalizedRow, ProcessedAsset } from '@/lib/types/intake';

export interface RawUploadedAsset {
  filename: string;
  buffer: Buffer;
  mimeType: string;
}

const MAX_PIXEL_COUNT = 64_000_000; // Guard against pixel decompression bombs

/**
 * Computes a 64-bit Perceptual Difference Hash (dHash) using a 9x8 grayscale grid.
 * Resilient to slight resizing, compression artifacts, and filename changes.
 */
export async function computeDifferenceHash(buffer: Buffer): Promise<string> {
  const { data } = await sharp(buffer, { limitInputPixels: MAX_PIXEL_COUNT })
    .resize(9, 8, { fit: 'fill' })
    .grayscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  let bits = '';
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const left = data[row * 9 + col];
      const right = data[row * 9 + col + 1];
      bits += left > right ? '1' : '0';
    }
  }

  let hex = '';
  for (let i = 0; i < 64; i += 4) {
    hex += parseInt(bits.slice(i, i + 4), 2).toString(16);
  }
  return hex;
}

/**
 * Computes average R/G/B channel signature so differently colored SKUs
 * with identical silhouettes are never falsely collapsed as duplicates.
 */
async function computeMeanRgb(buffer: Buffer): Promise<[number, number, number]> {
  const stats = await sharp(buffer, { limitInputPixels: MAX_PIXEL_COUNT }).stats();
  const r = stats.channels[0]?.mean ?? 0;
  const g = stats.channels[1]?.mean ?? r;
  const b = stats.channels[2]?.mean ?? r;
  return [r, g, b];
}

function rgbDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

/**
 * Computes Hamming distance between two 16-char hex hashes (0 = exact match, <= 4 = near duplicate).
 */
export function hammingDistance(hexA: string, hexB: string): number {
  if (hexA.length !== hexB.length) return 64;
  let distance = 0;
  for (let i = 0; i < hexA.length; i++) {
    const xor = parseInt(hexA[i], 16) ^ parseInt(hexB[i], 16);
    distance += xor.toString(2).replace(/0/g, '').length;
  }
  return distance;
}

function slugifyToken(val: string): string {
  return val
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
}

/**
 * Matches an asset filename/content against normalized rows using token overlap,
 * optionally leveraging Gemini Vision if filename is opaque.
 */
async function matchAssetToRow(
  filename: string,
  buffer: Buffer,
  mimeType: string,
  rows: NormalizedRow[]
): Promise<{ row?: NormalizedRow; sku?: string; confidence: number }> {
  if (rows.length === 0) return { confidence: 0 };

  const cleanFileTokens = filename
    .replace(/\.[^.]+$/, '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2 && !['img', 'dsc', 'whatsapp', 'image', 'photo', 'copy'].includes(t));

  let bestRow: NormalizedRow | undefined;
  let bestScore = 0;

  for (const row of rows) {
    const skuCell = row.cells.sku || row.cells.module_id;
    const titleCell = row.cells.title || row.cells.feature_name;
    const catCell = row.cells.category;

    const skuStr = String(skuCell?.value || '').toLowerCase();
    const titleStr = String(titleCell?.value || '').toLowerCase();
    const catStr = String(catCell?.value || '').toLowerCase();
    const combinedRowText = `${skuStr} ${titleStr} ${catStr}`;

    // SEC-7 Guard: require >= 2 alphanumeric chars so "-" or empty SKU never matches all files
    const cleanedSku = skuStr.replace(/[^a-z0-9]/g, '');
    if (cleanedSku.length >= 2 && filename.toLowerCase().replace(/[^a-z0-9]/g, '').includes(cleanedSku)) {
      return {
        row,
        sku: String(skuCell?.value || row.rowId),
        confidence: 0.99,
      };
    }

    let hits = 0;
    for (const token of cleanFileTokens) {
      if (combinedRowText.includes(token)) hits++;
    }
    const score = cleanFileTokens.length > 0 ? hits / cleanFileTokens.length : 0;
    if (score > bestScore) {
      bestScore = score;
      bestRow = row;
    }
  }

  if (bestRow && bestScore >= 0.4) {
    const skuVal = String((bestRow.cells.sku || bestRow.cells.module_id)?.value || bestRow.rowId);
    return { row: bestRow, sku: skuVal, confidence: Math.min(0.95, 0.65 + bestScore * 0.3) };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey) {
    try {
      const candidateSummary = rows.map((r) => ({
        rowId: r.rowId,
        sku: (r.cells.sku || r.cells.module_id)?.value,
        title: (r.cells.title || r.cells.feature_name)?.value,
      }));
      const base64Img = buffer.toString('base64');
      const prompt = `Match this product/brand image to the best row from ${JSON.stringify(
        candidateSummary
      )}. Return strict JSON: {"rowId": string | null, "confidence": number}.`;

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  { inlineData: { mimeType: mimeType || 'image/jpeg', data: base64Img } },
                ],
              },
            ],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      );

      if (resp.ok) {
        const json = await resp.json();
        const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleanedJson = rawText
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/, '')
          .trim();
        if (cleanedJson) {
          const parsed = JSON.parse(cleanedJson) as { rowId: string | null; confidence: number };
          const matched = rows.find((r) => r.rowId === parsed.rowId);
          if (matched) {
            const skuVal = String((matched.cells.sku || matched.cells.module_id)?.value || matched.rowId);
            return { row: matched, sku: skuVal, confidence: parsed.confidence || 0.88 };
          }
        }
      }
    } catch {
      // Graceful fallback
    }
  }

  return { confidence: 0 };
}

/**
 * Ensures unique healed filenames when multiple photos match the same SKU,
 * preventing silent ZIP overwrites.
 */
function ensureUniqueFilename(baseName: string, ext: string, usedNames: Set<string>): string {
  const safeBase = baseName || 'asset';
  let candidate = `${safeBase}.${ext}`;
  let idx = 2;
  while (usedNames.has(candidate)) {
    candidate = `${safeBase}-${idx}.${ext}`;
    idx++;
  }
  usedNames.add(candidate);
  return candidate;
}

/**
 * Processes and auto-heals uploaded images in memory-safe batches of 4.
 * Isolates corrupt or 0-byte files cleanly so one bad file never aborts valid assets.
 */
export async function healAndLinkAssets(
  rawAssets: RawUploadedAsset[],
  rows: NormalizedRow[],
  mediaRules: MediaRuleConfig
): Promise<{
  assets: ProcessedAsset[];
  duplicatesRemoved: number;
  assetsAutoHealed: number;
  visionMatchedCount: number;
  corruptAssetsCount: number;
}> {
  const processed: ProcessedAsset[] = [];
  const seenHashes: Array<{ id: string; hash: string; rgb: [number, number, number]; filename: string }> = [];
  const usedFilenames = new Set<string>();
  let duplicatesRemoved = 0;
  let assetsAutoHealed = 0;
  let visionMatchedCount = 0;
  let corruptAssetsCount = 0;

  const BATCH_SIZE = 4;
  for (let i = 0; i < rawAssets.length; i += BATCH_SIZE) {
    const batch = rawAssets.slice(i, i + BATCH_SIZE);

    // Step A: Precompute metadata & perceptual hashes with per-file error isolation
    const precomputed = await Promise.all(
      batch.map(async (item) => {
        const id = crypto.randomUUID();
        try {
          if (!item.buffer || item.buffer.length === 0) {
            throw new Error('0-byte empty image buffer');
          }
          const metadata = await sharp(item.buffer, { limitInputPixels: MAX_PIXEL_COUNT }).metadata();
          if (!metadata.width || !metadata.height) {
            throw new Error('Image missing valid width/height dimensions');
          }
          const dHash = await computeDifferenceHash(item.buffer);
          const rgb = await computeMeanRgb(item.buffer);
          return {
            id,
            item,
            origW: metadata.width,
            origH: metadata.height,
            dHash,
            rgb,
            error: null as string | null,
          };
        } catch (err) {
          return {
            id,
            item,
            origW: 0,
            origH: 0,
            dHash: '0000000000000000',
            rgb: [0, 0, 0] as [number, number, number],
            error: err instanceof Error ? err.message : 'Corrupt or unsupported image',
          };
        }
      })
    );

    // Step B: Resolve perceptual duplicates deterministically in input order
    const dedupResolved = precomputed.map((entry) => {
      if (entry.error) {
        return {
          ...entry,
          isDuplicate: false,
          duplicateOfFilename: undefined,
          duplicateOfAssetId: undefined,
          duplicateMetrics: undefined,
        };
      }

      let isDuplicate = false;
      let duplicateOfFilename: string | undefined;
      let duplicateOfAssetId: string | undefined;
      let duplicateMetrics: DuplicateMetrics | undefined;

      if (mediaRules.deduplicateByHash) {
        for (const prev of seenHashes) {
          const hDist = hammingDistance(entry.dHash, prev.hash);
          const cDist = Math.round(rgbDistance(entry.rgb, prev.rgb) * 10) / 10;
          if (hDist <= 4 && cDist <= 28) {
            isDuplicate = true;
            duplicateOfFilename = prev.filename;
            duplicateOfAssetId = prev.id;
            duplicateMetrics = {
              hammingDistance: hDist,
              rgbDistance: cDist,
              thresholdHamming: 4,
              thresholdRgb: 28,
            };
            break;
          }
        }
      }

      if (!isDuplicate) {
        seenHashes.push({
          id: entry.id,
          hash: entry.dHash,
          rgb: entry.rgb,
          filename: entry.item.filename,
        });
      }

      return { ...entry, isDuplicate, duplicateOfFilename, duplicateOfAssetId, duplicateMetrics };
    });

    // Step C: Heal valid assets & isolate corrupt entries safely
    const batchResults = await Promise.all(
      dedupResolved.map(
        async ({
          id,
          item,
          origW,
          origH,
          dHash,
          rgb,
          isDuplicate,
          duplicateOfFilename,
          duplicateOfAssetId,
          duplicateMetrics,
          error,
        }) => {
          if (error) {
            return {
              id,
              originalFilename: item.filename,
              healedFilename: item.filename,
              mimeType: item.mimeType || 'application/octet-stream',
              originalWidth: 0,
              originalHeight: 0,
              healedWidth: 0,
              healedHeight: 0,
              dHash,
              meanRgb: rgb,
              isDuplicate: false,
              wasAutoHealed: false,
              healActions: [`Corrupt asset isolated: ${error}`],
              matchConfidence: 0,
              dataUrl: '',
              byteSize: item.buffer?.length || 0,
              error,
            } satisfies ProcessedAsset;
          }

          const healActions: string[] = ['Stripped EXIF/GPS metadata'];
          let wasAutoHealed = false;
          const targetW = mediaRules.targetWidth;
          const targetH = mediaRules.targetHeight;

          let pipeline = sharp(item.buffer, { limitInputPixels: MAX_PIXEL_COUNT }).rotate();
          if (mediaRules.autoHealOffRatio && (origW !== targetW || origH !== targetH)) {
            wasAutoHealed = true;
            if (origW !== origH && mediaRules.aspectRatio === '1:1') {
              healActions.push(`Padded ${origW}x${origH} -> ${targetW}x${targetH} (1:1 studio canvas)`);
            } else {
              healActions.push(`Resized ${origW}x${origH} -> ${targetW}x${targetH}`);
            }
            pipeline = pipeline.resize(targetW, targetH, {
              fit: 'contain',
              background: { r: 255, g: 255, b: 255, alpha: 1 },
            });
          }

          const outMime = mediaRules.outputFormat === 'png' ? 'image/png' : 'image/webp';
          const outBuffer =
            mediaRules.outputFormat === 'png'
              ? await pipeline.png({ compressionLevel: 8 }).toBuffer()
              : await pipeline.webp({ quality: 88 }).toBuffer();

          if (item.mimeType !== outMime) {
            wasAutoHealed = true;
            healActions.push(`Converted format -> ${mediaRules.outputFormat.toUpperCase()}`);
          }

          const match = isDuplicate
            ? { confidence: 0 }
            : await matchAssetToRow(item.filename, outBuffer, outMime, rows);

          let baseName = slugifyToken(item.filename.replace(/\.[^.]+$/, ''));
          if (match.row && match.sku) {
            const titleVal = String((match.row.cells.title || match.row.cells.feature_name)?.value || '');
            const slugTitle = slugifyToken(titleVal);
            baseName = slugTitle ? `${match.sku}-${slugTitle}` : `${match.sku}`;
          }

          return {
            asset: {
              id,
              originalFilename: item.filename,
              healedFilename: item.filename,
              mimeType: outMime,
              originalWidth: origW,
              originalHeight: origH,
              healedWidth: targetW,
              healedHeight: targetH,
              dHash,
              meanRgb: rgb,
              isDuplicate,
              duplicateOfFilename,
              duplicateOfAssetId,
              duplicateMetrics,
              wasAutoHealed,
              healActions,
              linkedRowId: match.row?.rowId,
              linkedSku: match.sku,
              matchConfidence: match.confidence,
              dataUrl: `data:${outMime};base64,${outBuffer.toString('base64')}`,
              byteSize: outBuffer.length,
            } satisfies ProcessedAsset,
            baseName,
            matchedRow: match.row,
          };
        }
      )
    );

    // Assign unique filenames and link rows deterministically in exact batch order
    for (const itemResult of batchResults) {
      if ('error' in itemResult && !('asset' in itemResult)) {
        corruptAssetsCount++;
        processed.push(itemResult);
        continue;
      }

      const { asset: res, baseName, matchedRow } = itemResult as {
        asset: ProcessedAsset;
        baseName: string;
        matchedRow?: NormalizedRow;
      };

      const healedFilename = res.isDuplicate
        ? `${baseName}-dup.${mediaRules.outputFormat}`
        : ensureUniqueFilename(baseName, mediaRules.outputFormat, usedFilenames);

      res.healedFilename = healedFilename;

      if (matchedRow) {
        matchedRow.linkedAssetIds.push(res.id);
        if (healedFilename !== res.originalFilename) {
          res.healActions.push(`Renamed -> ${healedFilename}`);
          res.wasAutoHealed = true;
        }
      }

      if (res.isDuplicate) duplicatesRemoved++;
      else {
        if (res.wasAutoHealed) assetsAutoHealed++;
        if (res.linkedRowId) visionMatchedCount++;
      }
      processed.push(res);
    }
  }

  return {
    assets: processed,
    duplicatesRemoved,
    assetsAutoHealed,
    visionMatchedCount,
    corruptAssetsCount,
  };
}
