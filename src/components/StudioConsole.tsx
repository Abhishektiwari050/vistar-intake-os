'use client';

import React, { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Play,
  ArrowUpRight,
  CheckCircle2,
  CopySlash,
  Sparkles,
  FileSpreadsheet,
  Clock,
  Fingerprint,
  Plus,
  Pencil,
  Trash2,
  Search,
  AlertTriangle,
  Copy,
  Check,
  X,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Layers,
  Bell,
  MoreHorizontal,
  Calendar,
  ShieldCheck,
  UploadCloud,
  FileText,
  Database,
  BarChart3,
  Settings,
  Activity,
  Code2,
  Zap,
  Terminal,
  ExternalLink,
  Sliders,
  Filter,
} from 'lucide-react';
import type { Blueprint, SubmissionStats } from '@/lib/types/intake';
import { BlueprintBuilderModal } from './BlueprintBuilderModal';
import { VistarLogo, VistarStarIcon } from './VistarLogo';
import { WalkthroughModal } from './WalkthroughModal';
import { ClientPortal } from './ClientPortal';

export interface MappingMemoryRecord {
  id: string;
  blueprintId: string;
  blueprintTitle: string;
  blueprintName: string;
  blueprintSlug: string;
  headerHash: string;
  mappingJson: Record<string, string>;
  hitCount: number;
  createdAt: string;
}

interface SubmissionSummary {
  id: string;
  blueprintId: string;
  blueprintSlug: string;
  clientName: string;
  status: string;
  stats: SubmissionStats;
  createdAt: string;
}

// Curated dirty client datasets for the Interactive Ingestion Studio
const DIRTY_SAMPLES = [
  {
    id: 'shopify-dirty',
    title: 'Shopify D2C Catalog',
    subtitle: '48 Dirty Records · Unsanitized Currency & UTF-8 BOM',
    source: 'Shopify Webhook v2026.10',
    protocol: 'WEBHOOK',
    slug: 'shopify-d2c-catalog',
    rawFields: {
      'SKU CODE': '  APX-101-BLK  ',
      'PRICE ($)': ' $ 149.99 ',
      'INVENTORY': ' 24 units ',
      'IMAGE_URL': 'banner_wide_raw.png (1920x800)',
      'AVAILABLE': 'yes',
      'CREATED_AT': '17/11/2026',
    },
    healedFields: {
      sku: 'APX-101-BLK',
      price: 149.99,
      inventory: 24,
      image_webp: 'banner_wide.webp (1:1 Pad, dHash: a8f10b2c)',
      available: true,
      created_at: '2026-11-17T00:00:00.000Z',
    },
    stats: { cleanRows: 48, healedCells: 18, dupesBlocked: 1, latencyMs: 142 },
  },
  {
    id: 'autoparts-dirty',
    title: 'Automotive EDI Spec Sheet',
    subtitle: '124 SKUs · String Numerals & Non-Standard Dates',
    source: 'AutoParts EDI SFTP Stream',
    protocol: 'SFTP',
    slug: 'shopify-d2c-catalog',
    rawFields: {
      'PART_NUMBER': 'BRK-990-FR',
      'WEIGHT_LBS': ' 7.54 lbs ',
      'CERTIFIED_DOT': '1',
      'DISCOUNT_%': ' 15.5 % ',
      'INSPECTION_DATE': '2026.11.16',
    },
    healedFields: {
      part_number: 'BRK-990-FR',
      weight_kg: 3.42,
      certified_dot: true,
      discount_rate: 0.155,
      inspection_date: '2026-11-16T00:00:00.000Z',
    },
    stats: { cleanRows: 124, healedCells: 28, dupesBlocked: 0, latencyMs: 88 },
  },
  {
    id: 'agency-dirty',
    title: 'Creative Agency Brief Drop',
    subtitle: '65 Rows · Multi-Currency (€) & ISO Formatting',
    source: 'Client Dropzone Portal',
    protocol: 'DROPZONE',
    slug: 'shopify-d2c-catalog',
    rawFields: {
      'CLIENT_NAME': '  Acme Lux Media  ',
      'BUDGET': ' € 12,500.00 ',
      'CHANNELS': 'instagram, tiktok, youtube',
      'START_WEEK': 'Nov 17 2026',
    },
    healedFields: {
      client_name: 'Acme Lux Media',
      budget_eur: 12500.0,
      channels: '["instagram","tiktok","youtube"]',
      start_date: '2026-11-17T00:00:00.000Z',
    },
    stats: { cleanRows: 65, healedCells: 32, dupesBlocked: 0, latencyMs: 96 },
  },
];

// Production batch stream records with actual source provenance
interface TimelineBatch {
  id: string;
  time: string;
  title: string;
  subTitle: string;
  slug: string;
  source: {
    type: string;
    protocol: string;
    endpoint: string;
  };
  healedCount: number;
  totalRecords: number;
  latencyMs: number;
  status: 'Deterministic' | 'Auto-Healed' | 'Memory Hit';
  rule: string;
  sampleRaw: Record<string, string>;
  sampleHealed: Record<string, any>;
}

const PRODUCTION_BATCHES: TimelineBatch[] = [
  {
    id: 'batch-0900',
    time: '09:00',
    title: 'Shopify D2C Catalog',
    subTitle: '48 Healed · Zero Rejection',
    slug: 'shopify-d2c-catalog',
    source: {
      type: 'Webhook',
      protocol: 'Shopify Webhook v2026.10',
      endpoint: 'POST /api/intake/shopify',
    },
    healedCount: 48,
    totalRecords: 124,
    latencyMs: 142,
    status: 'Auto-Healed',
    rule: 'BOM Header Strip & Price Symbol Extraction ($ → decimal float)',
    sampleRaw: { 'SKU CODE': ' APX - 101 ', 'PRICE ($)': '$149.99', INVENTORY: ' 24 ' },
    sampleHealed: { sku: 'APX-101', price: 149.99, inventory: 24 },
  },
  {
    id: 'batch-1100',
    time: '11:00',
    title: 'Auto Parts Spec Engine',
    subTitle: '124 SKUs · Schema Compiled',
    slug: 'shopify-d2c-catalog',
    source: {
      type: 'SFTP',
      protocol: 'AutoParts EDI / SFTP Stream',
      endpoint: 'sftp://ingest.vistar.internal/skus',
    },
    healedCount: 18,
    totalRecords: 280,
    latencyMs: 88,
    status: 'Deterministic',
    rule: 'Zod Coercion & Unicode Whitespace Normalizer',
    sampleRaw: { 'PART NUMBER': 'BRK-990-FR', 'WEIGHT (KG)': '3.42 kg', CERTIFIED: 'yes' },
    sampleHealed: { part_number: 'BRK-990-FR', weight_kg: 3.42, certified: true },
  },
  {
    id: 'batch-1300',
    time: '13:00',
    title: 'Agency Creative Brief',
    subTitle: 'Currency Healed & Coerced',
    slug: 'shopify-d2c-catalog',
    source: {
      type: 'Dropzone',
      protocol: 'Portal Client Upload (CSV/XLSX)',
      endpoint: 'client.vistar.tech/intake',
    },
    healedCount: 32,
    totalRecords: 65,
    latencyMs: 96,
    status: 'Auto-Healed',
    rule: 'ISO Date-Time Format & Multi-Currency Normalization',
    sampleRaw: { 'CAMPAIGN DATE': '12/06/2026', BUDGET: '€ 12,500.00' },
    sampleHealed: { campaign_date: '2026-06-12T00:00:00Z', budget_eur: 12500.0 },
  },
  {
    id: 'batch-1500',
    time: '15:00',
    title: 'dHash Media Sweep',
    subTitle: '8 Dupes Purged · 1:1 Aspect',
    slug: 'shopify-d2c-catalog',
    source: {
      type: 'API',
      protocol: 'REST Media Normalizer Hook',
      endpoint: 'POST /api/media/normalize',
    },
    healedCount: 8,
    totalRecords: 92,
    latencyMs: 210,
    status: 'Deterministic',
    rule: 'Sharp 1:1 Aspect Auto-Padding with pure white & 64-bit dHash deduplication',
    sampleRaw: { 'IMAGE URL': 'banner_wide_raw.png', DIMS: '1920x800' },
    sampleHealed: { padded_aspect: '1:1 Square (1920x1920)', format: 'WebP', dhash_fingerprint: 'a8f10b2c' },
  },
  {
    id: 'batch-1700',
    time: '17:00',
    title: 'Target PostgreSQL Sync',
    subTitle: '100% Valid · Zero Rejection',
    slug: 'shopify-d2c-catalog',
    source: {
      type: 'DB Sync',
      protocol: 'PostgreSQL Drizzle Sync Engine',
      endpoint: 'postgres://main.vistar.internal:5432',
    },
    healedCount: 0,
    totalRecords: 410,
    latencyMs: 42,
    status: 'Memory Hit',
    rule: 'SHA-256 Mapping Memory Match · Instantaneous DB Ingestion',
    sampleRaw: { 'HEADER HASH': '7f83b1657ff1... (matched)', ROWS: '410 valid' },
    sampleHealed: { postgres_commit: 'SUCCESS', target_table: 'shopify_products', rows_inserted: 410 },
  },
  {
    id: 'batch-1900',
    time: '19:00',
    title: 'Scheduled Nightly Ingestion',
    subTitle: 'Queue Armed · Auto-Trigger',
    slug: 'shopify-d2c-catalog',
    source: {
      type: 'Cron',
      protocol: 'Nightly Cron Ingestion Worker #4',
      endpoint: 'cron(0 19 * * *)',
    },
    healedCount: 0,
    totalRecords: 0,
    latencyMs: 0,
    status: 'Deterministic',
    rule: 'Nightly Scheduled Ingestion Engine · Auto-validates all incoming drops',
    sampleRaw: { SCHEDULE: '19:00:00 UTC', TRIGGER: 'Cron Worker #4' },
    sampleHealed: { status: 'STANDBY', target: 'shopify_products' },
  },
];

// Cluster specifications and runtime metrics
interface ClusterInfo {
  title: string;
  subtitle: string;
  badge: string;
  status: string;
  throughput: string;
  specs: string[];
  telemetry: {
    workers: string;
    memory: string;
    backlog: string;
    uptime: string;
  };
}

