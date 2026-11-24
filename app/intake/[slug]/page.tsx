'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import QRCode from 'qrcode';
import {
  UploadCloud,
  FileSpreadsheet,
  Image as ImageIcon,
  Play,
  QrCode,
  X,
  ShieldCheck,
  ShieldAlert,
  Loader2,
  Trash2,
  AlignLeft,
  SlidersHorizontal,
  Sparkles,
} from 'lucide-react';
import type { Blueprint, IntakeSubmission } from '@/lib/types/intake';
import type { StagedPreviewResponse } from '@/lib/pipeline/run-intake';
import { SubmissionInspectorView } from '@/components/SubmissionInspectorView';
import { ColumnMappingModal } from '@/components/ColumnMappingModal';
import { IngestionStepper } from '@/components/IngestionStepper';
import { VistarLogo } from '@/components/VistarLogo';

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

const MAX_BATCH_BYTES = 60 * 1024 * 1024; // 60MB client batch limit

export default function ClientIntakeMagicPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug || 'shopify-d2c-catalog';

  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [allBlueprints, setAllBlueprints] = useState<Blueprint[]>([]);
  const [clientName, setClientName] = useState('Apex D2C Brand');
  const [inputMode, setInputMode] = useState<'files' | 'text'>('files');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [rawText, setRawText] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultSubmission, setResultSubmission] = useState<IntakeSubmission | null>(null);

  const [stagedPreview, setStagedPreview] = useState<StagedPreviewResponse | null>(null);
  const [stagedIsSimulation, setStagedIsSimulation] = useState(false);

  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const fetchBlueprints = async () => {
      const resp = await fetch('/api/blueprints');
      const data = await resp.json();
      const list: Blueprint[] = data.blueprints || [];
      setAllBlueprints(list);
      const matched = list.find((b) => b.slug === slug) || list[0] || null;
      setBlueprint(matched);
    };
    fetchBlueprints();
  }, [slug]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setQrModalOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const openQrBridge = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    const dataUrl = await QRCode.toDataURL(url, { width: 260, margin: 2 });
    setQrDataUrl(dataUrl);
    setQrModalOpen(true);
  };

  const handleFilesAdded = (incoming: FileList | null) => {
    if (!incoming) return;
    const arr = Array.from(incoming);
    for (const file of arr) {
      if (/\.(xlsm|xltm|xlam|xlsb|xla)$/i.test(file.name)) {
        setError(`Blocked unsafe macro-enabled spreadsheet: ${file.name}`);
        return;
      }
      if (file.size === 0) {
        setError(`File "${file.name}" is empty (0 bytes).`);
        return;
      }
      if (file.size > 15 * 1024 * 1024) {
        setError(`File "${file.name}" exceeds the 15MB single-file limit.`);
        return;
      }
    }
    setSelectedFiles((prev) => [...prev, ...arr]);
    setError(null);
  };

  const handleRemoveFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const totalBatchBytes = selectedFiles.reduce((acc, f) => acc + f.size, 0);

  const handleOpenMappingStep = async (simulateChaotic = false) => {
    setProcessing(true);
    setError(null);
    setStagedIsSimulation(simulateChaotic);

    try {
      let resp: Response;
      if (simulateChaotic || inputMode === 'text') {
        resp = await fetch('/api/intake/preview', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blueprintSlug: slug,
            simulateChaotic,
            rawText: simulateChaotic ? undefined : rawText,
          }),
        });
      } else {
        const formData = new FormData();
        formData.append('blueprintSlug', slug);
        for (const f of selectedFiles) {
          formData.append('files', f);
        }
        resp = await fetch('/api/intake/preview', {
          method: 'POST',
          body: formData,
        });
      }
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Preview failed');
      setStagedPreview(data.preview);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview error');
    } finally {
      setProcessing(false);
    }
  };

  const executeIntake = async (
    mappingOverride?: Record<string, string>,
    simulateChaotic = false
  ) => {
    setProcessing(true);
    setError(null);
    setResultSubmission(null);
    setStagedIsSimulation(simulateChaotic);

    try {
      let resp: Response;
      if (simulateChaotic || inputMode === 'text') {
        resp = await fetch('/api/intake', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            blueprintSlug: slug,
            clientName,
            simulateChaotic,
            rawText: simulateChaotic ? undefined : rawText,
            columnMappingOverride: mappingOverride,
          }),
        });
      } else {
        const formData = new FormData();
        formData.append('blueprintSlug', slug);
        formData.append('clientName', clientName);
        if (mappingOverride) {
          formData.append('columnMappingOverride', JSON.stringify(mappingOverride));
        }
        for (const f of selectedFiles) {
          formData.append('files', f);
        }
        resp = await fetch('/api/intake', {
          method: 'POST',
          body: formData,
        });
      }
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || 'Processing failed');
      setResultSubmission(data.submission);
      setStagedPreview(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected intake error');
    } finally {
      setProcessing(false);
    }
  };

  const handleSubmitFilesOrText = async (e: React.FormEvent) => {
    e.preventDefault();
    await executeIntake(undefined, false);
  };

  const hasSpreadsheetOrText =
    (inputMode === 'text' && Boolean(rawText.trim())) ||
    (inputMode === 'files' &&
      selectedFiles.some((f) => /\.(xlsx|xls|csv)$/i.test(f.name)));

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Header + Blueprint Switcher */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <VistarLogo variant="horizontal" size="sm" showTagline={true} />
            <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase tracking-wider text-emerald-800 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]">
              Zero-Login Magic Link
            </span>
            <span className="font-mono text-xs text-zinc-400">/{slug}</span>
          </div>
          <h1 className="mt-3 text-2xl font-bold tracking-tight text-zinc-950">
            {blueprint ? blueprint.name : 'Client Asset & Data Dropzone'}
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-zinc-500 leading-relaxed">
            {blueprint?.description ||
              'Drop unformatted Excel spreadsheets, raw notes, or unsorted photos. Our verification engine cleans, heals, and validates everything automatically.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {allBlueprints.map((bp) => (
            <Link
              key={bp.slug}
              href={`/intake/${bp.slug}`}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                bp.slug === slug
                  ? 'bg-zinc-950 text-white shadow-sm font-semibold'
                  : 'glass-panel-subtle text-zinc-700 hover:text-zinc-950 hover:bg-white/80'
              }`}
            >
              {bp.name.length > 26 ? `${bp.name.slice(0, 24)}...` : bp.name}
            </Link>
          ))}
          <button
            type="button"
            onClick={openQrBridge}
            className="inline-flex items-center gap-1.5 rounded-lg glass-panel-subtle px-3 py-1.5 text-xs font-medium text-zinc-700 transition-all hover:text-zinc-950 hover:bg-white/80 active:scale-[0.98]"
          >
            <QrCode className="h-3.5 w-3.5 text-zinc-600" strokeWidth={1.75} />
            Mobile QR Bridge
          </button>
        </div>
      </div>

      {/* Main Glassmorphism Dropzone Card */}
      <form
        onSubmit={handleSubmitFilesOrText}
        className="glass-panel rounded-2xl p-6 sm:p-8 space-y-6"
      >
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="w-full sm:w-80">
            <label className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
              Client / Brand Name
            </label>
            <input
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              required
              className="mt-1.5 w-full rounded-xl border border-zinc-200/80 bg-white/70 px-3.5 py-2 text-sm text-zinc-950 shadow-inner focus:border-zinc-900 focus:bg-white focus:outline-none transition-all"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-xl border border-zinc-200/70 bg-zinc-100/60 p-0.5 shadow-inner">
              <button
                type="button"
                onClick={() => setInputMode('files')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                  inputMode === 'files'
                    ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                <UploadCloud className="h-3.5 w-3.5" strokeWidth={1.75} />
                Files &amp; Photos
              </button>
              <button
                type="button"
                onClick={() => setInputMode('text')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                  inputMode === 'text'
                    ? 'bg-white text-zinc-950 font-semibold shadow-sm'
                    : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                <AlignLeft className="h-3.5 w-3.5" strokeWidth={1.75} />
                Raw CSV / Notes
              </button>
            </div>

            <button
              type="button"
              onClick={() => executeIntake(undefined, true)}
              disabled={processing}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-300 bg-white/80 px-3.5 py-2 text-xs font-semibold text-zinc-800 shadow-sm transition-all hover:bg-white hover:border-zinc-400 active:scale-[0.98] disabled:opacity-60"
            >
              {processing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-600" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 text-zinc-700" strokeWidth={1.75} />
              )}
              Simulate Chaotic Upload
            </button>
          </div>
        </div>

        {inputMode === 'files' ? (
          <div>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                handleFilesAdded(e.dataTransfer.files);
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`cursor-pointer rounded-2xl border-2 border-dashed p-10 text-center transition-all duration-200 ${
                isDragging
                  ? 'border-zinc-950 bg-white/90 scale-[1.005]'
                  : 'border-zinc-300/80 bg-white/40 hover:border-zinc-400 hover:bg-white/70'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".xlsx,.xls,.csv,.jpg,.jpeg,.png,.webp"
                onChange={(e) => handleFilesAdded(e.target.files)}
                className="hidden"
              />
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl border border-zinc-200/80 bg-white shadow-sm">
                <UploadCloud className="h-6 w-6 text-zinc-900" strokeWidth={1.5} />
              </div>
              <p className="mt-3.5 text-sm font-semibold text-zinc-950">
                Drop messy spreadsheets and raw product photos here
              </p>
              <p className="mt-1 text-xs text-zinc-500 max-w-lg mx-auto">
                No templates required. Accepts <span className="font-mono text-zinc-700">.xlsx</span>, <span className="font-mono text-zinc-700">.csv</span>, <span className="font-mono text-zinc-700">.jpg</span>, <span className="font-mono text-zinc-700">.png</span>, <span className="font-mono text-zinc-700">.webp</span> (Max 15MB/file, 30 files). Macro files blocked automatically.
              </p>

              {/* Dynamic Blueprint Dimension & File Format Chips */}
              <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
                <div className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-50/70 px-2.5 py-1 text-xs font-medium text-emerald-800">
                  <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-700" strokeWidth={1.75} />
                  <span>.XLSX, .CSV</span>
                  <span className="text-[10px] text-emerald-600 font-normal">· Auto-unmerging</span>
                </div>

                <div className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-300/70 bg-zinc-100/70 px-2.5 py-1 text-xs font-medium text-zinc-800">
                  <ImageIcon className="h-3.5 w-3.5 text-zinc-700" strokeWidth={1.75} />
                  <span>.JPG, .PNG, .WEBP</span>
                  <span className="rounded bg-white/80 px-1.5 py-0.2 font-mono text-[10px] font-semibold text-zinc-900 border border-zinc-200">
                    {blueprint?.mediaRules
                      ? `${blueprint.mediaRules.targetWidth}×${blueprint.mediaRules.targetHeight} ${blueprint.mediaRules.aspectRatio} ${blueprint.mediaRules.outputFormat.toUpperCase()}`
                      : '1080×1080 1:1 WebP'}
                  </span>
                </div>

                <div className="inline-flex items-center gap-1 rounded-lg border border-zinc-200/80 bg-zinc-100/60 px-2.5 py-1 text-xs font-medium text-zinc-600">
                  <ShieldAlert className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.75} />
                  <span>Macro-Blocked</span>
                  <span className="text-[10px] text-zinc-400">(.xlsm/.xlsb rejected)</span>
                </div>

                <div className="inline-flex items-center gap-1 rounded-lg border border-zinc-200/70 bg-white/60 px-2 py-1 text-[11px] text-zinc-500">
                  <span>Max 15MB/file · 30 files max</span>
                </div>
              </div>
            </div>

            {selectedFiles.length > 0 && (
              <div className="mt-4 rounded-xl glass-panel-subtle p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-zinc-950">Staged Files Queue</span>
                    <span className="rounded-full bg-zinc-900 text-white px-2 py-0.5 font-mono text-[10px] font-semibold">
                      {selectedFiles.length} {selectedFiles.length === 1 ? 'file' : 'files'}
                    </span>
                    <span className="text-zinc-300">·</span>
                    <span
                      className={`font-mono text-[11px] ${
                        totalBatchBytes > MAX_BATCH_BYTES ? 'text-rose-600 font-semibold' : 'text-zinc-600'
                      }`}
                    >
                      {formatBytes(totalBatchBytes)} / 60 MB batch limit
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedFiles([])}
                    className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 hover:text-rose-700 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Clear all
                  </button>
                </div>

                {/* Batch Capacity Visual Bar */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-zinc-200/70">
                  <div
                    className={`h-full transition-all duration-300 ${
                      totalBatchBytes > 50 * 1024 * 1024
                        ? 'bg-rose-500'
                        : totalBatchBytes > 30 * 1024 * 1024
                        ? 'bg-amber-500'
                        : 'bg-zinc-950'
                    }`}
                    style={{ width: `${Math.min(100, (totalBatchBytes / (60 * 1024 * 1024)) * 100)}%` }}
                  />
                </div>

                {/* Staged files grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5 max-h-60 overflow-y-auto pr-1">
                  {selectedFiles.map((file, idx) => {
                    const isSheet = /\.(xlsx|xls|csv)$/i.test(file.name);
                    return (
                      <div
                        key={`${file.name}-${idx}`}
                        className="group flex items-center justify-between gap-2 rounded-xl border border-zinc-200/70 bg-white/70 p-2.5 shadow-sm transition-all hover:bg-white hover:border-zinc-300"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                              isSheet
                                ? 'border border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border border-zinc-200 bg-zinc-100 text-zinc-800'
                            }`}
                          >
                            {isSheet ? (
                              <FileSpreadsheet className="h-4 w-4" strokeWidth={1.75} />
                            ) : (
                              <ImageIcon className="h-4 w-4" strokeWidth={1.75} />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-medium text-zinc-900" title={file.name}>
                              {file.name}
                            </p>
                            <p className="font-mono text-[10px] text-zinc-400">
                              {formatBytes(file.size)} · {isSheet ? 'Spreadsheet' : 'Product Photo'}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleRemoveFile(idx)}
                          aria-label={`Remove ${file.name}`}
                          className="shrink-0 rounded-md p-1 text-zinc-400 transition-colors hover:bg-rose-50 hover:text-rose-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <textarea
              rows={6}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder={`Paste messy CSV, WhatsApp pricing list, or tab-separated Excel lines here...\nExample:\nArticle No, Item Name, Amt (INR), Units Left\nsku 101, CRIMSON POLO, Rs. 1,499/-, 120 pcs`}
              className="w-full rounded-2xl border border-zinc-200/80 bg-white/70 p-4 font-mono text-xs text-zinc-900 shadow-inner focus:border-zinc-900 focus:bg-white focus:outline-none transition-all"
            />
          </div>
        )}

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-2.5 text-xs font-medium text-rose-800 animate-fade-in">
            {error}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200/50 pt-5">
          <div className="flex items-center gap-2 text-xs text-zinc-500">
            <ShieldCheck className="h-4 w-4 text-emerald-600" strokeWidth={1.75} />
            <span>Magic-byte verified · Strict Zod deterministic gate</span>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => handleOpenMappingStep(!hasSpreadsheetOrText)}
              disabled={
                processing ||
                (inputMode === 'files' && totalBatchBytes > MAX_BATCH_BYTES)
              }
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white px-4 py-2 text-xs font-semibold text-zinc-800 shadow-sm hover:bg-zinc-50 active:scale-[0.98] transition-all disabled:opacity-50"
            >
              <SlidersHorizontal className="h-3.5 w-3.5 text-zinc-600" strokeWidth={1.75} />
              {hasSpreadsheetOrText ? 'Review Column Mapping' : 'Preview Sandbox Mapping'}
            </button>

            <button
              type="submit"
              disabled={
                processing ||
                (inputMode === 'files' &&
                  (selectedFiles.length === 0 || totalBatchBytes > MAX_BATCH_BYTES)) ||
                (inputMode === 'text' && !rawText.trim())
              }
              className="inline-flex items-center gap-2 rounded-xl bg-zinc-950 px-5 py-2 text-xs font-semibold text-white shadow-[0_2px_8px_rgba(0,0,0,0.15),inset_0_1px_1px_rgba(255,255,255,0.2)] transition-all hover:bg-zinc-800 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none"
            >
              {processing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {inputMode === 'files' && totalBatchBytes > MAX_BATCH_BYTES
                ? 'Batch Exceeds 60MB Limit'
                : 'Normalize & Verify Package'}
            </button>
          </div>
        </div>
      </form>

      {/* Ingestion Stepper during Processing or Pipeline Error */}
      {(processing || (error && !resultSubmission)) && (
        <IngestionStepper
          isProcessing={processing}
          pipelineLogs={resultSubmission?.pipelineLogs}
          error={error}
          onDismissError={() => setError(null)}
          onRetry={() => executeIntake(undefined, stagedIsSimulation)}
        />
      )}

      {/* Live Output Inspector */}
      {resultSubmission && blueprint && (
        <SubmissionInspectorView initialSubmission={resultSubmission} blueprint={blueprint} />
      )}

      {/* Attribution Footer */}
      <footer className="border-t border-zinc-200/60 pt-6 text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-full glass-panel-subtle px-4 py-1.5 text-xs text-zinc-600 transition-all hover:text-zinc-950 hover:bg-white active:scale-[0.98]"
        >
          <span className="h-2 w-2 rounded-full bg-zinc-950" />
          <span>
            Verified &amp; Normalized by <strong className="font-semibold text-zinc-950">Vistar Intake OS</strong> — Enterprise Data Ingestion Engine
          </span>
        </Link>
      </footer>

      {/* Interactive Column Mapping Modal (Step 1) */}
      {stagedPreview && blueprint && (
        <ColumnMappingModal
          preview={stagedPreview}
          blueprint={blueprint}
          submitting={processing}
          onClose={() => setStagedPreview(null)}
          onConfirm={(override) => executeIntake(override, stagedIsSimulation)}
        />
      )}

      {/* Mobile QR Bridge Modal */}
      {qrModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setQrModalOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/40 backdrop-blur-md p-4 animate-fade-in"
        >
          <div className="w-full max-w-sm rounded-2xl glass-panel p-6 text-center shadow-2xl animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-200/60">
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-zinc-800">
                Mobile Photo Handoff QR
              </span>
              <button
                onClick={() => setQrModalOpen(false)}
                aria-label="Close QR modal"
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="my-5 flex justify-center">
              {qrDataUrl && (
                <img
                  src={qrDataUrl}
                  alt="Intake Magic Link QR"
                  className="rounded-xl border border-zinc-200/80 p-2.5 bg-white shadow-sm"
                />
              )}
            </div>
            <p className="text-xs leading-relaxed text-zinc-500">
              Scan with your phone camera to open this exact zero-login dropzone and upload raw gallery photos directly from your mobile device.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
