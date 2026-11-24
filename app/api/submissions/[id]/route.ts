import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import * as crypto from 'node:crypto';
import { getDb } from '@/lib/db/client';
import { submissions } from '@/lib/db/schema';
import { getBlueprintBySlug } from '@/lib/pipeline/run-intake';
import { normalizeCell } from '@/lib/triage/normalizer';
import { isValidUuid, parseSafeJson } from '@/lib/security/upload-guard';
import type { AuditEvent, Blueprint, NormalizedRow } from '@/lib/types/intake';

function recomputeRowAndStats(
  rows: NormalizedRow[],
  blueprint: Blueprint
): { verifiedRowsCount: number; healedCellsCount: number } {
  let verifiedRowsCount = 0;
  let healedCellsCount = 0;

  for (const row of rows) {
    let rowOk = true;
    for (const rule of blueprint.schemaRules) {
      const cell = row.cells[rule.key];
      if (!cell) {
        if (rule.required) rowOk = false;
        continue;
      }
      if (cell.status === 'ai_healed') healedCellsCount++;
      if (cell.status === 'missing_required' || cell.status === 'invalid_format') {
        rowOk = false;
      }
    }
    row.isRowVerified = rowOk;
    row.pendingApproval = !rowOk;
    if (rowOk) verifiedRowsCount++;
  }

  return { verifiedRowsCount, healedCellsCount };
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { id } = await context.params;
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid submission UUID format' }, { status: 400 });
    }

    const db = await getDb();
    const found = await db.select().from(submissions).where(eq(submissions.id, id)).limit(1);
    if (!found.length) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }
    const sub = found[0];
    const blueprint = await getBlueprintBySlug(sub.blueprintSlug);
    return NextResponse.json({ submission: sub, blueprint });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch submission' },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { id } = await context.params;
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid submission UUID format' }, { status: 400 });
    }

    const jsonRes = await parseSafeJson<{
      action?:
        | 'edit_cell'
        | 'revert_cell'
        | 'approve_all_healed'
        | 'reassign_asset'
        | 'override_duplicate';
      rowIndex?: number;
      fieldKey?: string;
      newValue?: string;
      assetId?: string;
      targetRowId?: string | null;
      isDuplicate?: boolean;
      status?: 'draft' | 'partial_approved' | 'verified';
    }>(request);

    if (!jsonRes.ok) {
      return NextResponse.json({ error: jsonRes.error }, { status: 400 });
    }
    const body = jsonRes.data;

    const db = await getDb();
    const found = await db.select().from(submissions).where(eq(submissions.id, id)).limit(1);
    if (!found.length) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    const sub = found[0];
    const blueprint = await getBlueprintBySlug(sub.blueprintSlug);
    if (!blueprint) {
      return NextResponse.json({ error: 'Blueprint missing' }, { status: 404 });
    }

    const updatedRows = structuredClone(sub.rows);
    const updatedAssets = structuredClone(sub.assets);
    const auditEvents: AuditEvent[] = Array.isArray(sub.auditEvents) ? [...sub.auditEvents] : [];
    const nowIso = new Date().toISOString();

    const action = body.action || 'edit_cell';

    if (action === 'edit_cell') {
      const targetIdx = body.rowIndex;
      if (
        targetIdx !== undefined &&
        body.fieldKey &&
        body.newValue !== undefined &&
        updatedRows[targetIdx]
      ) {
        const rule = blueprint.schemaRules.find((r) => r.key === body.fieldKey);
        if (rule) {
          const prevVal = updatedRows[targetIdx].cells[body.fieldKey]?.value;
          const reNormalized = normalizeCell(body.newValue, rule);
          updatedRows[targetIdx].cells[body.fieldKey] = {
            ...reNormalized,
            status:
              reNormalized.status === 'invalid_format' || reNormalized.status === 'missing_required'
                ? reNormalized.status
                : 'verified',
          };
          auditEvents.unshift({
            id: crypto.randomUUID(),
            timestamp: nowIso,
            actor: 'Studio Operator',
            action: 'cell_edited',
            detail: `Row ${targetIdx + 1} (${rule.label}): "${prevVal ?? 'Empty'}" -> "${reNormalized.value}"`,
          });
        }
      }
    } else if (action === 'revert_cell') {
      const targetIdx = body.rowIndex;
      if (targetIdx !== undefined && body.fieldKey && updatedRows[targetIdx]) {
        const cell = updatedRows[targetIdx].cells[body.fieldKey];
        if (cell && cell.originalRaw !== null) {
          const prevVal = cell.value;
          updatedRows[targetIdx].cells[body.fieldKey] = {
            ...cell,
            value: cell.originalRaw,
            status: 'verified',
            reason: 'Manually reverted to raw value',
          };
          auditEvents.unshift({
            id: crypto.randomUUID(),
            timestamp: nowIso,
            actor: 'Studio Operator',
            action: 'cell_reverted',
            detail: `Row ${targetIdx + 1} (${body.fieldKey}): Reverted "${prevVal}" -> raw "${cell.originalRaw}"`,
          });
        }
      }
    } else if (action === 'approve_all_healed') {
      let countApproved = 0;
      for (const row of updatedRows) {
        for (const rule of blueprint.schemaRules) {
          const cell = row.cells[rule.key];
          if (cell && cell.status === 'ai_healed') {
            cell.status = 'verified';
            countApproved++;
          }
        }
      }
      if (countApproved > 0) {
        auditEvents.unshift({
          id: crypto.randomUUID(),
          timestamp: nowIso,
          actor: 'Studio Operator',
          action: 'bulk_healed_approved',
          detail: `Bulk-confirmed ${countApproved} auto-healed cell(s) as verified.`,
        });
      }
    } else if (action === 'reassign_asset' && body.assetId) {
      const asset = updatedAssets.find((a) => a.id === body.assetId);
      if (asset) {
        // Clear previous row linkage
        for (const row of updatedRows) {
          row.linkedAssetIds = row.linkedAssetIds.filter((aid) => aid !== asset.id);
        }
        if (body.targetRowId) {
          const targetRow = updatedRows.find((r) => r.rowId === body.targetRowId);
          if (targetRow) {
            targetRow.linkedAssetIds.push(asset.id);
            const skuVal = String(
              (targetRow.cells.sku || targetRow.cells.module_id)?.value || targetRow.rowId
            );
            asset.linkedRowId = targetRow.rowId;
            asset.linkedSku = skuVal;
            asset.matchConfidence = 1.0;
            auditEvents.unshift({
              id: crypto.randomUUID(),
              timestamp: nowIso,
              actor: 'Studio Operator',
              action: 'asset_reassigned',
              detail: `Assigned "${asset.healedFilename}" -> ${skuVal} (${targetRow.rowId})`,
            });
          }
        } else {
          asset.linkedRowId = undefined;
          asset.linkedSku = undefined;
          asset.matchConfidence = 0;
          auditEvents.unshift({
            id: crypto.randomUUID(),
            timestamp: nowIso,
            actor: 'Studio Operator',
            action: 'asset_reassigned',
            detail: `Unlinked "${asset.healedFilename}" from row`,
          });
        }
      }
    } else if (action === 'override_duplicate' && body.assetId && body.isDuplicate !== undefined) {
      const asset = updatedAssets.find((a) => a.id === body.assetId);
      if (asset) {
        asset.isDuplicate = body.isDuplicate;
        auditEvents.unshift({
          id: crypto.randomUUID(),
          timestamp: nowIso,
          actor: 'Studio Operator',
          action: 'duplicate_overridden',
          detail: `${body.isDuplicate ? 'Flagged' : 'Restored'} "${asset.healedFilename}" duplicate status`,
        });
      }
    }

    const { verifiedRowsCount, healedCellsCount } = recomputeRowAndStats(updatedRows, blueprint);
    const duplicatesRemoved = updatedAssets.filter((a) => a.isDuplicate).length;
    const visionMatchedCount = updatedAssets.filter((a) => !a.isDuplicate && a.linkedRowId).length;

    const nextStatus =
      body.status ||
      (verifiedRowsCount === updatedRows.length && updatedRows.length > 0
        ? 'verified'
        : verifiedRowsCount > 0
        ? 'partial_approved'
        : 'draft');

    const updatedStats = {
      ...sub.stats,
      verifiedRowsCount,
      healedCellsCount,
      duplicatesRemoved,
      visionMatchedCount,
    };

    const [saved] = await db
      .update(submissions)
      .set({
        rows: updatedRows,
        assets: updatedAssets,
        auditEvents: auditEvents.slice(0, 100),
        status: nextStatus,
        stats: updatedStats,
      })
      .where(eq(submissions.id, id))
      .returning();

    return NextResponse.json({ submission: saved, blueprint });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to update submission' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  try {
    const { id } = await context.params;
    if (!isValidUuid(id)) {
      return NextResponse.json({ error: 'Invalid submission UUID format' }, { status: 400 });
    }

    const db = await getDb();
    const deleted = await db.delete(submissions).where(eq(submissions.id, id)).returning();
    if (!deleted.length) {
      return NextResponse.json({ error: 'Submission not found' }, { status: 404 });
    }

    return NextResponse.json({ deleted: true, id });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to delete submission' },
      { status: 500 }
    );
  }
}