const CLUSTERS: Record<'preSanitizer' | 'mediaEngine' | 'zodGate', ClusterInfo> = {
  preSanitizer: {
    title: 'Pre-Sanitizer Cluster',
    subtitle: 'Zero-loss noise reduction & header strip',
    badge: 'STAGE 01',
    status: 'Healthy · 3 workers active',
    throughput: '4,200 rows/sec',
    specs: [
      'Byte-Order Mark (BOM) UTF-8/UTF-16 strip',
      'Trailing & leading whitespace auto-trimming',
      'Non-breaking spaces & hidden unicode cleansing',
      'Currency symbol & delimiter extraction ($ , € £ ¥)',
    ],
    telemetry: {
      workers: '3 Node worker threads',
      memory: '118 MB / 512 MB',
      backlog: '0 pending',
      uptime: '99.99%',
    },
  },
  mediaEngine: {
    title: 'Media Engine Cluster',
    subtitle: 'dHash & 1:1 auto-pad normalizer',
    badge: 'STAGE 02',
    status: 'Optimal · Sharp Engine v0.33',
    throughput: '320 assets/min',
    specs: [
      '1:1 Square Auto-Padding with pure white backdrop',
      'WebP lossless conversion with 85% visual fidelity',
      '64-bit difference hash (dHash) computed across grayscale matrices',
      'Hamming distance threshold ≤ 10 for automatic duplicate purge',
    ],
    telemetry: {
      workers: 'Sharp libvips pool (8)',
      memory: '246 MB / 1024 MB',
      backlog: '0 pending',
      uptime: '100.00%',
    },
  },
  zodGate: {
    title: 'Zod Strict Gate',
    subtitle: 'SQL type normalization & constraint validation',
    badge: 'STAGE 03',
    status: 'Enforced · Zero Rejections',
    throughput: '9,800 rows/sec',
    specs: [
      'Coercion engine converts string numerals to floats/integers',
      'ISO 8601 strict date-time auto-formatting',
      'Boolean truthy normalization (yes/true/1/oui → true)',
      'Deterministic error healing fallback to safe null defaults',
    ],
    telemetry: {
      workers: 'Isolated V8 runtime',
      memory: '84 MB / 256 MB',
      backlog: '0 pending',
      uptime: '100.00%',
    },
  },
};

