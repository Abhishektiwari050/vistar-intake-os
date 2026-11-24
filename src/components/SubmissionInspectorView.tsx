'use client';

import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle, Clock, Fingerprint, Terminal, History } from 'lucide-react';
import type { Blueprint, IntakeSubmission } from '@/lib/types/intake';
import { DiffInspectorTable } from './DiffInspectorTable';
import { AssetGalleryPanel } from './AssetGalleryPanel';
import { ExportToolbar } from './ExportToolbar';
import { VistarLogo } from './VistarLogo';

interface SubmissionInspectorViewProps {
  initialSubmission: IntakeSubmission;
  blueprint: Blueprint;
}

export function SubmissionInspectorView({
  initialSubmission,
  blueprint,
}: SubmissionInspectorViewProps) {
  const [submission, setSubmission] = useState<IntakeSubmission>(initialSubmission);

  const refreshSubmission = async () => {
    const resp = await fetch(`/api/submissions/${submission.id}`);
    if (resp.ok) {
      const data = await resp.json();
      if (data.submission) setSubmission(data.submission);
    }
  };

  const patchSubmission = async (payload: Record<string, unknown>) => {
    const resp = await fetch(`/api/submissions/${submission.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (resp.ok) {
      const data = await resp.json();
      if (data.submission) {
        setSubmission(data.submission);
      }
    }
  };

  const handleCellUpdate = async (rowIndex: number, fieldKey: string, newValue: string) => {
    await patchSubmission({ action: 'edit_cell', rowIndex, fieldKey, newValue });
  };

  const handleCellRevert = async (rowIndex: number, fieldKey: string) => {
    await patchSubmission({ action: 'revert_cell', rowIndex, fieldKey });
  };

  const handleApproveAllHealed = async () => {
    await patchSubmission({ action: 'approve_all_healed' });
  };

  const handleReassignAsset = async (assetId: string, targetRowId: string | null) => {
    await patchSubmission({ action: 'reassign_asset', assetId, targetRowId });
  };

  const handleOverrideDuplicate = async (assetId: string, isDuplicate: boolean) => {
    await patchSubmission({ action: 'override_duplicate', assetId, isDuplicate });
  };

  const handleDeleteRows = async (rowIndices: number[]) => {
    if (!rowIndices || rowIndices.length === 0) return;
    const indicesToDelete = new Set(rowIndices);

    setSubmission((prev) => {
      const deletedRowIds = new Set(
        prev.rows.filter((r) => indicesToDelete.has(r.rowIndex)).map((r) => r.rowId)
      );

      const remainingRows = prev.rows
        .filter((r) => !deletedRowIds.has(r.rowId))
        .map((row, newIdx) => ({
          ...row,
          rowIndex: newIdx,
        }));

      const remainingAssets = prev.assets.map((asset) => {
        if (asset.linkedRowId && deletedRowIds.has(asset.linkedRowId)) {
          return {
            ...asset,
            linkedRowId: undefined,
            linkedSku: undefined,
            matchConfidence: 0,
          };
        }
        return asset;
      });

      let verifiedRowsCount = 0;
      for (const row of remainingRows) {
        if (row.isRowVerified) verifiedRowsCount++;
      }

      const nextStatus =
        remainingRows.length === 0
          ? 'draft'
          : verifiedRowsCount === remainingRows.length
          ? 'verified'
          : verifiedRowsCount > 0
          ? 'partial_approved'
          : 'draft';

      return {
        ...prev,
        status: nextStatus,
        rows: remainingRows,
        assets: remainingAssets,
        stats: {
          ...prev.stats,
          totalRawRows: remainingRows.length,
          verifiedRowsCount,
        },
      };
    });
  };

  const auditEvents = submission.auditEvents || [];

  return (
    <div className="space-y-6">
      {/* Breadcrumb Navigation & Top Bar */}
      <div className="flex items-center justify-between border-b border-black/[0.06] pb-4">
        <div className="flex items-center gap-2.5 text-xs text-zinc-500">
          <VistarLogo size="sm" />
          <span className="text-zinc-300">/</span>
          <a href="/" className="hover:text-zinc-950 transition-colors">
            Studio Console
          </a>
          <span className="text-zinc-300">/</span>
          <span className="text-zinc-500">Submissions</span>
          <span className="text-zinc-300">/</span>
          <span className="font-mono text-zinc-950 font-semibold">{submission.id.slice(0, 8)}</span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] font-medium border ${
              submission.status === 'verified'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                : 'border-zinc-200 bg-zinc-50 text-zinc-800'
            }`}
          >
            {submission.status === 'verified' ? 'Verified 100%' : 'Action Required'}
          </span>
          <span className="font-mono text-[11px] text-zinc-500">
            {submission.stats.totalProcessingMs}ms total
          </span>
        </div>
      </div>

      {/* Execution Summary Header (Apple Glassmorphism) */}
      <div className="glass-panel rounded-2xl p-6 transition-all duration-300">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl font-bold tracking-tight text-zinc-950">
                {submission.clientName}
              </h2>
              <span className="rounded-md border border-zinc-200/80 bg-zinc-100/80 px-2 py-0.5 font-mono text-[10px] font-semibold text-zinc-700 uppercase tracking-wider">
                SQL: {blueprint.sqlTableName}
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              Blueprint: <span className="font-medium text-zinc-800">{blueprint.name}</span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 font-mono text-[11px]">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-medium shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)] ${
                submission.stats.usedMappingMemory
                  ? 'border border-emerald-500/20 bg-emerald-500/10 text-emerald-800'
                  : 'border border-zinc-200 bg-white/70 text-zinc-700'
              }`}
            >
              <Fingerprint className="h-3.5 w-3.5 text-zinc-600" />
              {submission.stats.usedMappingMemory
                ? 'SHA-256 Cache Hit (0ms Map)'
                : `Fingerprint: ${submission.stats.headerFingerprint.slice(0, 8)}`}
            </span>
          </div>
        </div>

        {/* Pipeline Telemetry Horizontal Stepper */}
        <div className="mt-6 border-t border-zinc-200/60 pt-4">
          <div className="text-[10px] font-mono text-zinc-400 uppercase tracking-widest mb-2.5">
            Deterministic Pipeline Stages
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {submission.pipelineLogs.map((log, i) => (
              <div
                key={i}
                className="glass-panel-subtle flex flex-col justify-between rounded-xl p-3 transition-all duration-200 hover:bg-white/70"
              >
                <div className="flex items-center justify-between gap-1.5 mb-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shrink-0 animate-pulse-subtle" />
                    <span className="font-semibold text-xs text-zinc-900 truncate">
                      {log.step}
                    </span>
                  </div>
                  <span className="font-mono text-[10px] text-zinc-400 shrink-0 font-medium">
                    {log.durationMs}ms
                  </span>
                </div>
                <p className="text-[11px] text-zinc-500 leading-snug line-clamp-2" title={log.detail}>
                  {log.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Multi-Format Export & Chaser Toolbar */}
      <ExportToolbar
        submission={submission}
        blueprint={blueprint}
        onWebhookDispatched={refreshSubmission}
      />

      {/* Diff Inspector Table */}
      <DiffInspectorTable
        blueprint={blueprint}
        rows={submission.rows}
        assets={submission.assets}
        onCellUpdate={handleCellUpdate}
        onCellRevert={handleCellRevert}
        onApproveAllHealed={handleApproveAllHealed}
        onReassignAsset={handleReassignAsset}
        onDeleteRows={handleDeleteRows}
      />

      {/* Media Gallery */}
      <AssetGalleryPanel
        assets={submission.assets}
        rows={submission.rows}
        onReassignAsset={handleReassignAsset}
        onOverrideDuplicate={handleOverrideDuplicate}
      />

      {/* Audit Log Timeline */}
      {auditEvents.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-card overflow-hidden">
          <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50/70 px-4 py-3">
            <History className="h-4 w-4 text-slate-600" />
            <h3 className="text-sm font-semibold text-slate-900">
              Field &amp; Asset Modification Audit Log ({auditEvents.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-100 max-h-64 overflow-y-auto">
            {auditEvents.map((ev) => (
              <div key={ev.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-xs">
                <div className="flex items-center gap-2.5">
                  <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-semibold uppercase text-slate-700">
                    {ev.action.replace(/_/g, ' ')}
                  </span>
                  <span className="text-slate-800">{ev.detail}</span>
                </div>
                <span className="font-mono text-[10px] text-slate-400">
                  {ev.actor} · {new Date(ev.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
