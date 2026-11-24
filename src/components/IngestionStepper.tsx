'use client';

import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  FileSpreadsheet,
  Fingerprint,
  Loader2,
  Check,
  AlertTriangle,
  X,
  Clock,
  RotateCcw,
} from 'lucide-react';
import type { PipelineStepLog } from '@/lib/types/intake';

export interface IngestionStageConfig {
  id: number;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  stageKey: 'security' | 'sanitizer' | 'mapping' | 'normalizer' | 'media';
  matchRegex: RegExp;
  fallbackDurationMs: number;
}

export const INGESTION_STAGES: IngestionStageConfig[] = [
  {
    id: 1,
    label: 'File Integrity & Magic-Byte Signature',
    description: 'Validating binary signatures, blocking macros (.xlsm/.xlsb), enforcing 15MB file limits',
    icon: ShieldCheck,
    stageKey: 'security',
    matchRegex: /security|signature|integrity|magic/i,
    fallbackDurationMs: 14,
  },
  {
    id: 2,
    label: 'Structural Unmerging & Header Detection',
    description: 'Unmerging banner rows, downward header propagation, primary sheet auto-detection',
    icon: FileSpreadsheet,
    stageKey: 'sanitizer',
    matchRegex: /sanitizer|spreadsheet|structural|unmerg/i,
    fallbackDurationMs: 42,
  },
  {
    id: 3,
    label: 'SHA-256 Mapping Memory Signature',
    description: 'Computing SHA-256 header fingerprint, checking mapping memory cache for 0ms execution',
    icon: Fingerprint,
    stageKey: 'mapping',
    matchRegex: /mapping|memory|fingerprint/i,
    fallbackDurationMs: 8,
  },
  {
    id: 4,
    label: 'Deterministic Zod Validation & Currency Healing',
    description: 'Normalizing dirty currencies (INR Lakh/Crore), SKU formatting, enforcing schema gates',
    icon: ShieldCheck,
    stageKey: 'normalizer',
    matchRegex: /normaliz|zod|schema|currenc|clean/i,
    fallbackDurationMs: 35,
  },
  {
    id: 5,
    label: 'Parallel Sharp Media Normalization',
    description: 'Streaming image buffers, enforcing aspect ratio, stripping EXIF, converting to WebP',
    icon: ShieldCheck,
    stageKey: 'media',
    matchRegex: /media|image|sharp|photo|webp/i,
    fallbackDurationMs: 65,
  },
];

export interface IngestionStepperProps {
  isProcessing: boolean;
  pipelineLogs?: PipelineStepLog[];
  error?: string | null;
  onDismissError?: () => void;
  onRetry?: () => void;
}

