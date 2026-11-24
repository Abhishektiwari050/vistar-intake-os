import { eq, and, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';
import { blueprints, mappingMemory, submissions } from '@/lib/db/schema';
import { sanitizeRawTextInput, sanitizeSpreadsheetBuffer } from '@/lib/excel/sanitizer';
import {
  buildColumnMappingPreview,
  normalizeDataset,
  resolveColumnMapping,
} from '@/lib/triage/normalizer';
import { healAndLinkAssets, type RawUploadedAsset } from '@/lib/media/healer';
import type {
  Blueprint,
  ColumnMappingPreview,
  IntakeSubmission,
  PipelineStepLog,
  SubmissionStats,
} from '@/lib/types/intake';

export interface RunIntakeInput {
  blueprintSlug: string;
  clientName: string;
  spreadsheetBuffer?: Buffer;
  rawText?: string;
  mediaAssets?: RawUploadedAsset[];
  columnMappingOverride?: Record<string, string>;
}

export interface StagedPreviewResponse {
  blueprintSlug: string;
  sheetName: string;
  headerFingerprint: string;
  totalRawRows: number;
  cleanRowsCount: number;
  strippedNoiseRows: number;
  usedMappingMemory: boolean;
  columns: ColumnMappingPreview[];
}

export async function getBlueprintBySlug(slug: string): Promise<Blueprint | null> {
  const db = await getDb();
  const found = await db.select().from(blueprints).where(eq(blueprints.slug, slug)).limit(1);
  if (!found.length) return null;
  const row = found[0];
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    targetType: row.targetType as Blueprint['targetType'],
    sqlTableName: row.sqlTableName,
    schemaRules: row.schemaRules,
    mediaRules: row.mediaRules,
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Staged Step 1: Parses uploaded spreadsheet/text and predicts column mappings + sample rows
 * WITHOUT writing to the submissions table, enabling Flatfile-style Interactive Mapping Override.
 */
export async function previewIntakeMapping(input: {
  blueprintSlug: string;
  spreadsheetBuffer?: Buffer;
  rawText?: string;
}): Promise<StagedPreviewResponse> {
  const blueprint = await getBlueprintBySlug(input.blueprintSlug);
  if (!blueprint) {
    throw new Error(`Blueprint not found for slug: ${input.blueprintSlug}`);
  }

  const sanitized = input.spreadsheetBuffer
    ? sanitizeSpreadsheetBuffer(input.spreadsheetBuffer)
    : sanitizeRawTextInput(input.rawText || '');

  const db = await getDb();
  const cachedMem = await db
    .select()
    .from(mappingMemory)
    .where(
      and(
        eq(mappingMemory.blueprintId, blueprint.id),
        eq(mappingMemory.headerHash, sanitized.headerFingerprint)
      )
    )
    .limit(1);

  const cachedMapping = cachedMem.length > 0 ? cachedMem[0].mappingJson : null;
  const { mapping, confidences, usedMemory } = await resolveColumnMapping(
    sanitized.headers,
    blueprint.schemaRules,
    cachedMapping
  );

  const columns = buildColumnMappingPreview(
    sanitized.headers,
    sanitized.rows,
    mapping,
    confidences
  );

  return {
    blueprintSlug: blueprint.slug,
    sheetName: sanitized.sheetName,
    headerFingerprint: sanitized.headerFingerprint,
    totalRawRows: sanitized.totalRawRows,
    cleanRowsCount: sanitized.rows.length,
    strippedNoiseRows: sanitized.strippedTopBannerRows + sanitized.strippedFooterSummaryRows,
    usedMappingMemory: usedMemory,
    columns,
  };
}

/**
 * Executes the complete Vistar Intake Pipeline end-to-end:
 * 1. Pre-Ingestion Sanitization (unmerges cells, strips banner & TOTAL rows)
 * 2. SHA-256 Mapping Memory Cache Check + Override / Semantic / AI Column Mapping
 * 3. Deterministic Cell Normalization & Zod Schema Gate
 * 4. Media Auto-Healing (1080x1080 padding, WebP/PNG conversion, dHash deduplication, SKU linking)
 * 5. Postgres Persistence
 */
export async function runIntakePipeline(input: RunIntakeInput): Promise<IntakeSubmission> {
  const pipelineStart = performance.now();
  const logs: PipelineStepLog[] = [];

  const blueprint = await getBlueprintBySlug(input.blueprintSlug);
  if (!blueprint) {
    throw new Error(`Blueprint not found for slug: ${input.blueprintSlug}`);
  }

  // Step 1: Pre-Ingestion Sanitizer
  const step1Start = performance.now();
  const sanitized = input.spreadsheetBuffer
    ? sanitizeSpreadsheetBuffer(input.spreadsheetBuffer)
    : sanitizeRawTextInput(input.rawText || '');

  const strippedNoiseRows = sanitized.strippedTopBannerRows + sanitized.strippedFooterSummaryRows;
  logs.push({
    step: 'Pre-Ingestion Structural Sanitizer',
    status: 'completed',
    detail: `Parsed sheet "${sanitized.sheetName}" (${sanitized.rows.length} clean records). Stripped ${sanitized.strippedTopBannerRows} banner row(s) and ${sanitized.strippedFooterSummaryRows} summary/total row(s).`,
    durationMs: Math.round(performance.now() - step1Start),
  });

  // Step 2: SHA-256 Mapping Memory Check + Schema Mapping (respecting manual user override)
  const step2Start = performance.now();
  const db = await getDb();
  let mapping: Record<string, string>;
  let usedAi = false;
  let usedMemory = false;

  if (input.columnMappingOverride && Object.keys(input.columnMappingOverride).length > 0) {
    mapping = input.columnMappingOverride;
    if (sanitized.headers.length > 0) {
      await db
        .insert(mappingMemory)
        .values({
          blueprintId: blueprint.id,
          headerHash: sanitized.headerFingerprint,
          mappingJson: mapping,
        })
        .onConflictDoUpdate({
          target: [mappingMemory.blueprintId, mappingMemory.headerHash],
          set: { mappingJson: mapping, hitCount: sql`${mappingMemory.hitCount} + 1` },
        });
    }
    logs.push({
      step: 'SHA-256 Mapping Memory & Schema Mapper',
      status: 'completed',
      detail: `Applied user-verified mapping (${Object.keys(mapping).length} columns) & persisted signature ${sanitized.headerFingerprint.slice(0, 10)}...`,
      durationMs: Math.round(performance.now() - step2Start),
    });
  } else {
    const cachedMem = await db
      .select()
      .from(mappingMemory)
      .where(
        and(
          eq(mappingMemory.blueprintId, blueprint.id),
          eq(mappingMemory.headerHash, sanitized.headerFingerprint)
        )
      )
      .limit(1);

    const cachedMapping = cachedMem.length > 0 ? cachedMem[0].mappingJson : null;
    const resolved = await resolveColumnMapping(
      sanitized.headers,
      blueprint.schemaRules,
      cachedMapping
    );
    mapping = resolved.mapping;
    usedAi = resolved.usedAi;
    usedMemory = resolved.usedMemory;

    if (usedMemory && cachedMem.length > 0) {
      await db
        .update(mappingMemory)
        .set({ hitCount: sql`${mappingMemory.hitCount} + 1` })
        .where(eq(mappingMemory.id, cachedMem[0].id));
    } else if (Object.keys(mapping).length > 0 && sanitized.headers.length > 0) {
      await db
        .insert(mappingMemory)
        .values({
          blueprintId: blueprint.id,
          headerHash: sanitized.headerFingerprint,
          mappingJson: mapping,
        })
        .onConflictDoNothing();
    }

    logs.push({
      step: 'SHA-256 Mapping Memory & Schema Mapper',
      status: 'completed',
      detail: usedMemory
        ? `Cache Hit (${sanitized.headerFingerprint.slice(0, 10)}...): Executed 0ms deterministic transform.`
        : usedAi
        ? `Gemini AI mapped ${Object.keys(mapping).length} columns & cached signature ${sanitized.headerFingerprint.slice(0, 10)}...`
        : `Semantic engine mapped ${Object.keys(mapping).length} columns & cached signature ${sanitized.headerFingerprint.slice(0, 10)}...`,
      durationMs: Math.round(performance.now() - step2Start),
    });
  }

  // Step 3: Deterministic Normalization & Zod Gate
  const step3Start = performance.now();
  const { rows, healedCellsCount, verifiedRowsCount } = normalizeDataset(
    sanitized.rows,
    blueprint,
    mapping
  );

  logs.push({
    step: 'Deterministic Validation & Currency Normalization',
    status: verifiedRowsCount === rows.length ? 'completed' : 'warning',
    detail: `${verifiedRowsCount}/${rows.length} rows fully verified. Auto-healed ${healedCellsCount} messy cells (currency, casing, SKU formatting).`,
    durationMs: Math.round(performance.now() - step3Start),
  });

  // Step 4: Media Auto-Healer & Perceptual dHash Deduplication
  const step4Start = performance.now();
  const rawMedia = input.mediaAssets || [];
  const { assets, duplicatesRemoved, assetsAutoHealed, visionMatchedCount, corruptAssetsCount } =
    await healAndLinkAssets(rawMedia, rows, blueprint.mediaRules);

  logs.push({
    step: 'Media Auto-Healer & dHash Deduplication',
    status: corruptAssetsCount > 0 ? 'warning' : rawMedia.length > 0 ? 'completed' : 'skipped',
    detail:
      rawMedia.length > 0
        ? `Processed ${rawMedia.length} image(s): Auto-healed ${assetsAutoHealed} to ${blueprint.mediaRules.targetWidth}x${blueprint.mediaRules.targetHeight} ${blueprint.mediaRules.outputFormat.toUpperCase()}, removed ${duplicatesRemoved} duplicate(s) via dHash, linked ${visionMatchedCount} to SKUs${corruptAssetsCount > 0 ? `, isolated ${corruptAssetsCount} corrupt file(s)` : ''}.`
        : 'No media assets attached to this batch.',
    durationMs: Math.round(performance.now() - step4Start),
  });

  const status: IntakeSubmission['status'] =
    rows.length > 0 && verifiedRowsCount === rows.length
      ? 'verified'
      : verifiedRowsCount > 0
      ? 'partial_approved'
      : 'draft';

  const stats: SubmissionStats = {
    totalRawRows: sanitized.totalRawRows,
    strippedNoiseRows,
    verifiedRowsCount,
    healedCellsCount,
    totalAssetsUploaded: rawMedia.length,
    duplicatesRemoved,
    assetsAutoHealed,
    visionMatchedCount,
    usedMappingMemory: usedMemory,
    headerFingerprint: sanitized.headerFingerprint,
    totalProcessingMs: Math.round(performance.now() - pipelineStart),
  };

  const [inserted] = await db
    .insert(submissions)
    .values({
      blueprintId: blueprint.id,
      blueprintSlug: blueprint.slug,
      clientName: input.clientName,
      status,
      rows,
      assets,
      pipelineLogs: logs,
      auditEvents: [],
      stats,
    })
    .returning();

  return {
    id: inserted.id,
    blueprintId: inserted.blueprintId,
    blueprintSlug: inserted.blueprintSlug,
    clientName: inserted.clientName,
    status: inserted.status as IntakeSubmission['status'],
    rows: inserted.rows,
    assets: inserted.assets,
    pipelineLogs: inserted.pipelineLogs,
    auditEvents: inserted.auditEvents || [],
    stats: inserted.stats,
    createdAt: inserted.createdAt.toISOString(),
  };
}
