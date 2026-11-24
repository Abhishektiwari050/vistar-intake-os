'use client';

import React, { useState } from 'react';
import {
  CheckCircle2,
  CopySlash,
  Link2,
  Sparkles,
  AlertTriangle,
  RotateCcw,
  Eye,
  X,
  Scale,
  Palette,
  ShieldCheck,
} from 'lucide-react';
import type { NormalizedRow, ProcessedAsset } from '@/lib/types/intake';

interface AssetGalleryPanelProps {
  assets: ProcessedAsset[];
  rows: NormalizedRow[];
  onReassignAsset: (assetId: string, targetRowId: string | null) => Promise<void>;
  onOverrideDuplicate: (assetId: string, isDuplicate: boolean) => Promise<void>;
}

export function computeClientHammingDistance(hexA?: string, hexB?: string): number {
  if (!hexA || !hexB || hexA.length !== hexB.length) return 64;
  let dist = 0;
  for (let i = 0; i < hexA.length; i++) {
    const xor = parseInt(hexA[i], 16) ^ parseInt(hexB[i], 16);
    dist += xor.toString(2).replace(/0/g, '').length;
  }
  return dist;
}

export function computeClientRgbDistance(
  a?: [number, number, number],
  b?: [number, number, number]
): number | null {
  if (!a || !b) return null;
  return (
    Math.round(
      Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) * 10
    ) / 10
  );
}