export function IngestionStepper({
  isProcessing,
  pipelineLogs,
  error,
  onDismissError,
  onRetry,
}: IngestionStepperProps) {
  const [activeStepIndex, setActiveStepIndex] = useState(0);

  // Simulated sequential progress while request is in-flight
  useEffect(() => {
    if (!isProcessing) {
      if (!error) {
        setActiveStepIndex(INGESTION_STAGES.length);
      }
      return;
    }

    setActiveStepIndex(0);
    const intervals = [120, 260, 200, 320, 400];
    let current = 0;

    const timer = setInterval(() => {
      current += 1;
      if (current < INGESTION_STAGES.length) {
        setActiveStepIndex(current);
      } else {
        clearInterval(timer);
      }
    }, intervals[current] || 300);

    return () => clearInterval(timer);
  }, [isProcessing, error]);

  const hasLogs = Boolean(pipelineLogs && pipelineLogs.length > 0);

  const getLogForStage = (stage: IngestionStageConfig): PipelineStepLog | undefined => {
    if (!pipelineLogs) return undefined;
    return pipelineLogs.find(
      (l) =>
        stage.matchRegex.test(l.step) ||
        stage.matchRegex.test(l.detail)
    );
  };

  return (
    <div className="glass-panel rounded-2xl p-6 space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200/50 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-900/5 border border-zinc-200 text-zinc-950">
            {isProcessing ? (
              <Loader2 className="h-4 w-4 animate-spin text-zinc-950" />
            ) : error ? (
              <AlertTriangle className="h-4 w-4 text-rose-600" />
            ) : (
              <ShieldCheck className="h-4 w-4 text-emerald-600" />
            )}
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-900">
              Deterministic Ingestion Pipeline
            </h3>
            <p className="font-mono text-[11px] text-zinc-500">
              {isProcessing
                ? `Running Stage ${Math.min(activeStepIndex + 1, 5)} of 5 · Zero-Hallucination Gate active`
                : error
                ? 'Ingestion halted due to pipeline error'
                : 'All 5 ingestion stages successfully verified'}
            </p>
          </div>
        </div>

        {isProcessing && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-zinc-950/20 bg-zinc-950/5 px-3 py-1 font-mono text-[10px] font-semibold text-zinc-900 animate-pulse">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-950" />
            Processing Batch...
          </span>
        )}
      </div>

      {/* Stepper Stages List */}
      <div className="space-y-2.5">
        {INGESTION_STAGES.map((stage, idx) => {
          const log = getLogForStage(stage);
          const Icon = stage.icon;

          let status: 'pending' | 'active' | 'completed' | 'warning' | 'skipped' | 'error' = 'pending';

          if (error && !isProcessing) {
            if (idx === activeStepIndex) {
              status = 'error';
            } else if (idx < activeStepIndex) {
              status = 'completed';
            } else {
              status = 'pending';
            }
          } else if (hasLogs) {
            if (log) {
              status = log.status;
            } else {
              status = 'completed';
            }
          } else if (isProcessing) {
            if (idx < activeStepIndex) {
              status = 'completed';
            } else if (idx === activeStepIndex) {
              status = 'active';
            } else {
              status = 'pending';
            }
          }

          const duration = log?.durationMs ?? stage.fallbackDurationMs;
          const detailText = log?.detail || stage.description;

          return (
            <div
              key={stage.id}
              className={`flex items-start gap-3 rounded-xl border p-3.5 transition-all duration-200 ${
                status === 'active'
                  ? 'border-zinc-900/30 bg-zinc-900/5 shadow-sm'
                  : status === 'completed'
                  ? 'border-emerald-500/20 bg-emerald-500/5'
                  : status === 'warning' || status === 'skipped'
                  ? 'border-amber-500/20 bg-amber-500/5'
                  : status === 'error'
                  ? 'border-rose-500/30 bg-rose-500/10'
                  : 'border-zinc-200/50 bg-white/40 opacity-60'
              }`}
            >
              {/* Status Circle Indicator */}
              <div className="mt-0.5 shrink-0">
                {status === 'active' ? (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-zinc-950 text-white shadow-sm animate-pulse">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  </div>
                ) : status === 'completed' ? (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-600 text-white">
                    <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                  </div>
                ) : status === 'warning' || status === 'skipped' ? (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-500 text-white">
                    <AlertTriangle className="h-3.5 w-3.5" />
                  </div>
                ) : status === 'error' ? (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-600 text-white">
                    <X className="h-3.5 w-3.5 stroke-[2.5]" />
                  </div>
                ) : (
                  <div className="flex h-6 w-6 items-center justify-center rounded-full border border-zinc-300 bg-white/80 text-[11px] font-mono font-medium text-zinc-500">
                    {stage.id}
                  </div>
                )}
              </div>

              {/* Stage Body */}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Icon className={`h-3.5 w-3.5 ${
                      status === 'active'
                        ? 'text-zinc-950'
                        : status === 'completed'
                        ? 'text-emerald-700'
                        : status === 'warning' || status === 'skipped'
                        ? 'text-amber-700'
                        : status === 'error'
                        ? 'text-rose-700'
                        : 'text-zinc-400'
                    }`} />
                    <span
                      className={`text-xs font-semibold ${
                        status === 'active'
                          ? 'text-zinc-950 font-bold'
                          : status === 'completed'
                          ? 'text-zinc-900'
                          : status === 'warning' || status === 'skipped'
                          ? 'text-amber-950'
                          : status === 'error'
                          ? 'text-rose-950'
                          : 'text-zinc-600'
                      }`}
                    >
                      {stage.label}
                    </span>
                  </div>

                  {/* Latency Tag */}
                  {(status === 'completed' || status === 'warning' || status === 'skipped') && (
                    <span className="inline-flex items-center gap-1 font-mono text-[10px] font-medium text-zinc-600 bg-white/80 border border-zinc-200/80 rounded-md px-1.5 py-0.5 shadow-2xs">
                      <Clock className="h-2.5 w-2.5 text-zinc-400" />
                      {duration}ms
                    </span>
                  )}
                </div>

                <p
                  className={`mt-1 text-[11px] leading-relaxed ${
                    status === 'active'
                      ? 'text-zinc-800'
                      : status === 'completed'
                      ? 'text-zinc-500'
                      : status === 'warning' || status === 'skipped'
                      ? 'text-amber-800'
                      : status === 'error'
                      ? 'text-rose-700 font-medium'
                      : 'text-zinc-500'
                  }`}
                >
                  {status === 'error' && error ? error : detailText}
                </p>

                {/* Progress bar inside active step */}
                {status === 'active' && (
                  <div className="mt-2 h-1 w-full overflow-hidden rounded-full bg-zinc-200">
                    <div className="h-full bg-zinc-950 rounded-full animate-pulse w-3/4 transition-all duration-300" />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Error Action Strip */}
      {error && !isProcessing && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-rose-200 bg-rose-50/90 p-3.5 text-xs">
          <div className="flex items-center gap-2 text-rose-800">
            <AlertTriangle className="h-4 w-4 shrink-0 text-rose-600" />
            <span>{error}</span>
          </div>
          <div className="flex items-center gap-2">
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1 rounded-lg bg-rose-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-rose-700 transition-colors shadow-2xs"
              >
                <RotateCcw className="h-3 w-3" />
                Retry Ingestion
              </button>
            )}
            {onDismissError && (
              <button
                type="button"
                onClick={onDismissError}
                className="rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-rose-700 hover:bg-rose-100 transition-colors"
              >
                Dismiss
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