export function StudioConsole() {
  const router = useRouter();
  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [submissions, setSubmissions] = useState<SubmissionSummary[]>([]);
  const [memoryCount, setMemoryCount] = useState(0);
  const [loading, setLoading] = useState(true);

  // Navigation & Drawers
  const [activeNav, setActiveNav] = useState<
    'studio' | 'blueprints' | 'dropzones' | 'submissions' | 'memory' | 'gate' | 'settings'
  >('studio');

  // Deep Management Drawer state
  const [memoryRecords, setMemoryRecords] = useState<MappingMemoryRecord[]>([]);
  const [memoryLoading, setMemoryLoading] = useState(false);
  const [invalidatingId, setInvalidatingId] = useState<string | null>(null);

  // Time & Filter state
  const [timeFilter, setTimeFilter] = useState<'day' | 'week' | 'month' | 'year'>('day');
  const [selectedDate, setSelectedDate] = useState('17 NOV 2026');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [subSearch, setSubSearch] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [optionsMenuOpen, setOptionsMenuOpen] = useState(false);

  // Hero Interactive Ingestion Workbench State
  const [activeSampleIndex, setActiveSampleIndex] = useState(0);
  const [workbenchRunning, setWorkbenchRunning] = useState(false);
  const [workbenchStep, setWorkbenchStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [workbenchComplete, setWorkbenchComplete] = useState(false);

  // Modals & Contextual Inspector Drawer
  const [selectedBatch, setSelectedBatch] = useState<TimelineBatch | null>(null);
  const [selectedClusterKey, setSelectedClusterKey] = useState<'preSanitizer' | 'mediaEngine' | 'zodGate' | null>(null);
  const [builderOpen, setBuilderOpen] = useState(false);
  const [editingBlueprint, setEditingBlueprint] = useState<Blueprint | null>(null);
  const [walkthroughOpen, setWalkthroughOpen] = useState(false);
  const [isWindowDragging, setIsWindowDragging] = useState(false);
  const [copiedDiffType, setCopiedDiffType] = useState<'json' | 'sql' | 'diff' | null>(null);

  // Master Studio Designer States
  const [workbenchViewMode, setWorkbenchViewMode] = useState<'pipeline' | 'diff' | 'sql'>('pipeline');
  const [streamProtocolFilter, setStreamProtocolFilter] = useState<'ALL' | 'WEBHOOK' | 'SFTP' | 'DROPZONE' | 'API' | 'DB SYNC'>('ALL');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [commandSearch, setCommandSearch] = useState('');
  const [customScratchpadActive, setCustomScratchpadActive] = useState(false);
  const [customRawInput, setCustomRawInput] = useState(JSON.stringify(DIRTY_SAMPLES[0].rawFields, null, 2));

  // Toast Notification
  const [toastNotification, setToastNotification] = useState<{
    blueprintName: string;
    slug: string;
    url: string;
  } | null>(null);

  // Platform detection
  const [isMac, setIsMac] = useState(false);
  const cmdShortcutD = isMac ? '⌘D' : 'Ctrl+D';
  const cmdShortcutK = isMac ? '⌘K' : 'Ctrl+K';

  const searchInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  const activeSample = DIRTY_SAMPLES[activeSampleIndex];

  const loadData = async () => {
    setLoading(true);
    try {
      const [bpResp, subResp] = await Promise.all([
        fetch('/api/blueprints'),
        fetch('/api/submissions'),
      ]);
      if (bpResp.ok && subResp.ok) {
        const bpData = await bpResp.json();
        const subData = await subResp.json();
        setBlueprints(bpData.blueprints || []);
        setMemoryCount(bpData.mappingMemoryCount || 0);
        setSubmissions(subData.submissions || []);
      }
    } catch (err) {
      console.error('Failed to load console data:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMappingMemory = async () => {
    setMemoryLoading(true);
    try {
      const resp = await fetch('/api/mapping-memory', { cache: 'no-store' });
      if (resp.ok) {
        const data = await resp.json();
        setMemoryRecords(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to load mapping memory:', err);
    } finally {
      setMemoryLoading(false);
    }
  };

  const handleInvalidateMemory = async (id: string) => {
    setInvalidatingId(id);
    try {
      const resp = await fetch(`/api/mapping-memory?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (resp.ok) {
        setMemoryRecords((prev) => prev.filter((r) => r.id !== id));
        setMemoryCount((c) => Math.max(0, c - 1));
      }
    } catch (err) {
      console.error('Failed to invalidate memory record:', err);
    } finally {
      setInvalidatingId(null);
    }
  };

  // Run the Hero Workbench Normalization Animation
  const runWorkbenchNormalization = async () => {
    setWorkbenchRunning(true);
    setWorkbenchComplete(false);
    setWorkbenchStep(1);

    // Stage 1: Pre-Sanitizer
    await new Promise((r) => setTimeout(r, 380));
    setWorkbenchStep(2);

    // Stage 2: Media Engine
    await new Promise((r) => setTimeout(r, 420));
    setWorkbenchStep(3);

    // Stage 3: Zod Strict Gate
    await new Promise((r) => setTimeout(r, 380));
    setWorkbenchStep(4);

    // Stage 4: PostgreSQL Commit
    await new Promise((r) => setTimeout(r, 350));
    setWorkbenchStep(5);
    setWorkbenchRunning(false);
    setWorkbenchComplete(true);

    setToastNotification({
      blueprintName: activeSample.title,
      slug: activeSample.slug,
      url: `Normalized ${activeSample.stats.cleanRows} rows · ${activeSample.stats.latencyMs}ms latency`,
    });
    setTimeout(() => setToastNotification(null), 4000);
  };

  useEffect(() => {
    loadData();
    if (typeof window !== 'undefined') {
      setIsMac(/(Mac|iPhone|iPod|iPad)/i.test(navigator.userAgent));
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmd = e.metaKey || e.ctrlKey;
      if (isCmd && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        runWorkbenchNormalization();
      }
      if (isCmd && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setCommandPaletteOpen(false);
        setSelectedBatch(null);
        setSelectedClusterKey(null);
        setDatePickerOpen(false);
        setOptionsMenuOpen(false);
        setProfileOpen(false);
      }
    };

    const handleGlobalClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && !target.closest('[data-dropdown]')) {
        setDatePickerOpen(false);
        setOptionsMenuOpen(false);
        setProfileOpen(false);
      }
    };

    const handleDragEnter = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current++;
      if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
        setIsWindowDragging(true);
      }
    };

    const handleDragLeave = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current--;
      if (dragCounterRef.current <= 0) {
        setIsWindowDragging(false);
      }
    };

    const handleDragOver = (e: DragEvent) => e.preventDefault();

    const handleDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setIsWindowDragging(false);
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
        runWorkbenchNormalization();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('click', handleGlobalClick);
    window.addEventListener('dragenter', handleDragEnter);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('dragenter', handleDragEnter);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, []);

  useEffect(() => {
    if (activeNav === 'memory') {
      loadMappingMemory();
    }
  }, [activeNav]);

  const filteredBatches = PRODUCTION_BATCHES.filter((b) => {
    const matchesSearch =
      b.title.toLowerCase().includes(subSearch.toLowerCase()) ||
      b.source.protocol.toLowerCase().includes(subSearch.toLowerCase()) ||
      b.rule.toLowerCase().includes(subSearch.toLowerCase());
    const matchesProtocol =
      streamProtocolFilter === 'ALL' ||
      b.source.type.toUpperCase() === streamProtocolFilter;
    return matchesSearch && matchesProtocol;
  });

  return (
    <div className="w-full h-screen overflow-hidden flex bg-[#FAFAFA] text-[#0A0A0A] font-sans antialiased selection:bg-zinc-200">
      
      {/* ========================================================================= */}
      {/* 1. PERSISTENT EDGE-TO-EDGE SIDEBAR (Linear/Stripe Standard) */}
      {/* ========================================================================= */}
      <aside className="w-64 shrink-0 h-screen bg-white border-r border-black/[0.06] flex flex-col justify-between p-4 z-20 select-none">
        <div className="space-y-6">
          {/* Logo & Corporate Provenance */}
          <div className="flex items-center gap-3 px-2 pt-1">
            <VistarLogo variant="horizontal" size="md" showTagline={false} />
          </div>

          {/* Core Navigation Items */}
          <nav className="space-y-1">
            <div className="px-2 pb-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
              Operations Studio
            </div>

            <button
              type="button"
              onClick={() => setActiveNav('studio')}
              className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                activeNav === 'studio'
                  ? 'bg-zinc-950 text-white font-semibold shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950 hover:bg-black/[0.03]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Activity className="h-4 w-4" />
                <span>Ingestion Studio</span>
              </div>
              <span className={`h-1.5 w-1.5 rounded-full ${activeNav === 'studio' ? 'bg-emerald-400' : 'bg-emerald-500'} animate-pulse`} />
            </button>

            <button
              type="button"
              onClick={() => setActiveNav('blueprints')}
              className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                activeNav === 'blueprints'
                  ? 'bg-zinc-950 text-white font-semibold shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950 hover:bg-black/[0.03]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <FileSpreadsheet className="h-4 w-4 text-zinc-400" />
                <span>Target Schemas</span>
              </div>
              <span className="font-mono text-[10px] text-zinc-400">{blueprints.length}</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveNav('dropzones')}
              className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                activeNav === 'dropzones'
                  ? 'bg-zinc-950 text-white font-semibold shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950 hover:bg-black/[0.03]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <UploadCloud className="h-4 w-4 text-zinc-400" />
                <span>Client Dropzones</span>
              </div>
              <span className="font-mono text-[10px] text-zinc-400">Live</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveNav('submissions')}
              className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                activeNav === 'submissions'
                  ? 'bg-zinc-950 text-white font-semibold shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950 hover:bg-black/[0.03]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Database className="h-4 w-4 text-zinc-400" />
                <span>Committed Data</span>
              </div>
              <span className="font-mono text-[10px] text-zinc-400">{submissions.length}</span>
            </button>

            <div className="pt-4 px-2 pb-1.5 text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
              Deterministic Core
            </div>

            <button
              type="button"
              onClick={() => setActiveNav('memory')}
              className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                activeNav === 'memory'
                  ? 'bg-zinc-950 text-white font-semibold shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950 hover:bg-black/[0.03]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Fingerprint className="h-4 w-4 text-zinc-400" />
                <span>Mapping Memory</span>
              </div>
              <span className="rounded-full bg-emerald-500/10 text-emerald-800 border border-emerald-500/20 px-2 py-0.5 font-mono text-[9px] font-bold">
                {memoryCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setActiveNav('gate')}
              className={`w-full flex items-center justify-between rounded-xl px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                activeNav === 'gate'
                  ? 'bg-zinc-950 text-white font-semibold shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950 hover:bg-black/[0.03]'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ShieldCheck className="h-4 w-4 text-zinc-400" />
                <span>Deterministic Gate</span>
              </div>
              <span className="font-mono text-[10px] text-emerald-600 font-bold">Strict</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveNav('settings')}
              className={`w-full flex items-center gap-2.5 rounded-xl px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
                activeNav === 'settings'
                  ? 'bg-zinc-950 text-white font-semibold shadow-xs'
                  : 'text-zinc-600 hover:text-zinc-950 hover:bg-black/[0.03]'
              }`}
            >
              <Settings className="h-4 w-4 text-zinc-400" />
              <span>Settings</span>
            </button>
          </nav>
        </div>

        {/* Compact Workspace Status Indicator */}
        <div className="pt-3 border-t border-black/[0.06] relative" data-dropdown>
          <button
            type="button"
            onClick={() => setProfileOpen((p) => !p)}
            className="w-full flex items-center justify-between p-2 rounded-xl bg-zinc-50 hover:bg-zinc-100 border border-black/[0.04] text-left transition-all cursor-pointer group"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="h-7 w-7 rounded-lg bg-zinc-950 text-white flex items-center justify-center font-bold text-xs shrink-0 font-display">
                V
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-zinc-900 truncate font-display">Vistar Tech</div>
                <div className="text-[10px] text-zinc-400 font-mono truncate">Engine Cluster 01</div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <ChevronDown className={`h-3 w-3 text-zinc-400 transition-transform ${profileOpen ? 'rotate-180' : ''}`} />
            </div>
          </button>

          {profileOpen && (
            <div
              data-dropdown
              className="absolute bottom-14 left-0 w-60 rounded-2xl bg-white border border-zinc-200 shadow-[0_16px_40px_rgba(0,0,0,0.15)] p-3 z-50 animate-pop-in space-y-2 text-xs"
            >
              <div className="flex items-center justify-between border-b border-black/[0.05] pb-2">
                <div>
                  <div className="font-bold text-zinc-950 font-display">Vistar Intelligence</div>
                  <div className="text-[10px] text-zinc-400 font-mono">intake-os.vistar.tech</div>
                </div>
                <span className="rounded-full bg-emerald-500/10 text-emerald-800 border border-emerald-500/20 px-2 py-0.5 font-mono text-[9px] font-bold">
                  ONLINE
                </span>
              </div>
              <div className="space-y-1 text-[11px] font-mono text-zinc-600">
                <div className="flex justify-between">
                  <span className="text-zinc-400">Environment:</span>
                  <span className="font-semibold text-zinc-800">Production (Zero-Loss)</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Security Gate:</span>
                  <span className="text-emerald-700 font-semibold">Strict Zod + dHash</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-400">Active DB:</span>
                  <span className="text-zinc-800 font-semibold">PostgreSQL (Drizzle)</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 2. MAIN WORKSPACE CANVAS (Full-Bleed, Scrollable Workbench) */}
      {/* ========================================================================= */}
      <main className="flex-1 h-screen overflow-y-auto flex flex-col min-w-0 bg-[#F8F9FA]">
        
        {/* SOLID STICKY TOP COMMAND BAR (Collision-Free, Crisp Z-Index) */}
        <header className="sticky top-0 z-30 bg-white border-b border-zinc-200 px-6 h-13 flex items-center justify-between shrink-0 shadow-[0_1px_3px_rgba(0,0,0,0.02)]">
          
          {/* Left: Breadcrumbs & Time Scope (shrink-0 to prevent flex compression) */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-semibold text-zinc-400">Vistar Intake OS</span>
              <span className="text-zinc-300">/</span>
              <span className="font-semibold text-xs text-zinc-900 font-display">Studio Workbench</span>
            </div>

            <span className="text-zinc-200">|</span>

            {/* Date Window Capsule */}
            <div className="relative" data-dropdown>
              <button
                type="button"
                onClick={() => setDatePickerOpen((p) => !p)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-100 hover:bg-zinc-200/80 px-2.5 py-1 text-xs font-medium text-zinc-800 transition-colors cursor-pointer font-mono border border-zinc-200/60"
              >
                <Calendar className="h-3 w-3 text-zinc-500" />
                <span>{selectedDate}</span>
                <ChevronDown className="h-3 w-3 text-zinc-400" />
              </button>

              {datePickerOpen && (
                <div
                  data-dropdown
                  className="absolute left-0 mt-1.5 w-52 rounded-xl bg-white border border-zinc-200 shadow-xl p-1.5 z-50 animate-pop-in space-y-0.5 text-xs"
                >
                  {['17 NOV 2026', '16 NOV 2026', '15 NOV 2026', 'Last 7 Days Rolling'].map((d) => (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        setSelectedDate(d);
                        setDatePickerOpen(false);
                      }}
                      className={`w-full flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left cursor-pointer ${
                        selectedDate === d ? 'bg-zinc-950 text-white font-medium' : 'text-zinc-700 hover:bg-zinc-100'
                      }`}
                    >
                      <span>{d}</span>
                      {selectedDate === d && <Check className="h-3 w-3 text-emerald-400" />}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Time Filter Pills */}
            <div className="inline-flex rounded-lg bg-zinc-100 p-0.5 text-xs font-medium text-zinc-600 border border-zinc-200/60">
              {(['day', 'week', 'month', 'year'] as const).map((period) => (
                <button
                  key={period}
                  type="button"
                  onClick={() => setTimeFilter(period)}
                  className={`rounded-md px-2 py-0.5 capitalize transition-all cursor-pointer ${
                    timeFilter === period ? 'bg-white text-zinc-950 font-semibold shadow-xs' : 'hover:text-zinc-950'
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>

          {/* Right: Quick Actions & Search (shrink-0) */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={runWorkbenchNormalization}
              title={`Execute Deterministic Normalization (${cmdShortcutD})`}
              className="inline-flex items-center gap-1.5 rounded-lg bg-zinc-950 text-white hover:bg-black px-3 py-1.5 text-xs font-semibold shadow-xs transition-all active:scale-95 cursor-pointer"
            >
              <Zap className="h-3.5 w-3.5 text-emerald-400" />
              <span>Simulate</span>
              <span className="rounded bg-white/15 px-1 py-0.2 font-mono text-[9px] text-zinc-200">{cmdShortcutD}</span>
            </button>

            <button
              type="button"
              onClick={() => setWalkthroughOpen(true)}
              title="Interactive System Walkthrough"
              className="inline-flex items-center gap-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 border border-zinc-200 transition-colors cursor-pointer"
            >
              <Sparkles className="h-3 w-3 text-indigo-600" />
              <span className="hidden sm:inline">Tour</span>
            </button>

            {/* Search Box Trigger for Command Palette */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-zinc-400" />
              <button
                type="button"
                onClick={() => setCommandPaletteOpen(true)}
                className="rounded-lg bg-zinc-100 hover:bg-zinc-200/80 pl-8 pr-3 py-1 text-xs text-zinc-500 border border-zinc-200 focus:outline-none transition-all w-36 sm:w-48 h-7.5 flex items-center justify-between text-left cursor-pointer"
              >
                <span className="truncate">Quick actions...</span>
                <span className="font-mono text-[9px] bg-white border border-zinc-200 px-1 py-0.2 rounded text-zinc-400">
                  {cmdShortcutK}
                </span>
              </button>
            </div>

            {/* Notification Bell */}
            <button
              type="button"
              onClick={() => setNotificationsOpen(true)}
              className="relative flex h-7.5 w-7.5 items-center justify-center rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200 transition-colors cursor-pointer"
            >
              <Bell className="h-3.5 w-3.5" />
              <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </button>

            {/* Options Menu */}
            <div className="relative" data-dropdown>
              <button
                type="button"
                onClick={() => setOptionsMenuOpen((p) => !p)}
                className="flex h-7.5 w-7.5 items-center justify-center rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-700 border border-zinc-200 transition-colors cursor-pointer"
              >
                <MoreHorizontal className="h-3.5 w-3.5" />
              </button>

              {optionsMenuOpen && (
                <div
                  data-dropdown
                  className="absolute right-0 mt-1.5 w-52 rounded-xl bg-white border border-zinc-200 shadow-xl p-1 z-50 animate-pop-in space-y-0.5 text-xs"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setOptionsMenuOpen(false);
                      setEditingBlueprint(null);
                      setBuilderOpen(true);
                    }}
                    className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-zinc-900 hover:bg-zinc-100 font-medium transition-colors cursor-pointer"
                  >
                    <Plus className="h-3.5 w-3.5 text-zinc-900" />
                    <span>Create Blueprint</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOptionsMenuOpen(false);
                      loadData();
                    }}
                    className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    <span>Reload State</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOptionsMenuOpen(false);
                      setActiveNav('settings');
                    }}
                    className="w-full flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-zinc-700 hover:bg-zinc-100 transition-colors cursor-pointer"
                  >
                    <Settings className="h-3.5 w-3.5" />
                    <span>Settings</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* WORKSPACE BODY CONTENT */}
        <div className="p-5 space-y-4 max-w-[1700px] w-full mx-auto">
          
          {/* ========================================================================= */}
          {/* HIGH-DENSITY OPERATIONAL TELEMETRY HUD STRIP (Tufte / Hardware Standard) */}
          {/* ========================================================================= */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            
            {/* 1. Accuracy & Sparkline */}
            <div className="rounded-xl bg-white border border-zinc-200/90 p-3.5 flex flex-col justify-between shadow-xs space-y-2 hover:border-zinc-300 transition-colors">
              <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                <span className="flex items-center gap-1.5 font-bold">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Accuracy · 24h
                </span>
                <span className="text-emerald-700 font-semibold bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200/50">
                  +0.2%
                </span>
              </div>
              <div className="space-y-0.5">
                <div className="text-xl font-bold font-mono text-zinc-950 tracking-tight">99.4%</div>
                <div className="text-[10px] font-mono text-zinc-400">Zero Drift · Strict SLA</div>
              </div>
              {/* Micro Sparkline Curve */}
              <div className="h-4 w-full pt-1">
                <svg className="w-full h-full overflow-visible" viewBox="0 0 100 16" preserveAspectRatio="none">
                  <path
                    d="M0,12 Q15,10 30,11 T60,6 T85,4 T100,2"
                    fill="none"
                    stroke="#10B981"
                    strokeWidth="1.75"
                    strokeLinecap="round"
                  />
                </svg>
              </div>
            </div>

            {/* 2. Latency & P-Distribution */}
            <div className="rounded-xl bg-white border border-zinc-200/90 p-3.5 flex flex-col justify-between shadow-xs space-y-2 hover:border-zinc-300 transition-colors">
              <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                <span className="font-bold flex items-center gap-1.5">
                  <Activity className="h-3 w-3 text-zinc-400" />
                  Avg Latency
                </span>
                <span className="text-zinc-500 bg-zinc-100 px-1.5 py-0.2 rounded font-mono text-[9px]">
                  &lt;250ms SLA
                </span>
              </div>
              <div className="space-y-0.5">
                <div className="text-xl font-bold font-mono text-zinc-950 tracking-tight">142ms</div>
                <div className="text-[10px] font-mono text-zinc-500 font-medium">p99 engine gate</div>
              </div>
              <div className="flex items-center gap-1 text-[9px] font-mono text-zinc-400 pt-1">
                <span className="bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-600">p50: 42ms</span>
                <span className="bg-zinc-100 px-1.5 py-0.5 rounded text-zinc-600">p95: 112ms</span>
              </div>
            </div>

            {/* 3. Auto-Healed & Segmented Progress */}
            <div className="rounded-xl bg-white border border-zinc-200/90 p-3.5 flex flex-col justify-between shadow-xs space-y-2 hover:border-zinc-300 transition-colors">
              <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                <span className="font-bold flex items-center gap-1.5">
                  <Zap className="h-3 w-3 text-amber-500" />
                  Auto-Healed
                </span>
                <span className="text-amber-800 font-semibold bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200/50">
                  +48 cells
                </span>
              </div>
              <div className="space-y-0.5">
                <div className="text-xl font-bold font-mono text-amber-700 tracking-tight">98.2%</div>
                <div className="text-[10px] font-mono text-zinc-400">0 Manual Triage</div>
              </div>
              {/* Segmented Progress Bar */}
              <div className="flex items-center gap-1 h-2 w-full pt-1">
                <div className="h-1.5 rounded-full bg-emerald-500 flex-[78]" title="Numeric Coercion: 78%" />
                <div className="h-1.5 rounded-full bg-amber-500 flex-[15]" title="Format Normalization: 15%" />
                <div className="h-1.5 rounded-full bg-indigo-500 flex-[7]" title="Media Padding: 7%" />
              </div>
            </div>

            {/* 4. Mapping Memory & LED Indicators */}
            <div className="rounded-xl bg-white border border-zinc-200/90 p-3.5 flex flex-col justify-between shadow-xs space-y-2 hover:border-zinc-300 transition-colors">
              <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                <span className="font-bold flex items-center gap-1.5">
                  <Fingerprint className="h-3 w-3 text-zinc-400" />
                  Memory Hit
                </span>
                <span className="text-zinc-600 bg-zinc-100 px-1.5 py-0.2 rounded font-mono text-[9px]">
                  SHA-256
                </span>
              </div>
              <div className="space-y-0.5">
                <div className="text-xl font-bold font-mono text-zinc-950 tracking-tight">96.5%</div>
                <div className="text-[10px] font-mono text-zinc-500 font-medium">Cached Fingerprint Match</div>
              </div>
              {/* Hardware LED Meter (8 Blocks) */}
              <div className="flex items-center gap-1 pt-1">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((block) => (
                  <div
                    key={block}
                    className={`h-2 flex-1 rounded-xs transition-colors ${
                      block <= 7 ? 'bg-emerald-500' : 'bg-zinc-200'
                    }`}
                  />
                ))}
              </div>
            </div>

            {/* 5. Strict Gate Status */}
            <div className="rounded-xl bg-emerald-50/60 border border-emerald-200 p-3.5 flex flex-col justify-between shadow-xs space-y-2 col-span-2 sm:col-span-1">
              <div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-emerald-800">
                <span className="font-bold flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
                  Strict Gate
                </span>
                <span className="text-[9px] bg-emerald-100/90 text-emerald-900 border border-emerald-300/60 px-1.5 py-0.2 rounded font-bold">
                  ENFORCED
                </span>
              </div>
              <div className="space-y-0.5">
                <div className="text-xl font-bold font-mono text-emerald-950 tracking-tight">100% PASS</div>
                <div className="text-[10px] font-mono text-emerald-700 font-semibold">Atomic Lock Active</div>
              </div>
              <div className="text-[10px] font-mono text-emerald-800 flex items-center gap-1 pt-1">
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                <span>Zero Rejections Guaranteed</span>
              </div>
            </div>
          </div>
          
          {/* ========================================================================= */}
          {/* SECTION 1: THE HERO WORKBENCH — Interactive Ingestion Refinery */}
          {/* ========================================================================= */}
          <div className="rounded-xl bg-white border border-zinc-200/90 p-5 shadow-xs space-y-4">
            
            {/* Header: Title, Dataset Presets, and Mode Switcher */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-3.5">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-mono text-[10px] font-bold tracking-wider text-zinc-400 uppercase flex items-center gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                    REFINERY // PRIMARY WORK LOOP
                  </span>
                  <span className="rounded bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.2 font-mono text-[9px] font-bold">
                    60Hz ACTIVE
                  </span>
                </div>
                <h2 className="text-base font-bold text-zinc-950 font-display">
                  Deterministic Ingestion &amp; Schema Healing Workbench
                </h2>
                <p className="text-xs text-zinc-500">
                  Select dirty client test vectors or drop raw CSV/JSON to verify automated coercion into PostgreSQL.
                </p>
              </div>

              {/* Deck Control Tabs & View Mode Switcher */}
              <div className="flex flex-wrap items-center gap-3">
                {/* Dataset Selector */}
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-mono text-zinc-400">Dataset:</span>
                  <div className="inline-flex rounded-lg bg-zinc-100 p-0.5 border border-zinc-200 text-xs">
                    {DIRTY_SAMPLES.map((sample, idx) => (
                      <button
                        key={sample.id}
                        type="button"
                        onClick={() => {
                          setActiveSampleIndex(idx);
                          setWorkbenchComplete(false);
                          setCustomScratchpadActive(false);
                        }}
                        className={`rounded-md px-2.5 py-1 font-medium transition-all cursor-pointer ${
                          activeSampleIndex === idx && !customScratchpadActive
                            ? 'bg-white text-zinc-950 font-bold shadow-xs'
                            : 'text-zinc-600 hover:text-zinc-950'
                        }`}
                      >
                        {sample.title}
                      </button>
                    ))}
                  </div>
                </div>

                {/* View Mode Segmented Switcher */}
                <div className="inline-flex rounded-lg bg-zinc-100 p-0.5 border border-zinc-200 text-xs font-mono">
                  <button
                    type="button"
                    onClick={() => setWorkbenchViewMode('pipeline')}
                    className={`rounded-md px-2.5 py-1 font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                      workbenchViewMode === 'pipeline'
                        ? 'bg-zinc-950 text-white shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-950'
                    }`}
                  >
                    <Layers className="h-3 w-3" />
                    <span>Pipeline Flow</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkbenchViewMode('diff')}
                    className={`rounded-md px-2.5 py-1 font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                      workbenchViewMode === 'diff'
                        ? 'bg-zinc-950 text-white shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-950'
                    }`}
                  >
                    <Sliders className="h-3 w-3" />
                    <span>Live Diff</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setWorkbenchViewMode('sql')}
                    className={`rounded-md px-2.5 py-1 font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                      workbenchViewMode === 'sql'
                        ? 'bg-zinc-950 text-white shadow-xs'
                        : 'text-zinc-600 hover:text-zinc-950'
                    }`}
                  >
                    <Database className="h-3 w-3" />
                    <span>SQL Ledger</span>
                  </button>
                </div>
              </div>
            </div>

            {/* VIEW MODE 1: Interactive 3-Stage Pipeline Flow */}
            {workbenchViewMode === 'pipeline' && (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
                
                {/* COL 1: Raw Untrusted Input */}
                <div className="lg:col-span-4 rounded-lg bg-zinc-50/70 border border-zinc-200 p-3.5 flex flex-col justify-between space-y-3">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between border-b border-zinc-200/80 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-red-500" />
                        <span className="font-mono text-xs font-bold text-zinc-900">01 // RAW UNTRUSTED INPUT</span>
                      </div>
                      <span className="font-mono text-[10px] text-zinc-700 bg-white border border-zinc-200 px-1.5 py-0.5 rounded font-medium">
                        {activeSample.protocol}
                      </span>
                    </div>

                    <p className="text-[11px] text-zinc-500 font-mono">
                      {activeSample.subtitle}
                    </p>

                    {/* Raw Dirty Fields with Clean Monospace Strikethroughs */}
                    <div className="space-y-1 font-mono text-[11px]">
                      {Object.entries(activeSample.rawFields).map(([k, v]) => (
                        <div
                          key={k}
                          className="bg-white rounded-md p-1.5 border border-zinc-200/80 flex items-center justify-between text-xs"
                        >
                          <span className="text-zinc-500 truncate mr-2 font-medium">{k}:</span>
                          <span className="text-red-700 font-bold truncate line-through bg-red-50 px-1.5 py-0.2 rounded border border-red-200/50">
                            {String(v)}
                          </span>
                        </div>
                      ))}
                    </div>

                    {/* Raw Asset Violation Inspector Card (Visually shows aspect ratio violation) */}
                    {activeSample.rawFields['IMAGE_URL'] && (
                      <div className="rounded-md bg-amber-50/60 border border-amber-200 p-2 space-y-1 text-xs font-mono">
                        <div className="flex items-center justify-between text-[10px] text-amber-900 font-bold">
                          <span>ASSET SPEC VIOLATION</span>
                          <span className="text-[9px] bg-amber-100 text-amber-900 px-1 rounded">2.4:1 Aspect</span>
                        </div>
                        <div className="text-[11px] text-zinc-700">
                          {activeSample.rawFields['IMAGE_URL']}
                        </div>
                        <div className="text-[10px] text-amber-700">
                          Non-square asset flagged for automatic 1:1 white margin padding.
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Dropzone Trigger Alternative */}
                  <div
                    onClick={() => router.push(`/intake/${activeSample.slug}`)}
                    className="rounded-lg border border-dashed border-zinc-300 hover:border-zinc-950 p-2 text-center cursor-pointer transition-colors bg-white hover:bg-zinc-50 text-[11px] font-medium text-zinc-700 flex items-center justify-center gap-1.5"
                  >
                    <UploadCloud className="h-3.5 w-3.5 text-zinc-500" />
                    <span>Drop client file to test</span>
                  </div>
                </div>

                {/* COL 2: Deterministic 4-Stage Engine Execution */}
                <div className="lg:col-span-4 rounded-lg bg-zinc-50/70 border border-zinc-200 p-3.5 flex flex-col justify-between space-y-3">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between border-b border-zinc-200/80 pb-2">
                      <div className="flex items-center gap-2">
                        <Zap className="h-3.5 w-3.5 text-amber-500" />
                        <span className="font-mono text-xs font-bold text-zinc-900">02 // NORMALIZATION ENGINE</span>
                      </div>
                      <span className="font-mono text-[10px] text-zinc-700 bg-white border border-zinc-200 px-1.5 py-0.5 rounded font-medium">
                        Strict SLA
                      </span>
                    </div>

                    {/* 4 Execution Stages with Clean Monospace Steppers */}
                    <div className="space-y-1.5">
                      {[
                        {
                          id: 1,
                          title: '01. Pre-Sanitizer',
                          desc: 'Purge UTF-8 BOM, trim whitespace & parse currency',
                          active: workbenchRunning && workbenchStep === 1,
                          done: workbenchStep > 1 || workbenchComplete,
                        },
                        {
                          id: 2,
                          title: '02. Sharp Media Engine',
                          desc: '1:1 square auto-padding with white, WebP & 64-bit dHash',
                          active: workbenchRunning && workbenchStep === 2,
                          done: workbenchStep > 2 || workbenchComplete,
                          extra: activeSample.rawFields['IMAGE_URL'] && (
                            <div className="mt-1 p-1.5 bg-zinc-100/80 rounded border border-zinc-200/60 flex items-center justify-between text-[10px] font-mono">
                              <span className="text-zinc-600">1920×800 → 1920×1920 (1:1)</span>
                              <span className="text-emerald-700 font-bold bg-emerald-50 px-1 rounded">dHash: a8f10b2c</span>
                            </div>
                          ),
                        },
                        {
                          id: 3,
                          title: '03. Zod Strict Gate',
                          desc: 'Strict type coercion, ISO dates & schema validation',
                          active: workbenchRunning && workbenchStep === 3,
                          done: workbenchStep > 3 || workbenchComplete,
                        },
                        {
                          id: 4,
                          title: '04. PostgreSQL Commit',
                          desc: 'Atomically commit normalized rows with 0 rejections',
                          active: workbenchRunning && workbenchStep === 4,
                          done: workbenchStep > 4 || workbenchComplete,
                        },
                      ].map((st) => (
                        <div
                          key={st.id}
                          className={`rounded-md p-2 transition-all text-xs border ${
                            st.active
                              ? 'bg-amber-50 border-amber-300 text-amber-950 font-medium'
                              : st.done
                              ? 'bg-white border-zinc-200/80 text-zinc-900'
                              : 'bg-white/50 border-zinc-200/40 text-zinc-400'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {st.done ? (
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                              ) : st.active ? (
                                <RefreshCw className="h-3.5 w-3.5 text-amber-600 animate-spin shrink-0" />
                              ) : (
                                <div className="h-3 w-3 rounded-full border border-zinc-300 shrink-0" />
                              )}
                              <span className="font-semibold">{st.title}</span>
                            </div>
                            <span className={`font-mono text-[9px] uppercase tracking-wider font-semibold ${
                              st.done ? 'text-emerald-700' : st.active ? 'text-amber-700' : 'text-zinc-400'
                            }`}>
                              {st.done ? 'Pass' : st.active ? 'Active' : 'Wait'}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[10px] text-zinc-500 leading-tight pl-5.5">{st.desc}</p>
                          {st.extra && <div className="pl-5.5">{st.extra}</div>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Primary Action Button */}
                  <button
                    type="button"
                    onClick={runWorkbenchNormalization}
                    disabled={workbenchRunning}
                    className="w-full flex items-center justify-center gap-2 rounded-lg bg-zinc-950 hover:bg-black text-white font-semibold py-2 text-xs transition-transform active:scale-98 shadow-xs cursor-pointer disabled:opacity-50"
                  >
                    {workbenchRunning ? (
                      <>
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                        <span>Executing Normalization Pipeline...</span>
                      </>
                    ) : (
                      <>
                        <Zap className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Execute Deterministic Pipeline</span>
                      </>
                    )}
                  </button>
                </div>

                {/* COL 3: Verified Healed Output & Instant Exporters */}
                <div className="lg:col-span-4 rounded-lg bg-zinc-50/70 border border-zinc-200 p-3.5 flex flex-col justify-between space-y-3">
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between border-b border-zinc-200/80 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        <span className="font-mono text-xs font-bold text-zinc-900">03 // PRISTINE HEALED OUTPUT</span>
                      </div>

                      {/* Instant Exporters */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(JSON.stringify(activeSample.healedFields, null, 2));
                            setCopiedDiffType('json');
                            setTimeout(() => setCopiedDiffType(null), 2000);
                          }}
                          className="rounded bg-white hover:bg-zinc-100 px-2 py-0.5 text-[10px] font-mono font-medium text-zinc-800 border border-zinc-200 flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                        >
                          {copiedDiffType === 'json' ? <Check className="h-2.5 w-2.5 text-emerald-600" /> : <Copy className="h-2.5 w-2.5" />}
                          <span>{copiedDiffType === 'json' ? 'Copied' : 'JSON'}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            const fields = Object.keys(activeSample.healedFields);
                            const values = Object.values(activeSample.healedFields).map((v) =>
                              typeof v === 'string' ? `'${v}'` : String(v)
                            );
                            const sql = `INSERT INTO ${activeSample.slug.replace(/-/g, '_')} (${fields.join(', ')})\nVALUES (${values.join(', ')});`;
                            navigator.clipboard.writeText(sql);
                            setCopiedDiffType('sql');
                            setTimeout(() => setCopiedDiffType(null), 2000);
                          }}
                          className="rounded bg-white hover:bg-zinc-100 px-2 py-0.5 text-[10px] font-mono font-medium text-zinc-800 border border-zinc-200 flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                        >
                          {copiedDiffType === 'sql' ? <Check className="h-2.5 w-2.5 text-emerald-600" /> : <Code2 className="h-2.5 w-2.5" />}
                          <span>{copiedDiffType === 'sql' ? 'Copied' : 'SQL'}</span>
                        </button>
                      </div>
                    </div>

                    <p className="text-[11px] text-zinc-500 font-mono">
                      Coerced types, pristine decimals, and 1:1 WebP padded assets.
                    </p>

                    {/* Clean Healed Fields with Emerald Highlights */}
                    <div className="space-y-1 font-mono text-[11px]">
                      {Object.entries(activeSample.healedFields).map(([k, v]) => (
                        <div
                          key={k}
                          className="bg-white rounded-md p-1.5 border border-zinc-200/80 flex items-center justify-between text-xs"
                        >
                          <span className="text-zinc-500 truncate mr-2 font-medium">{k}:</span>
                          <span className="text-emerald-800 font-bold truncate bg-emerald-50 px-1.5 py-0.2 rounded border border-emerald-200/60">
                            {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Healed Metrics Badge */}
                  <div className="rounded-md bg-white border border-zinc-200 p-2 flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      <span>{activeSample.stats.cleanRows} Rows Valid</span>
                    </div>
                    <span className="text-zinc-500">Latency: {activeSample.stats.latencyMs}ms</span>
                  </div>
                </div>
              </div>
            )}

            {/* VIEW MODE 2: Side-by-Side Unified Diff View */}
            {workbenchViewMode === 'diff' && (
              <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-4 space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between border-b border-zinc-200 pb-2">
                  <div className="font-bold text-zinc-900 text-xs">
                    Deterministic Transformation Diff ({activeSample.title})
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const diffText = Object.keys(activeSample.rawFields)
                        .map((k) => `- ${k}: ${activeSample.rawFields[k]}\n+ ${k.toLowerCase()}: ${(activeSample.healedFields as any)[k.toLowerCase()] || 'normalized'}`)
                        .join('\n');
                      navigator.clipboard.writeText(diffText);
                      setCopiedDiffType('diff');
                      setTimeout(() => setCopiedDiffType(null), 2000);
                    }}
                    className="rounded bg-white hover:bg-zinc-100 px-2 py-1 text-[10px] text-zinc-800 border border-zinc-200 flex items-center gap-1 cursor-pointer"
                  >
                    {copiedDiffType === 'diff' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                    <span>Copy Diff</span>
                  </button>
                </div>

                <div className="space-y-1.5">
                  {Object.entries(activeSample.rawFields).map(([k, rawVal]) => {
                    const keyMap: Record<string, string> = {
                      'SKU CODE': 'sku',
                      'PRICE ($)': 'price',
                      'INVENTORY': 'inventory',
                      'IMAGE_URL': 'image_webp',
                      'AVAILABLE': 'available',
                      'CREATED_AT': 'created_at',
                      'PART_NUMBER': 'part_number',
                      'WEIGHT_LBS': 'weight_kg',
                      'CERTIFIED_DOT': 'certified_dot',
                      'DISCOUNT_%': 'discount_rate',
                      'INSPECTION_DATE': 'inspection_date',
                      'CLIENT_NAME': 'client_name',
                      'BUDGET': 'budget_eur',
                      'CHANNELS': 'channels',
                      'START_WEEK': 'start_date',
                    };
                    const targetKey = keyMap[k] || k.toLowerCase().replace(/[^a-z0-9_]/g, '_');
                    const healedVal = (activeSample.healedFields as any)[targetKey] ?? (activeSample.healedFields as any)[k.toLowerCase()] ?? 'normalized';
                    return (
                      <div key={k} className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                        <div className="bg-red-50/70 border border-red-200/80 rounded p-2 text-red-900 flex items-center justify-between">
                          <span className="text-zinc-500 font-mono">- {k}:</span>
                          <span className="font-bold line-through text-red-700">{String(rawVal)}</span>
                        </div>
                        <div className="bg-emerald-50/70 border border-emerald-200/80 rounded p-2 text-emerald-900 flex items-center justify-between">
                          <span className="text-zinc-500 font-mono">+ {targetKey}:</span>
                          <span className="font-bold text-emerald-800 font-mono">{typeof healedVal === 'object' ? JSON.stringify(healedVal) : String(healedVal)}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* VIEW MODE 3: PostgreSQL Schema Ledger */}
            {workbenchViewMode === 'sql' && (
              <div className="rounded-lg bg-zinc-900 text-zinc-100 p-4 space-y-3 font-mono text-xs">
                <div className="flex items-center justify-between border-b border-white/10 pb-2">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-emerald-400" />
                    <span className="font-bold text-white">Target Schema: {activeSample.slug.replace(/-/g, '_')}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const fields = Object.keys(activeSample.healedFields);
                      const values = Object.values(activeSample.healedFields).map((v) =>
                        typeof v === 'string' ? `'${v}'` : String(v)
                      );
                      const sql = `-- Vistar Deterministic Migration\nINSERT INTO ${activeSample.slug.replace(/-/g, '_')} (${fields.join(', ')})\nVALUES (${values.join(', ')});`;
                      navigator.clipboard.writeText(sql);
                      setCopiedDiffType('sql');
                      setTimeout(() => setCopiedDiffType(null), 2000);
                    }}
                    className="rounded bg-white/10 hover:bg-white/20 text-white px-2 py-1 text-[10px] flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    {copiedDiffType === 'sql' ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                    <span>Copy Migration SQL</span>
                  </button>
                </div>

                <pre className="text-[11px] text-emerald-400/90 leading-relaxed overflow-x-auto p-2 bg-black/40 rounded border border-white/5">
{`-- Compiled Drizzle/PostgreSQL Ledger
INSERT INTO ${activeSample.slug.replace(/-/g, '_')} (
  ${Object.keys(activeSample.healedFields).join(',\n  ')}
) VALUES (
  ${Object.values(activeSample.healedFields).map(v => typeof v === 'string' ? `'${v}'` : String(v)).join(',\n  ')}
);`}
                </pre>
              </div>
            )}
          </div>

          {/* ========================================================================= */}
          {/* SECTION 2: PRODUCTION BATCH INTAKE STREAM (High-Density Table) */}
          {/* ========================================================================= */}
          <div className="rounded-xl bg-white border border-zinc-200 p-5 shadow-xs space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-100 pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <h3 className="font-bold text-xs text-zinc-950 font-display">Live Ingestion Stream</h3>
                  <span className="font-mono text-[10px] text-zinc-400">Stream 60Hz</span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Click any batch to inspect field coercion diffs and replay ingestion.
                </p>
              </div>

              {/* Protocol Filters & Search */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex rounded-lg bg-zinc-100 p-0.5 border border-zinc-200 text-[10px] font-mono">
                  {(['ALL', 'WEBHOOK', 'SFTP', 'DROPZONE', 'API', 'DB SYNC'] as const).map((proto) => (
                    <button
                      key={proto}
                      type="button"
                      onClick={() => setStreamProtocolFilter(proto)}
                      className={`rounded px-2 py-0.5 font-medium transition-all cursor-pointer uppercase ${
                        streamProtocolFilter === proto
                          ? 'bg-zinc-950 text-white font-bold shadow-xs'
                          : 'text-zinc-600 hover:text-zinc-950'
                      }`}
                    >
                      {proto}
                    </button>
                  ))}
                </div>

                <span className="text-xs font-mono text-zinc-500 bg-zinc-50 border border-zinc-200 px-2 py-0.5 rounded">
                  {filteredBatches.length} Batches
                </span>
              </div>
            </div>

            {/* High-Density Production Batches Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-zinc-100 text-[10px] font-mono text-zinc-400 uppercase tracking-wider">
                    <th className="py-2 pl-2">Time</th>
                    <th className="py-2">Pipeline Target</th>
                    <th className="py-2">Protocol / Source</th>
                    <th className="py-2 text-right">Records</th>
                    <th className="py-2 text-right">Auto-Healed</th>
                    <th className="py-2 text-right">Latency</th>
                    <th className="py-2 pl-3">Status</th>
                    <th className="py-2 pr-2 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 font-mono text-xs">
                  {filteredBatches.map((batch) => {
                    const isSelected = selectedBatch?.id === batch.id;
                    return (
                      <tr
                        key={batch.id}
                        onClick={() => setSelectedBatch(batch)}
                        className={`group transition-colors cursor-pointer ${
                          isSelected ? 'bg-zinc-100/80 font-medium' : 'hover:bg-zinc-50'
                        }`}
                      >
                        <td className="py-2.5 pl-2 text-zinc-500 font-medium">{batch.time}</td>
                        <td className="py-2.5 font-sans font-semibold text-zinc-900">{batch.title}</td>
                        <td className="py-2.5">
                          <span className="font-mono text-[9px] uppercase px-1.5 py-0.2 rounded bg-zinc-100 text-zinc-700 border border-zinc-200">
                            {batch.source.type}
                          </span>
                        </td>
                        <td className="py-2.5 text-right tabular-nums text-zinc-700">{batch.totalRecords}</td>
                        <td className="py-2.5 text-right tabular-nums font-bold text-amber-700">+{batch.healedCount}</td>
                        <td className="py-2.5 text-right tabular-nums text-zinc-500">{batch.latencyMs}ms</td>
                        <td className="py-2.5 pl-3 font-sans font-medium">
                          <span
                            className={`inline-flex items-center gap-1 px-1.5 py-0.2 rounded text-[10px] font-semibold border ${
                              batch.status === 'Deterministic'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200/80'
                                : batch.status === 'Auto-Healed'
                                ? 'bg-amber-50 text-amber-800 border-amber-200/80'
                                : 'bg-purple-50 text-purple-800 border-purple-200/80'
                            }`}
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-current" />
                            {batch.status}
                          </span>
                        </td>
                        <td className="py-2.5 pr-2 text-right">
                          <span className="text-zinc-400 group-hover:text-zinc-900 text-[11px] font-medium flex items-center justify-end gap-0.5">
                            <span>Inspect</span>
                            <ChevronRight className="h-3 w-3" />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* ========================================================================= */}
          {/* SECTION 3: TARGET SCHEMAS & BLUEPRINTS */}
          {/* ========================================================================= */}
          <div className="rounded-xl bg-white border border-zinc-200 p-5 shadow-xs space-y-3.5">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div>
                <h3 className="font-bold text-xs text-zinc-950 font-display">Active Ingestion Schemas</h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Compiled PostgreSQL targets with deterministic Zod validation gates.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setEditingBlueprint(null);
                  setBuilderOpen(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-zinc-950 text-white hover:bg-black px-3.5 py-1.5 text-xs font-bold transition-all cursor-pointer"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Schema</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {blueprints.map((bp) => (
                <div
                  key={bp.id}
                  className="rounded-2xl border border-black/[0.05] bg-zinc-50/50 p-4 space-y-3 hover:bg-zinc-100/60 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-bold text-xs text-zinc-950 font-display">{bp.name}</div>
                      <div className="font-mono text-[10px] text-zinc-400 truncate">/{bp.slug}</div>
                    </div>
                    <span className="rounded-full bg-emerald-500/10 text-emerald-800 border border-emerald-500/20 px-2 py-0.5 font-mono text-[9px] font-bold">
                      {bp.schemaRules?.length || 0} Fields
                    </span>
                  </div>

                  <div className="text-[11px] font-mono text-zinc-600 bg-white p-2 rounded-xl border border-black/[0.04] space-y-1">
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Target Table:</span>
                      <span className="font-semibold text-zinc-800">{bp.sqlTableName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-400">Target Type:</span>
                      <span className="font-semibold text-zinc-800">{bp.targetType || 'ecommerce_catalog'}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <Link
                      href={`/intake/${bp.slug}`}
                      className="inline-flex items-center gap-1 text-xs font-bold text-zinc-950 hover:underline"
                    >
                      <span>Open Dropzone</span>
                      <ArrowUpRight className="h-3 w-3" />
                    </Link>

                    <button
                      type="button"
                      onClick={() => {
                        setEditingBlueprint(bp);
                        setBuilderOpen(true);
                      }}
                      className="p-1 rounded text-zinc-400 hover:text-zinc-900"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </main>

      {/* ========================================================================= */}
      {/* 3. ZERO-MODAL CONTEXTUAL SLIDE-OUT INSPECTOR DRAWER (Right Edge) */}
      {/* ========================================================================= */}
      {selectedBatch && (
        <ClientPortal lockScroll={false}>
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setSelectedBatch(null);
            }}
            className="fixed inset-0 z-40 bg-black/20 backdrop-blur-[2px] flex justify-end"
          >
            <div
              className="w-full max-w-lg h-screen bg-white border-l border-zinc-200 shadow-2xl flex flex-col justify-between p-6 overflow-y-auto animate-slide-left space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className="space-y-3 border-b border-black/[0.06] pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-xl bg-zinc-950 text-white flex items-center justify-center font-mono font-bold text-xs">
                      {selectedBatch.source.type.slice(0, 3).toUpperCase()}
                    </div>
                    <div>
                      <h3 className="font-bold text-base text-zinc-950 font-display">{selectedBatch.title}</h3>
                      <div className="font-mono text-[10px] text-zinc-400">{selectedBatch.source.protocol}</div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedBatch(null)}
                    className="p-1.5 rounded-full text-zinc-400 hover:text-zinc-900 hover:bg-black/5 cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* Telemetry Stats */}
                <div className="grid grid-cols-3 gap-2 text-center font-mono pt-1">
                  <div className="rounded-xl bg-zinc-50 p-2.5 border border-black/[0.04]">
                    <div className="text-[10px] text-zinc-400 uppercase">Records</div>
                    <div className="text-base font-bold text-zinc-900">{selectedBatch.totalRecords}</div>
                  </div>
                  <div className="rounded-xl bg-amber-500/10 p-2.5 border border-amber-500/20">
                    <div className="text-[10px] text-amber-700 uppercase">Healed Cells</div>
                    <div className="text-base font-bold text-amber-800">+{selectedBatch.healedCount}</div>
                  </div>
                  <div className="rounded-xl bg-emerald-500/10 p-2.5 border border-emerald-500/20">
                    <div className="text-[10px] text-emerald-700 uppercase">Latency</div>
                    <div className="text-base font-bold text-emerald-800">{selectedBatch.latencyMs}ms</div>
                  </div>
                </div>
              </div>

              {/* Active Healing Rule */}
              <div className="rounded-2xl bg-zinc-900 text-white p-3.5 space-y-1">
                <div className="text-[10px] font-mono text-zinc-400 uppercase flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                  Active Coercion Rule
                </div>
                <div className="text-xs text-zinc-200 font-medium">{selectedBatch.rule}</div>
              </div>

              {/* Side-by-Side Diff Comparison */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-zinc-900 font-display">Deterministic Transformation Diff</div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(selectedBatch.sampleHealed, null, 2));
                        setCopiedDiffType('json');
                        setTimeout(() => setCopiedDiffType(null), 2000);
                      }}
                      className="rounded-full bg-zinc-100 hover:bg-zinc-200 px-2.5 py-1 text-[10px] font-mono font-medium text-zinc-800 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      {copiedDiffType === 'json' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      <span>Copy JSON</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        const fields = Object.keys(selectedBatch.sampleHealed);
                        const values = Object.values(selectedBatch.sampleHealed).map((v) =>
                          typeof v === 'string' ? `'${v}'` : String(v)
                        );
                        const sql = `INSERT INTO ${selectedBatch.slug.replace(/-/g, '_')} (${fields.join(', ')})\nVALUES (${values.join(', ')});`;
                        navigator.clipboard.writeText(sql);
                        setCopiedDiffType('sql');
                        setTimeout(() => setCopiedDiffType(null), 2000);
                      }}
                      className="rounded-full bg-zinc-100 hover:bg-zinc-200 px-2.5 py-1 text-[10px] font-mono font-medium text-zinc-800 transition-colors flex items-center gap-1 cursor-pointer"
                    >
                      {copiedDiffType === 'sql' ? <Check className="h-3 w-3 text-emerald-600" /> : <Code2 className="h-3 w-3" />}
                      <span>Copy SQL</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-2xl bg-rose-50/70 border border-rose-200/60 p-3 space-y-1.5">
                    <div className="text-[10px] font-mono font-bold text-rose-700 uppercase flex items-center justify-between">
                      <span>Raw Untrusted</span>
                      <span className="text-[9px] text-rose-500">Dirty</span>
                    </div>
                    <div className="space-y-1 font-mono text-[10px]">
                      {Object.entries(selectedBatch.sampleRaw).map(([k, v]) => (
                        <div key={k} className="bg-white/90 rounded-lg p-1.5 border border-rose-100 flex items-center justify-between">
                          <span className="text-zinc-500 truncate mr-1">{k}:</span>
                          <span className="text-rose-700 font-semibold line-through truncate">{String(v)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl bg-emerald-50/70 border border-emerald-200/60 p-3 space-y-1.5">
                    <div className="text-[10px] font-mono font-bold text-emerald-700 uppercase flex items-center justify-between">
                      <span>Verified Output</span>
                      <span className="text-[9px] text-emerald-600">Valid</span>
                    </div>
                    <div className="space-y-1 font-mono text-[10px]">
                      {Object.entries(selectedBatch.sampleHealed).map(([k, v]) => (
                        <div key={k} className="bg-white/90 rounded-lg p-1.5 border border-emerald-100 flex items-center justify-between">
                          <span className="text-zinc-500 truncate mr-1">{k}:</span>
                          <span className="text-emerald-800 font-bold truncate">
                            {typeof v === 'object' ? JSON.stringify(v) : String(v)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-black/[0.06]">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedBatch(null);
                    runWorkbenchNormalization();
                  }}
                  className="rounded-full bg-zinc-100 hover:bg-zinc-200 px-4 py-2 text-xs font-semibold text-zinc-800 flex items-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Zap className="h-3 w-3 text-amber-500" />
                  <span>Re-Simulate</span>
                </button>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/intake/${selectedBatch.slug}`}
                    className="rounded-full bg-zinc-950 text-white px-5 py-2 text-xs font-bold hover:bg-black transition-transform active:scale-95 flex items-center gap-1.5 shadow-sm"
                  >
                    <span>Launch Dropzone</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </ClientPortal>
      )}

      {/* ========================================================================= */}
      {/* 4. MODALS & SPECIALIZED DRAWERS */}
      {/* ========================================================================= */}
      
      {/* Blueprint Builder Modal */}
      {builderOpen && (
        <BlueprintBuilderModal
          existingBlueprint={editingBlueprint}
          onClose={() => {
            setBuilderOpen(false);
            setEditingBlueprint(null);
          }}
          onSaved={() => {
            loadData();
          }}
        />
      )}

      {/* Interactive System Walkthrough */}
      <WalkthroughModal
        isOpen={walkthroughOpen}
        onClose={() => setWalkthroughOpen(false)}
        onRunSimulation={() => {
          setWalkthroughOpen(false);
          runWorkbenchNormalization();
        }}
        onOpenDropzone={() => {
          setWalkthroughOpen(false);
          router.push('/intake/shopify-d2c-catalog');
        }}
      />

      {/* Notifications Drawer */}
      {notificationsOpen && (
        <ClientPortal lockScroll={true}>
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setNotificationsOpen(false);
            }}
            className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm flex justify-end"
          >
            <div className="w-full max-w-md h-screen bg-white p-6 shadow-2xl flex flex-col justify-between overflow-y-auto">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
                  <div className="flex items-center gap-2 font-bold text-sm text-zinc-950 font-display">
                    <Bell className="h-4 w-4" />
                    <span>Engine Notifications</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNotificationsOpen(false)}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-950"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-2 text-xs">
                  <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200/60 space-y-1">
                    <div className="font-bold text-emerald-900">UTF-8 BOM Header Purged</div>
                    <p className="text-zinc-600 text-[11px]">Shopify catalog batch sanitized with 0 data loss.</p>
                  </div>
                  <div className="p-3 rounded-2xl bg-zinc-50 border border-black/[0.04] space-y-1">
                    <div className="font-bold text-zinc-900">SHA-256 Signature Match</div>
                    <p className="text-zinc-600 text-[11px]">Header hash a8f10b2c matched mapping memory.</p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNotificationsOpen(false)}
                className="w-full py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-950 rounded-xl bg-zinc-100"
              >
                Close
              </button>
            </div>
          </div>
        </ClientPortal>
      )}

      {/* Mapping Memory Management Drawer */}
      {activeNav === 'memory' && (
        <ClientPortal lockScroll={true}>
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setActiveNav('studio');
            }}
            className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm flex justify-end"
          >
            <div className="w-full max-w-lg h-screen bg-white p-6 shadow-2xl flex flex-col justify-between overflow-y-auto space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
                  <div className="flex items-center gap-2 font-bold text-sm text-zinc-950 font-display">
                    <Fingerprint className="h-4 w-4 text-emerald-600" />
                    <span>Mapping Memory Fingerprints</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveNav('studio')}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-950"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {memoryRecords.length === 0 ? (
                  <div className="text-center py-12 space-y-3">
                    <div className="h-12 w-12 rounded-2xl bg-zinc-100 text-zinc-400 flex items-center justify-center mx-auto">
                      <Fingerprint className="h-6 w-6" />
                    </div>
                    <div className="text-xs font-bold text-zinc-900">No Memory Fingerprints Cached Yet</div>
                    <p className="text-[11px] text-zinc-500 max-w-xs mx-auto">
                      Run an ingestion simulation or ingest a client spreadsheet to cache SHA-256 header matches.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2 text-xs">
                    {memoryRecords.map((rec) => (
                      <div key={rec.id} className="p-3 rounded-2xl bg-zinc-50 border border-black/[0.04] space-y-1">
                        <div className="flex justify-between font-mono text-[10px]">
                          <span className="font-bold text-zinc-900">{rec.blueprintSlug}</span>
                          <span className="text-zinc-400">{rec.hitCount} hits</span>
                        </div>
                        <div className="font-mono text-[10px] text-zinc-500 truncate">Hash: {rec.headerHash}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setActiveNav('studio')}
                className="w-full py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-950 rounded-xl bg-zinc-100"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </ClientPortal>
      )}

      {/* Deterministic Gate Inspection Drawer */}
      {activeNav === 'gate' && (
        <ClientPortal lockScroll={true}>
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setActiveNav('studio');
            }}
            className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm flex justify-end"
          >
            <div className="w-full max-w-lg h-screen bg-white p-6 shadow-2xl flex flex-col justify-between overflow-y-auto space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
                  <div className="flex items-center gap-2 font-bold text-sm text-zinc-950 font-display">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    <span>Deterministic Gate Infrastructure</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveNav('studio')}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-950"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-3">
                  {Object.entries(CLUSTERS).map(([key, cluster]) => (
                    <div key={key} className="rounded-2xl bg-zinc-50 border border-black/[0.04] p-4 space-y-2">
                      <div className="flex justify-between items-center text-xs">
                        <span className="font-bold text-zinc-950">{cluster.title}</span>
                        <span className="font-mono text-[10px] text-emerald-700 font-bold">{cluster.status}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-zinc-600">
                        <div>Workers: {cluster.telemetry.workers}</div>
                        <div>Memory: {cluster.telemetry.memory}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveNav('studio')}
                className="w-full py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-950 rounded-xl bg-zinc-100"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </ClientPortal>
      )}

      {/* Enterprise Settings Drawer */}
      {activeNav === 'settings' && (
        <ClientPortal lockScroll={true}>
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setActiveNav('studio');
            }}
            className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm flex justify-end"
          >
            <div className="w-full max-w-lg h-screen bg-white p-6 shadow-2xl flex flex-col justify-between overflow-y-auto space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
                  <div className="flex items-center gap-2 font-bold text-sm text-zinc-950 font-display">
                    <Settings className="h-4 w-4 text-zinc-500" />
                    <span>Enterprise Settings</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveNav('studio')}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-950"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-3 text-xs">
                  <div className="rounded-2xl bg-zinc-50 border border-black/[0.04] p-3.5 space-y-1">
                    <div className="font-bold text-zinc-900 flex items-center gap-2">
                      <Database className="h-4 w-4 text-zinc-500" />
                      PostgreSQL Target
                    </div>
                    <div className="font-mono text-[11px] text-zinc-600">
                      drizzle-orm / node-postgres (Auto-migrated)
                    </div>
                  </div>
                  <div className="rounded-2xl bg-zinc-50 border border-black/[0.04] p-3.5 space-y-1">
                    <div className="font-bold text-zinc-900 flex items-center gap-2">
                      <Layers className="h-4 w-4 text-zinc-500" />
                      Sharp Media Engine
                    </div>
                    <div className="font-mono text-[11px] text-zinc-600">
                      Aspect: 1:1 Square · Padding Color: #FFFFFF · Format: WebP (Lossless 85%)
                    </div>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveNav('studio')}
                className="w-full py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-950 rounded-xl bg-zinc-100"
              >
                Close Settings
              </button>
            </div>
          </div>
        </ClientPortal>
      )}

      {/* Target Dropzones List Drawer */}
      {activeNav === 'dropzones' && (
        <ClientPortal lockScroll={true}>
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setActiveNav('studio');
            }}
            className="fixed inset-0 z-[9999] bg-black/40 backdrop-blur-sm flex justify-end"
          >
            <div className="w-full max-w-lg h-screen bg-white p-6 shadow-2xl flex flex-col justify-between overflow-y-auto space-y-4">
              <div className="space-y-4">
                <div className="flex items-center justify-between border-b border-black/[0.06] pb-3">
                  <div className="flex items-center gap-2 font-bold text-sm text-zinc-950 font-display">
                    <UploadCloud className="h-4 w-4 text-zinc-600" />
                    <span>Client Ingestion Dropzones</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setActiveNav('studio')}
                    className="p-1 rounded text-zinc-400 hover:text-zinc-950"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="space-y-2.5">
                  {blueprints.map((bp) => (
                    <div
                      key={bp.id}
                      className="p-3.5 rounded-2xl bg-zinc-50 border border-black/[0.04] flex items-center justify-between"
                    >
                      <div>
                        <div className="font-bold text-xs text-zinc-900">{bp.name}</div>
                        <div className="font-mono text-[10px] text-zinc-400">/{bp.slug}</div>
                      </div>
                      <Link
                        href={`/intake/${bp.slug}`}
                        className="rounded-full bg-zinc-950 text-white px-3 py-1.5 text-xs font-bold hover:bg-black flex items-center gap-1"
                      >
                        <span>Launch</span>
                        <ArrowUpRight className="h-3 w-3" />
                      </Link>
                    </div>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveNav('studio')}
                className="w-full py-2 text-xs font-semibold text-zinc-600 hover:text-zinc-950 rounded-xl bg-zinc-100"
              >
                Close Drawer
              </button>
            </div>
          </div>
        </ClientPortal>
      )}

      {/* ========================================================================= */}
      {/* 5. RAYCAST-STYLE COMMAND PALETTE (Ctrl+K / Cmd+K) */}
      {/* ========================================================================= */}
      {commandPaletteOpen && (
        <ClientPortal lockScroll={true}>
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setCommandPaletteOpen(false);
            }}
            className="fixed inset-0 z-[10000] bg-black/40 backdrop-blur-[2px] flex items-start justify-center pt-20 px-4 animate-fade-in"
          >
            <div
              className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-zinc-200 overflow-hidden animate-pop-in"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Search Header */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-zinc-100">
                <Search className="h-4 w-4 text-zinc-400 shrink-0" />
                <input
                  autoFocus
                  type="text"
                  placeholder="Type a command or search actions..."
                  value={commandSearch}
                  onChange={(e) => setCommandSearch(e.target.value)}
                  className="w-full text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none bg-transparent"
                />
                <button
                  type="button"
                  onClick={() => setCommandPaletteOpen(false)}
                  className="rounded px-1.5 py-0.5 text-[10px] font-mono font-medium text-zinc-400 bg-zinc-100 hover:text-zinc-700"
                >
                  ESC
                </button>
              </div>

              {/* Action List */}
              <div className="max-h-80 overflow-y-auto p-2 space-y-1 text-xs">
                <div className="px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
                  Pipeline Operations
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCommandPaletteOpen(false);
                    runWorkbenchNormalization();
                  }}
                  className="w-full flex items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-zinc-100 cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5">
                    <Zap className="h-4 w-4 text-emerald-500" />
                    <span className="font-semibold text-zinc-900">Execute Deterministic Pipeline</span>
                  </div>
                  <span className="font-mono text-[10px] text-zinc-400 bg-zinc-50 border border-zinc-200 px-1.5 py-0.5 rounded">
                    {cmdShortcutD}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setWorkbenchViewMode('diff');
                    setCommandPaletteOpen(false);
                  }}
                  className="w-full flex items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-zinc-100 cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5">
                    <Sliders className="h-4 w-4 text-indigo-500" />
                    <span className="font-semibold text-zinc-900">Inspect Transformation Diff (Before vs After)</span>
                  </div>
                  <span className="font-mono text-[10px] text-zinc-400">View</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setWorkbenchViewMode('sql');
                    setCommandPaletteOpen(false);
                  }}
                  className="w-full flex items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-zinc-100 cursor-pointer group"
                >
                  <div className="flex items-center gap-2.5">
                    <Database className="h-4 w-4 text-emerald-600" />
                    <span className="font-semibold text-zinc-900">View PostgreSQL Compiled Ledger</span>
                  </div>
                  <span className="font-mono text-[10px] text-zinc-400">SQL</span>
                </button>

                <div className="px-2 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
                  Test Datasets
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setActiveSampleIndex(0);
                    setWorkbenchComplete(false);
                    setCommandPaletteOpen(false);
                  }}
                  className="w-full flex items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-zinc-100 cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span className="text-zinc-800">Shopify D2C Catalog (BOM &amp; Decimal Coercion)</span>
                  </div>
                  <span className="font-mono text-[9px] text-zinc-400">WEBHOOK</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveSampleIndex(1);
                    setWorkbenchComplete(false);
                    setCommandPaletteOpen(false);
                  }}
                  className="w-full flex items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-zinc-100 cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="h-2 w-2 rounded-full bg-blue-500" />
                    <span className="text-zinc-800">Automotive EDI Spec Sheet (Units &amp; Dates)</span>
                  </div>
                  <span className="font-mono text-[9px] text-zinc-400">SFTP</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setActiveSampleIndex(2);
                    setWorkbenchComplete(false);
                    setCommandPaletteOpen(false);
                  }}
                  className="w-full flex items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-zinc-100 cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="h-2 w-2 rounded-full bg-purple-500" />
                    <span className="text-zinc-800">Creative Agency Brief (Multi-Currency &amp; Array)</span>
                  </div>
                  <span className="font-mono text-[9px] text-zinc-400">DROPZONE</span>
                </button>

                <div className="px-2 pt-2 pb-1 text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-bold">
                  Navigation
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setCommandPaletteOpen(false);
                    setActiveNav('memory');
                  }}
                  className="w-full flex items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-zinc-100 cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Fingerprint className="h-4 w-4 text-zinc-500" />
                    <span className="text-zinc-800">Open Mapping Memory Drawer</span>
                  </div>
                  <span className="font-mono text-[9px] text-zinc-400">{memoryCount} cached</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setCommandPaletteOpen(false);
                    setWalkthroughOpen(true);
                  }}
                  className="w-full flex items-center justify-between rounded-xl px-3 py-2 text-left hover:bg-zinc-100 cursor-pointer"
                >
                  <div className="flex items-center gap-2.5">
                    <Sparkles className="h-4 w-4 text-indigo-500" />
                    <span className="text-zinc-800">Start System Tour</span>
                  </div>
                  <span className="font-mono text-[9px] text-zinc-400">Walkthrough</span>
                </button>
              </div>

              {/* Command Palette Footer */}
              <div className="px-4 py-2 bg-zinc-50 border-t border-zinc-100 flex items-center justify-between text-[10px] font-mono text-zinc-400">
                <div className="flex items-center gap-3">
                  <span><kbd className="bg-white border border-zinc-200 px-1 rounded">↵</kbd> select</span>
                  <span><kbd className="bg-white border border-zinc-200 px-1 rounded">ESC</kbd> dismiss</span>
                </div>
                <span>Vistar Command Deck</span>
              </div>
            </div>
          </div>
        </ClientPortal>
      )}

      {/* Toast Notification */}
      {toastNotification && (
        <ClientPortal lockScroll={false}>
          <div className="fixed top-5 right-5 z-[10000] animate-pop-in">
            <div className="rounded-2xl bg-zinc-950 text-white p-3.5 shadow-2xl border border-white/10 flex items-center gap-3 text-xs">
              <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              <div>
                <div className="font-bold">{toastNotification.blueprintName}</div>
                <div className="text-[11px] text-zinc-400 font-mono">{toastNotification.url}</div>
              </div>
            </div>
          </div>
        </ClientPortal>
      )}
    </div>
  );
}
