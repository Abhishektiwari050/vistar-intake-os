'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  X,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Zap,
  ShieldCheck,
  UploadCloud,
  FileSpreadsheet,
  Layers,
  Activity,
  BarChart3,
  Clock,
  Fingerprint,
  QrCode,
  CheckCircle2,
  Code2,
  Database,
  ArrowUpRight,
  Command,
} from 'lucide-react';
import { VistarStarIcon } from './VistarLogo';
import { ClientPortal } from './ClientPortal';

interface WalkthroughModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRunSimulation?: () => void;
  onOpenDropzone?: () => void;
}

interface WalkthroughStep {
  id: number;
  badge: string;
  title: string;
  subtitle: string;
  tagline: string;
  content: React.ReactNode;
}

export function WalkthroughModal({
  isOpen,
  onClose,
  onRunSimulation,
  onOpenDropzone,
}: WalkthroughModalProps) {
  const [currentStep, setCurrentStep] = useState(0);

  const TOTAL_STEPS = 6;

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setCurrentStep((prev) => Math.min(prev + 1, TOTAL_STEPS - 1));
      if (e.key === 'ArrowLeft') setCurrentStep((prev) => Math.max(prev - 1, 0));
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const steps: WalkthroughStep[] = [
    // STEP 1: Executive Overview
    {
      id: 1,
      badge: 'SYSTEM OVERVIEW',
      title: 'Welcome to Vistar Intake OS',
      subtitle: 'Enterprise-grade client asset healing and deterministic schema normalization',
      tagline: 'Zero-Rejection Client Onboarding Philosophy',
      content: (
        <div className="space-y-4 text-xs">
          <div className="rounded-2xl obsidian-card p-5 space-y-3 border border-white/10 shadow-lg">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-zinc-950 font-bold shadow-md">
                <VistarStarIcon size={20} />
              </div>
              <div>
                <div className="font-bold text-sm text-white font-display">The Untrusted Client Intake Problem</div>
                <div className="font-mono text-[11px] text-zinc-400">Traditional software fails on human inputs</div>
              </div>
            </div>
            <p className="text-zinc-300 leading-relaxed text-[11.5px]">
              When non-technical enterprise clients upload messy Excel spreadsheets, raw notes, or unsorted product
              photos, traditional software crashes or throws cryptic validation errors. Vistar Intake OS introduces a
              <strong> deterministic healing pipeline</strong> that intercepts noise, auto-pads media, coerces types, and caches
              header signatures to commit clean records with <strong>zero client rejection</strong>.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2.5">
            <div className="rounded-2xl bg-white/70 border border-black/[0.06] p-3 text-center">
              <div className="font-mono text-base font-extrabold text-zinc-950">99.4%</div>
              <div className="font-mono text-[10px] text-zinc-500 mt-0.5">Deterministic SLA</div>
            </div>
            <div className="rounded-2xl bg-white/70 border border-black/[0.06] p-3 text-center">
              <div className="font-mono text-base font-extrabold text-emerald-700">&lt;50ms</div>
              <div className="font-mono text-[10px] text-zinc-500 mt-0.5">Memory Cache Hit</div>
            </div>
            <div className="rounded-2xl bg-white/70 border border-black/[0.06] p-3 text-center">
              <div className="font-mono text-base font-extrabold text-zinc-950">0</div>
              <div className="font-mono text-[10px] text-zinc-500 mt-0.5">Rejected Clients</div>
            </div>
          </div>
        </div>
      ),
    },

    // STEP 2: The 4-Stage Ingestion Pipeline
    {
      id: 2,
      badge: 'ARCHITECTURE',
      title: 'The 4-Stage Healing Pipeline',
      subtitle: 'How dirty client data transforms into pristine PostgreSQL tables',
      tagline: 'Multi-layer sanitization, media normalization, and coercion',
      content: (
        <div className="space-y-2.5 text-xs">
          {[
            {
              stage: '01',
              title: 'Pre-Sanitizer Cluster',
              desc: 'Strips UTF-8 Byte-Order Marks (BOM), removes zero-width whitespace, extracts currency symbols ($ , € £) and trims cell padding.',
              icon: Sparkles,
              tag: 'Clean Text',
              color: 'text-zinc-950',
            },
            {
              stage: '02',
              title: 'Sharp Media Engine',
              desc: 'Auto-pads product photos to 1:1 square on pure white backdrop, converts to WebP, and calculates 64-bit dHash to purge duplicates.',
              icon: Layers,
              tag: '1:1 WebP & dHash',
              color: 'text-emerald-700',
            },
            {
              stage: '03',
              title: 'Zod Strict Validation Gate',
              desc: 'Coerces string numbers into strict floats/integers, parses ISO 8601 timestamps, and resolves boolean truthiness (yes/oui/1 → true).',
              icon: ShieldCheck,
              tag: 'Schema Coercion',
              color: 'text-zinc-950',
            },
            {
              stage: '04',
              title: 'Target PostgreSQL Sync',
              desc: 'Atomically commits clean validated rows to Drizzle ORM tables and archives immutable audit snapshots in the submissions ledger.',
              icon: Database,
              tag: 'Atomic Commit',
              color: 'text-emerald-700',
            },
          ].map((st) => {
            const Icon = st.icon;
            return (
              <div
                key={st.stage}
                className="rounded-2xl bg-white/80 border border-black/[0.06] p-3 flex items-start gap-3 shadow-xs hover:border-black/20 transition-all"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-950 text-white font-mono text-[11px] font-bold shrink-0">
                  {st.stage}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-zinc-950 text-xs font-display">{st.title}</span>
                    <span className="rounded-full bg-black/5 px-2 py-0.5 font-mono text-[9px] text-zinc-600 font-semibold">
                      {st.tag}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">{st.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      ),
    },

    // STEP 3: Multi-Form Telemetry Suite
    {
      id: 3,
      badge: 'TELEMETRY',
      title: 'Active Pipelines & 4 Graph Modes',
      subtitle: 'Inspect ingestion velocity, accuracy distribution, and latency',
      tagline: 'Switch between Wave, Bars, Activity Rings, and SLA Step charts',
      content: (
        <div className="space-y-3 text-xs">
          <p className="text-zinc-600 leading-relaxed text-[11.5px]">
            The <strong>Active Pipelines</strong> card provides four dedicated visual forms to audit engine health.
            Use the top-right toggle pill on the card to switch views on the fly:
          </p>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl bg-white/80 border border-black/[0.06] p-3 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-zinc-950 font-display">
                <Activity className="h-3.5 w-3.5 text-zinc-800" />
                <span>Spline Wave</span>
              </div>
              <p className="text-[11px] text-zinc-500">
                Continuous edge-to-edge cubic Bezier area spline showing real-time accuracy percentages across hours.
              </p>
            </div>

            <div className="rounded-2xl bg-white/80 border border-black/[0.06] p-3 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-zinc-950 font-display">
                <BarChart3 className="h-3.5 w-3.5 text-zinc-800" />
                <span>Velocity Bars</span>
              </div>
              <p className="text-[11px] text-zinc-500">
                Stacked volume bars per batch with amber accent caps representing the proportion of auto-healed cells.
              </p>
            </div>

            <div className="rounded-2xl bg-white/80 border border-black/[0.06] p-3 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-zinc-950 font-display">
                <Layers className="h-3.5 w-3.5 text-emerald-600" />
                <span>Activity Rings</span>
              </div>
              <p className="text-[11px] text-zinc-500">
                Concentric VisionOS-style radial gauge comparing Auto-Healing (98.2%), Media 1:1 (100%), and Memory (96.5%).
              </p>
            </div>

            <div className="rounded-2xl bg-white/80 border border-black/[0.06] p-3 space-y-1">
              <div className="flex items-center gap-1.5 font-bold text-zinc-950 font-display">
                <Clock className="h-3.5 w-3.5 text-zinc-800" />
                <span>SLA Staircase</span>
              </div>
              <p className="text-[11px] text-zinc-500">
                Stepped pipeline latency flow showing sub-50ms deterministic compliance across each processing stage.
              </p>
            </div>
          </div>
        </div>
      ),
    },

    // STEP 4: Live Batch Inspection & Token Diffing
    {
      id: 4,
      badge: 'LIVE AUDIT',
      title: 'Batch Inspection & SQL Diffing',
      subtitle: 'See exactly what was dirty, what was healed, and export SQL',
      tagline: 'Click any timeline row in Card 1 to inspect data transformations',
      content: (
        <div className="space-y-3 text-xs">
          <p className="text-zinc-600 leading-relaxed text-[11.5px]">
            Every batch in the <strong>Live Intake Stream</strong> (09:00 to 19:00) is fully interactive. Clicking a row opens
            the <strong>Deterministic Transformation Diff</strong> inspector:
          </p>

          <div className="rounded-2xl bg-zinc-950 text-white p-4 space-y-2.5 font-mono text-[11px]">
            <div className="flex items-center justify-between text-zinc-400 text-[10px] pb-1 border-b border-white/10">
              <span>FIELD TRANSFORM PREVIEW</span>
              <span className="text-emerald-400">AUTO-HEALED</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center bg-white/5 p-2 rounded-xl">
                <span className="text-zinc-400">PRICE:</span>
                <div className="flex items-center gap-2">
                  <span className="text-rose-400 line-through">&quot; $149.99 &quot;</span>
                  <span className="text-zinc-500">→</span>
                  <span className="text-emerald-400 font-bold">149.99 (float)</span>
                </div>
              </div>
              <div className="flex justify-between items-center bg-white/5 p-2 rounded-xl">
                <span className="text-zinc-400">SKU CODE:</span>
                <div className="flex items-center gap-2">
                  <span className="text-rose-400 line-through">&quot; APX - 101 &quot;</span>
                  <span className="text-zinc-500">→</span>
                  <span className="text-emerald-400 font-bold">&quot;APX-101&quot;</span>
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] font-mono text-zinc-500 pt-1">
            <span className="flex items-center gap-1.5">
              <Code2 className="h-3.5 w-3.5 text-zinc-700" />
              1-Click Copy Ready SQL INSERT
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              1-Click Copy Healed JSON
            </span>
          </div>
        </div>
      ),
    },

    // STEP 5: Zero-Login Client Dropzone & QR Bridge
    {
      id: 5,
      badge: 'CLIENT EXPERIENCE',
      title: 'Zero-Login Client Dropzones',
      subtitle: 'Branded public magic links and mobile QR scanning for clients',
      tagline: 'No accounts, no passwords, no friction for uploading parties',
      content: (
        <div className="space-y-3 text-xs">
          <p className="text-zinc-600 leading-relaxed text-[11.5px]">
            Clients don&apos;t need an account or software installation. Each blueprint generates a unique, branded
            magic link (e.g. <code className="bg-zinc-100 px-1 py-0.5 rounded text-zinc-800">/intake/shopify-d2c-catalog</code>):
          </p>

          <div className="rounded-2xl bg-white/80 border border-black/[0.06] p-3.5 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="font-bold text-zinc-950 font-display">Client Dropzone Features</div>
              <span className="font-mono text-[9px] bg-emerald-500/10 text-emerald-800 border border-emerald-500/20 px-2 py-0.5 rounded-full font-bold">
                PUBLIC MAGIC LINK
              </span>
            </div>
            <ul className="space-y-1.5 text-zinc-600 text-[11.5px]">
              <li className="flex items-center gap-2">
                <span className="text-emerald-600 font-bold">✔</span>
                <span><strong>Drag-and-Drop:</strong> Accepts dirty Excel, CSVs, raw text notes, and unsorted photos.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-600 font-bold">✔</span>
                <span><strong>Mobile QR Bridge:</strong> Onboarding managers can scan a QR code to upload photos directly from a smartphone.</span>
              </li>
              <li className="flex items-center gap-2">
                <span className="text-emerald-600 font-bold">✔</span>
                <span><strong>Live Ingestion Stepper:</strong> Clients see instant reassuring checkmarks as their files are normalized.</span>
              </li>
            </ul>
          </div>

          <div className="flex justify-center pt-1">
            <Link
              href="/intake/shopify-d2c-catalog"
              className="inline-flex items-center gap-2 rounded-full bg-[#0D0D0E] text-white px-5 py-2 text-xs font-semibold hover:bg-black transition-all active:scale-95 shadow-sm"
            >
              <span>Launch Live Dropzone Portal</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      ),
    },

    // STEP 6: Interactive Simulator & Shortcuts
    {
      id: 6,
      badge: 'OPERATIONAL COMMANDS',
      title: 'Keyboard Shortcuts & Simulation',
      subtitle: 'Master the console like a senior operations engineer',
      tagline: 'Instant dry-runs and global window drag-and-drop',
      content: (
        <div className="space-y-3 text-xs">
          <div className="rounded-2xl bg-zinc-50 border border-black/[0.06] p-3.5 space-y-2">
            <div className="font-bold text-zinc-950 font-display">Power Shortcuts</div>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <div className="flex items-center justify-between bg-white p-2 rounded-xl border border-black/[0.04]">
                <span className="text-zinc-600">Simulate Intake:</span>
                <span className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-bold text-zinc-900">⌘D / Ctrl+D</span>
              </div>
              <div className="flex items-center justify-between bg-white p-2 rounded-xl border border-black/[0.04]">
                <span className="text-zinc-600">Omni Search:</span>
                <span className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-bold text-zinc-900">⌘K / Ctrl+K</span>
              </div>
              <div className="flex items-center justify-between bg-white p-2 rounded-xl border border-black/[0.04]">
                <span className="text-zinc-600">Dismiss Popups:</span>
                <span className="rounded bg-zinc-200/80 px-1.5 py-0.5 font-bold text-zinc-900">Escape</span>
              </div>
              <div className="flex items-center justify-between bg-white p-2 rounded-xl border border-black/[0.04]">
                <span className="text-zinc-600">Global Ingest:</span>
                <span className="rounded bg-emerald-500/10 text-emerald-800 border border-emerald-500/20 px-1.5 py-0.5 font-bold">Drag File Anywhere</span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl obsidian-card p-4 text-center space-y-2.5">
            <div className="text-xs font-bold text-white font-display">Ready to see it in action?</div>
            <p className="text-[11px] text-zinc-400">
              Trigger a live 4-stage chaotic intake test now to watch the engine heal unformatted retail data in real time.
            </p>
            <button
              type="button"
              onClick={() => {
                onClose();
                if (onRunSimulation) onRunSimulation();
              }}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-500 text-zinc-950 px-6 py-2.5 text-xs font-bold hover:bg-emerald-400 transition-all active:scale-95 shadow-md"
            >
              <Zap className="h-3.5 w-3.5 text-zinc-950 fill-zinc-950" />
              <span>Run Live Simulation Now</span>
            </button>
          </div>
        </div>
      ),
    },
  ];

  const activeStep = steps[currentStep];

  return (
    <ClientPortal lockScroll={true}>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md animate-fade-in">
        <div className="w-full max-w-xl rounded-[32px] bg-white/95 backdrop-blur-2xl border border-white p-6 shadow-2xl space-y-5 animate-pop-in">
          {/* Top Header */}
          <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-zinc-950 text-white shadow-xs">
                <VistarStarIcon size={16} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-[9px] font-bold tracking-widest text-emerald-700 uppercase">
                    {activeStep.badge}
                  </span>
                  <span className="text-[10px] text-zinc-400 font-mono">
                    ({currentStep + 1} of {steps.length})
                  </span>
                </div>
                <h2 className="text-base font-extrabold text-zinc-950 font-display">{activeStep.title}</h2>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-1.5 text-zinc-400 hover:text-zinc-950 hover:bg-black/5 transition-all cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Dynamic Content Slide */}
          <div className="min-h-[260px] flex flex-col justify-between">{activeStep.content}</div>

          {/* Bottom Navigation & Indicator Pills */}
          <div className="flex items-center justify-between pt-3 border-t border-black/[0.06]">
            {/* Progress Indicator Dots */}
            <div className="flex items-center gap-1.5">
              {steps.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setCurrentStep(idx)}
                  className={`h-2 rounded-full transition-all cursor-pointer ${
                    currentStep === idx
                      ? 'w-6 bg-zinc-950 shadow-xs'
                      : 'w-2 bg-zinc-200 hover:bg-zinc-400'
                  }`}
                  title={`Go to step ${idx + 1}`}
                />
              ))}
            </div>

            {/* Nav Controls */}
            <div className="flex items-center gap-2">
              {currentStep > 0 && (
                <button
                  type="button"
                  onClick={() => setCurrentStep((prev) => Math.max(prev - 1, 0))}
                  className="rounded-full border border-black/10 px-3.5 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-100 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  <span>Prev</span>
                </button>
              )}

              {currentStep < steps.length - 1 ? (
                <button
                  type="button"
                  onClick={() => setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1))}
                  className="rounded-full bg-[#0D0D0E] text-white px-4 py-1.5 text-xs font-bold hover:bg-black transition-all flex items-center gap-1 shadow-xs active:scale-95 cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full bg-[#0D0D0E] text-white px-5 py-1.5 text-xs font-bold hover:bg-black transition-all active:scale-95 shadow-xs cursor-pointer"
                >
                  Got It
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </ClientPortal>
  );
}
