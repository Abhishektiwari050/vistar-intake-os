'use client';

import React, { useEffect, useState } from 'react';
import { X, ArrowRight, CheckCircle2, AlertTriangle, Loader2, Fingerprint } from 'lucide-react';
import type { Blueprint } from '@/lib/types/intake';
import type { StagedPreviewResponse } from '@/lib/pipeline/run-intake';

interface ColumnMappingModalProps {
  preview: StagedPreviewResponse;
  blueprint: Blueprint;
  submitting: boolean;
  onClose: () => void;
  onConfirm: (mappingOverride: Record<string, string>) => Promise<void>;
}

export function ColumnMappingModal({
  preview,
  blueprint,
  submitting,
  onClose,
  onConfirm,
}: ColumnMappingModalProps) {
  // Map rawHeader -> targetKey (or '' for ignored)
  const [assignments, setAssignments] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const col of preview.columns) {
      initial[col.rawHeader] = col.predictedTargetKey || '';
    }
    return initial;
  });

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, submitting]);

  const handleSelectTarget = (rawHeader: string, targetKey: string) => {
    setAssignments((prev) => {
      const next = { ...prev };
      // Prevent two raw columns from mapping to the exact same target field
      if (targetKey) {
        for (const [k, v] of Object.entries(next)) {
          if (k !== rawHeader && v === targetKey) {
            next[k] = '';
          }
        }
      }
      next[rawHeader] = targetKey;
      return next;
    });
  };

  const handleConfirm = async () => {
    // Invert rawHeader -> targetKey into targetKey -> rawHeader
    const override: Record<string, string> = {};
    for (const [rawHeader, targetKey] of Object.entries(assignments)) {
      if (targetKey) {
        override[targetKey] = rawHeader;
      }
    }
    await onConfirm(override);
  };

  const mappedTargets = new Set(Object.values(assignments).filter(Boolean));
  const missingRequired = blueprint.schemaRules.filter(
    (r) => r.required && !mappedTargets.has(r.key)
  );

  return (
    <div
      onClick={(e) => {
        if (e.target === e.currentTarget && !submitting) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 backdrop-blur-md p-4 animate-fadeIn"
    >
      <div className="flex max-h-[88vh] w-full max-w-4xl flex-col rounded-3xl border border-white/60 bg-white/85 backdrop-blur-2xl shadow-modal overflow-hidden">
        <div className="flex items-center justify-between border-b border-black/[0.06] bg-white/50 px-6 py-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-zinc-950/5 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-zinc-800 border border-black/[0.06]">
                Step 1 · Interactive Schema Mapping
              </span>
              {preview.usedMappingMemory && (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 border border-emerald-500/20">
                  <Fingerprint className="h-3 w-3" />
                  SHA-256 Cache Hit
                </span>
              )}
            </div>
            <h2 className="mt-1 text-sm font-semibold tracking-tight text-zinc-900">
              Review &amp; Override Column Assignments ({preview.cleanRowsCount} clean rows detected)
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-full p-1.5 text-zinc-400 hover:bg-black/5 hover:text-zinc-800 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="overflow-y-auto p-6 space-y-4">
          {preview.strippedNoiseRows > 0 && (
            <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.06] px-4 py-2.5 text-xs text-emerald-900">
              Pre-Ingestion Sanitizer automatically stripped <strong>{preview.strippedNoiseRows}</strong> banner/summary noise row(s) from sheet <code>{preview.sheetName}</code>.
            </div>
          )}

          {missingRequired.length > 0 && (
            <div className="flex items-center gap-2.5 rounded-2xl border border-amber-500/20 bg-amber-500/[0.08] px-4 py-2.5 text-xs text-amber-900">
              <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0" />
              <span>
                Required schema field(s) unmapped:{' '}
                <strong>{missingRequired.map((m) => m.label).join(', ')}</strong>. Rows will require manual completion unless mapped below.
              </span>
            </div>
          )}

          <div className="overflow-hidden rounded-2xl border border-black/[0.06] bg-white/60">
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b border-black/[0.06] bg-zinc-950/[0.02] font-mono text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
                  <th className="px-5 py-3">Source Column &amp; Sample Data</th>
                  <th className="px-4 py-3 text-center">Confidence</th>
                  <th className="px-5 py-3">Target Blueprint Field</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/[0.04] text-xs">
                {preview.columns.map((col) => {
                  const selectedTarget = assignments[col.rawHeader] || '';
                  const confPct = Math.round(col.confidence * 100);
                  return (
                    <tr key={col.rawHeader} className="hover:bg-black/[0.015] transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-mono font-semibold text-zinc-900">{col.rawHeader}</div>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {col.sampleValues.length > 0 ? (
                            col.sampleValues.map((sv, i) => (
                              <span
                                key={i}
                                className="rounded-md bg-zinc-100 px-2 py-0.5 font-mono text-[10px] text-zinc-600 max-w-[160px] truncate border border-black/[0.04]"
                              >
                                {sv}
                              </span>
                            ))
                          ) : (
                            <span className="text-[10px] italic text-zinc-400">Empty samples</span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-center">
                        <div className="inline-flex items-center gap-1.5">
                          {confPct >= 80 ? (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-emerald-800">
                              <CheckCircle2 className="h-3 w-3" />
                              {confPct}%
                            </span>
                          ) : confPct > 0 ? (
                            <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-amber-800">
                              {confPct}% Fuzzy
                            </span>
                          ) : (
                            <span className="rounded-full border border-black/[0.06] bg-zinc-100 px-2.5 py-0.5 font-mono text-[10px] text-zinc-500">
                              Unmapped
                            </span>
                          )}
                          <ArrowRight className="h-3.5 w-3.5 text-zinc-300" />
                        </div>
                      </td>

                      <td className="px-5 py-3.5">
                        <select
                          value={selectedTarget}
                          onChange={(e) => handleSelectTarget(col.rawHeader, e.target.value)}
                          className={`w-full rounded-xl border px-3.5 py-2 text-xs font-medium focus:border-zinc-900 focus:outline-none transition-colors ${
                            selectedTarget
                              ? 'border-zinc-950/20 bg-white text-zinc-900 shadow-sm'
                              : 'border-black/[0.08] bg-white/70 text-zinc-500'
                          }`}
                        >
                          <option value="">-- Ignore / Discard Column --</option>
                          {blueprint.schemaRules.map((rule) => (
                            <option key={rule.key} value={rule.key}>
                              {rule.label} ({rule.key}) {rule.required ? '*Required' : ''}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex items-center justify-between border-t border-black/[0.06] bg-white/50 px-6 py-4">
          <span className="font-mono text-[11px] text-zinc-500">
            Saving mapping caches SHA-256 signature for future instant runs.
          </span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-full border border-black/10 bg-white/80 px-4 py-2 text-xs font-medium text-zinc-700 hover:bg-white transition-all"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-full bg-zinc-950 px-5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-zinc-850 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Confirm Mapping &amp; Normalize
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