export function AssetGalleryPanel({
  assets,
  rows,
  onReassignAsset,
  onOverrideDuplicate,
}: AssetGalleryPanelProps) {
  const [inspectingDuplicateAsset, setInspectingDuplicateAsset] =
    useState<ProcessedAsset | null>(null);

  if (assets.length === 0) return null;

  const cleanCount = assets.filter((a) => !a.isDuplicate && !a.error).length;
  const dupCount = assets.filter((a) => a.isDuplicate).length;
  const corruptCount = assets.filter((a) => Boolean(a.error)).length;

  const matchedOriginal = inspectingDuplicateAsset?.duplicateOfAssetId
    ? assets.find((a) => a.id === inspectingDuplicateAsset.duplicateOfAssetId)
    : undefined;

  const dHashA = matchedOriginal?.dHash || '0000000000000000';
  const dHashB = inspectingDuplicateAsset?.dHash || '0000000000000000';

  const hammingDist =
    inspectingDuplicateAsset?.duplicateMetrics?.hammingDistance ??
    computeClientHammingDistance(dHashA, dHashB);

  const rgbDist =
    inspectingDuplicateAsset?.duplicateMetrics?.rgbDistance ??
    computeClientRgbDistance(
      matchedOriginal?.meanRgb,
      inspectingDuplicateAsset?.meanRgb
    );

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-slate-50/70 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">
            Media Auto-Healing &amp; Perceptual Deduplication (`dHash`)
          </h3>
          <p className="text-xs text-slate-500">
            {cleanCount} verified asset(s) · {dupCount} duplicate(s) blocked
            {corruptCount > 0 ? ` · ${corruptCount} corrupt file(s) isolated` : ''}
          </p>
        </div>
        <span className="rounded-md border border-indigo-200 bg-indigo-50 px-2.5 py-1 font-mono text-[11px] font-medium text-indigo-700">
          EXIF &amp; GPS Stripped
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
        {assets.map((asset) => {
          const matched = asset.duplicateOfAssetId
            ? assets.find((a) => a.id === asset.duplicateOfAssetId)
            : undefined;

          return (
            <div
              key={asset.id}
              className={`flex flex-col justify-between rounded-lg border p-3 transition-shadow ${
                asset.error
                  ? 'border-amber-300 bg-amber-50/40'
                  : asset.isDuplicate
                  ? 'border-rose-200 bg-rose-50/40'
                  : 'border-slate-200 bg-white hover:shadow-card-hover'
              }`}
            >
              <div>
                <div className="relative mb-3 aspect-square overflow-hidden rounded-md border border-slate-200 bg-slate-50 flex items-center justify-center">
                  {asset.error ? (
                    <div className="p-4 text-center">
                      <AlertTriangle className="mx-auto h-6 w-6 text-amber-600" />
                      <p className="mt-2 font-mono text-[10px] font-medium text-amber-800">
                        {asset.error}
                      </p>
                    </div>
                  ) : (
                    <img
                      src={asset.dataUrl}
                      alt={asset.healedFilename}
                      className="h-full w-full object-contain"
                    />
                  )}

                  {asset.isDuplicate ? (
                    <div className="absolute inset-x-2 top-2 flex items-center gap-1.5 rounded-md border border-rose-300 bg-rose-600 px-2 py-1 text-[10px] font-semibold text-white shadow-sm">
                      <CopySlash className="h-3 w-3 shrink-0" strokeWidth={2} />
                      Duplicate Blocked
                    </div>
                  ) : !asset.error ? (
                    <div className="absolute left-2 top-2 flex items-center gap-1 rounded-md border border-emerald-200 bg-white/95 px-2 py-0.5 font-mono text-[10px] font-semibold text-emerald-700 shadow-sm">
                      <CheckCircle2 className="h-3 w-3" strokeWidth={2} />
                      {asset.healedWidth}x{asset.healedHeight}
                    </div>
                  ) : null}

                  {/* Side-by-side thumbnail of matched original when flagged as duplicate */}
                  {asset.isDuplicate && matched?.dataUrl && (
                    <div className="absolute bottom-2 right-2 flex items-center gap-1 rounded border border-slate-300 bg-white/95 p-1 shadow-sm">
                      <img
                        src={matched.dataUrl}
                        alt="Matched Original"
                        className="h-7 w-7 rounded object-cover"
                      />
                      <span className="font-mono text-[9px] text-slate-600 pr-1">Orig</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1">
                  <span
                    className="font-mono text-xs font-semibold text-slate-900 truncate"
                    title={asset.healedFilename}
                  >
                    {asset.healedFilename}
                  </span>
                  <span
                    className="font-mono text-[10px] text-slate-500 truncate"
                    title={asset.originalFilename}
                  >
                    Raw: {asset.originalFilename} ({asset.originalWidth}x{asset.originalHeight})
                  </span>

                  {asset.isDuplicate && asset.duplicateOfFilename && (
                    <div className="mt-1 space-y-1.5">
                      <div className="rounded bg-rose-100 px-2 py-1 font-mono text-[10px] text-rose-800">
                        Matches dHash of {asset.duplicateOfFilename}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setInspectingDuplicateAsset(asset)}
                          className="inline-flex flex-1 items-center justify-center gap-1 rounded border border-rose-300 bg-white px-2 py-1 text-[10px] font-semibold text-rose-700 hover:bg-rose-50"
                        >
                          <Eye className="h-3 w-3" />
                          Inspect Match
                        </button>
                        <button
                          type="button"
                          onClick={() => onOverrideDuplicate(asset.id, false)}
                          className="inline-flex items-center justify-center rounded border border-rose-300 bg-white p-1 text-rose-700 hover:bg-rose-50"
                          title="Restore false positive directly"
                          aria-label={`Restore ${asset.healedFilename}`}
                        >
                          <RotateCcw className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  )}

                  {!asset.isDuplicate && !asset.error && asset.healActions.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {asset.healActions.slice(0, 2).map((act, idx) => (
                        <span
                          key={idx}
                          className="inline-flex items-center gap-1 rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[9px] text-slate-600"
                        >
                          <Sparkles className="h-2.5 w-2.5 text-amber-600" />
                          {act}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Manual SKU / Row Reassignment Selector */}
              {!asset.isDuplicate && !asset.error && rows.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-2.5">
                  <div className="flex items-center gap-1 font-mono text-[10px] text-slate-500 mb-1">
                    <Link2 className="h-3 w-3 text-indigo-600" />
                    <span>Row Binding ({Math.round(asset.matchConfidence * 100)}%)</span>
                  </div>
                  <select
                    value={asset.linkedRowId || ''}
                    onChange={(e) => onReassignAsset(asset.id, e.target.value || null)}
                    className="w-full rounded border border-slate-200 bg-slate-50 px-2 py-1 font-mono text-[11px] text-slate-800 focus:border-indigo-500 focus:bg-white focus:outline-none"
                  >
                    <option value="">-- Unlinked --</option>
                    {rows.map((r) => {
                      const label =
                        r.cells.sku?.value ||
                        r.cells.module_id?.value ||
                        r.cells.title?.value ||
                        r.rowId;
                      return (
                        <option key={r.rowId} value={r.rowId}>
                          {String(label)} ({r.rowId})
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Perceptual Deduplication Inspector Modal */}
      {inspectingDuplicateAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="duplicate-inspector-title"
            className="w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-rose-100 px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider text-rose-700">
                    Duplicate Collision Detected
                  </span>
                  <span className="font-mono text-xs text-slate-400">
                    64-bit dHash Engine
                  </span>
                </div>
                <h3
                  id="duplicate-inspector-title"
                  className="mt-1 text-base font-bold text-slate-900"
                >
                  Perceptual Image Deduplication Inspection
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectingDuplicateAsset(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
                aria-label="Close duplicate inspector"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
              {/* Side-by-Side Image Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Matched Original */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                    <span className="inline-flex items-center gap-1">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                      Matched Original (Baseline)
                    </span>
                    <span className="rounded bg-slate-200 px-1.5 py-0.2 font-mono text-[10px] text-slate-700">
                      Master
                    </span>
                  </div>

                  <div className="relative aspect-square w-full rounded-lg border border-slate-200 bg-white overflow-hidden flex items-center justify-center">
                    {matchedOriginal?.dataUrl ? (
                      <img
                        src={matchedOriginal.dataUrl}
                        alt="Matched Original"
                        className="h-full w-full object-contain"
                      />
                    ) : (
                      <div className="text-center p-4">
                        <AlertTriangle className="mx-auto h-6 w-6 text-slate-400" />
                        <span className="font-mono text-[10px] text-slate-500">
                          {inspectingDuplicateAsset.duplicateOfFilename || 'Earlier Batch Asset'}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="font-mono text-[11px] space-y-0.5">
                    <div className="font-semibold text-slate-800 truncate" title={matchedOriginal?.healedFilename || inspectingDuplicateAsset.duplicateOfFilename}>
                      {matchedOriginal?.healedFilename || inspectingDuplicateAsset.duplicateOfFilename}
                    </div>
                    <div className="text-slate-500">
                      Dimensions: {matchedOriginal?.healedWidth || 1080}x{matchedOriginal?.healedHeight || 1080}
                    </div>
                  </div>
                </div>

                {/* Candidate Duplicate */}
                <div className="rounded-xl border border-rose-200 bg-rose-50/30 p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-rose-800">
                    <span className="inline-flex items-center gap-1">
                      <CopySlash className="h-3.5 w-3.5 text-rose-600" />
                      Candidate (Flagged Duplicate)
                    </span>
                    <span className="rounded bg-rose-200 px-1.5 py-0.2 font-mono text-[10px] text-rose-800">
                      Blocked
                    </span>
                  </div>

                  <div className="relative aspect-square w-full rounded-lg border border-rose-200 bg-white overflow-hidden flex items-center justify-center">
                    <img
                      src={inspectingDuplicateAsset.dataUrl}
                      alt={inspectingDuplicateAsset.healedFilename}
                      className="h-full w-full object-contain"
                    />
                  </div>

                  <div className="font-mono text-[11px] space-y-0.5">
                    <div className="font-semibold text-slate-800 truncate" title={inspectingDuplicateAsset.healedFilename}>
                      {inspectingDuplicateAsset.healedFilename}
                    </div>
                    <div className="text-slate-500">
                      Dimensions: {inspectingDuplicateAsset.healedWidth}x{inspectingDuplicateAsset.healedHeight}
                    </div>
                  </div>
                </div>
              </div>

              {/* Perceptual Signatures & Nibble Diff */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-slate-600">
                    16-Hex dHash Perceptual Signatures (64-bit Grayscale Gradient)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-xs">
                  <div>
                    <span className="text-[10px] font-semibold text-slate-500 block mb-1">
                      Master Original dHash:
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {dHashA.split('').map((ch, idx) => (
                        <span
                          key={idx}
                          className="rounded bg-slate-200 px-1.5 py-0.5 font-bold text-slate-800"
                        >
                          {ch}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <span className="text-[10px] font-semibold text-slate-500 block mb-1">
                      Candidate dHash (Diff Highlight):
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {dHashB.split('').map((ch, idx) => {
                        const isIdentical = dHashA[idx] === ch;
                        return (
                          <span
                            key={idx}
                            className={`rounded px-1.5 py-0.5 font-bold ${
                              isIdentical
                                ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                : 'bg-rose-200 text-rose-900 border border-rose-300'
                            }`}
                            title={isIdentical ? `Nibble ${idx}: Matching (${ch})` : `Nibble ${idx}: Differs (${dHashA[idx]} vs ${ch})`}
                          >
                            {ch}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Metric Badges & Guard Evaluation */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <Scale className="h-3.5 w-3.5 text-indigo-600" />
                      Hamming Bit Distance
                    </span>
                    <span className={`rounded px-2 py-0.5 font-mono text-xs font-bold ${
                      hammingDist <= 4
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-slate-100 text-slate-700'
                    }`}>
                      {hammingDist} / 64 bits
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Threshold: <strong className="text-slate-800">&le; 4 bits</strong> difference.
                    Candidate variance is {hammingDist} bit(s) ({((hammingDist / 64) * 100).toFixed(1)}%).
                  </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-3.5 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                      <Palette className="h-3.5 w-3.5 text-amber-600" />
                      Mean RGB Distance
                    </span>
                    <span className={`rounded px-2 py-0.5 font-mono text-xs font-bold ${
                      rgbDist !== null && rgbDist <= 28
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-emerald-100 text-emerald-700'
                    }`}>
                      {rgbDist !== null ? `${rgbDist}` : '&le; 28.0'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Threshold: <strong className="text-slate-800">&le; 28.0 Euclidean</strong>.
                    Guards against false suppression of distinct color variants.
                  </p>
                </div>
              </div>

              {/* Informational PRD Note */}
              <p className="rounded-lg bg-slate-50 p-3 text-[11px] leading-relaxed text-slate-500">
                <strong>Engine Methodology:</strong> 9x8 downsampled grayscale raster generates 64 gradient bits. Images with identical compositions pass bit checks, while 3D Euclidean color guard prevents false suppression of distinct product colors (e.g., Red vs Navy).
              </p>
            </div>

            {/* Modal Actions */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-5 py-3">
              <span className="font-mono text-[11px] text-slate-500">
                Action will update export manifests and audit log.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setInspectingDuplicateAsset(null)}
                  className="rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 transition-all"
                >
                  Keep Suppressed
                </button>
                <button
                  type="button"
                  onClick={async () => {
                    const id = inspectingDuplicateAsset.id;
                    setInspectingDuplicateAsset(null);
                    await onOverrideDuplicate(id, false);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 active:scale-95 transition-all"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restore as Distinct SKU
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
