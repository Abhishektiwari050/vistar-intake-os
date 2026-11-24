'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Database,
  FileSpreadsheet,
  FileText,
  FolderArchive,
  Copy,
  Check,
  X,
  Download,
  FileCode2,
  Send,
  MailCheck,
  Loader2,
} from 'lucide-react';
import type { Blueprint, IntakeSubmission } from '@/lib/types/intake';
import { generateClientFollowUp } from '@/lib/export/chaser';

interface ExportToolbarProps {
  submission: IntakeSubmission;
  blueprint: Blueprint;
  onWebhookDispatched?: () => Promise<void>;
}

export function ExportToolbar({
  submission,
  blueprint,
  onWebhookDispatched,
}: ExportToolbarProps) {
  const [onlyVerified, setOnlyVerified] = useState(true);
  const [previewFormat, setPreviewFormat] = useState<'sql' | 'md' | 'json' | 'csv' | null>(null);
  const [previewContent, setPreviewContent] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(false);

  const [chaserOpen, setChaserOpen] = useState(false);
  const [chaserTab, setChaserTab] = useState<'whatsapp' | 'email' | 'markdown'>('whatsapp');
  const [timeframeHours, setTimeframeHours] = useState<number>(48);

  const [webhookOpen, setWebhookOpen] = useState(false);
  const [targetUrl, setTargetUrl] = useState('');
  const [dispatching, setDispatching] = useState(false);
  const [webhookResult, setWebhookResult] = useState<{
    delivered: boolean;
    statusCode: number;
    latencyMs: number;
    signatureHeader: string;
    responseBody: string;
  } | null>(null);

  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setPreviewFormat(null);
        setChaserOpen(false);
        setWebhookOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const verifiedCount = submission.rows.filter((r) => r.isRowVerified).length;
  const totalCount = submission.rows.length;

  const chaserReport = useMemo(() => {
    const link =
      typeof window !== 'undefined'
        ? `${window.location.origin}/submissions/${submission.id}`
        : `/submissions/${submission.id}`;
    return generateClientFollowUp(submission, blueprint, link, { timeframeHours });
  }, [submission, blueprint, timeframeHours]);

  const openPreview = async (fmt: 'sql' | 'md' | 'json' | 'csv') => {
    setPreviewFormat(fmt);
    setLoadingPreview(true);
    try {
      const resp = await fetch(
        `/api/submissions/${submission.id}/export?format=${fmt}&onlyVerified=${onlyVerified}`
      );
      const text = await resp.text();
      setPreviewContent(text);
    } finally {
      setLoadingPreview(false);
    }
  };

  const handleCopyText = async (textToCopy: string) => {
    await navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    copyTimerRef.current = setTimeout(() => setCopied(false), 2000);
  };

  const downloadFile = (fmt: 'sql' | 'md' | 'xlsx' | 'csv' | 'json' | 'zip') => {
    window.open(
      `/api/submissions/${submission.id}/export?format=${fmt}&onlyVerified=${onlyVerified}`,
      '_blank'
    );
  };

  const handleDispatchWebhook = async (dryRunSandbox: boolean) => {
    setDispatching(true);
    try {
      const resp = await fetch('/api/webhooks/dispatch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submissionId: submission.id,
          targetUrl: dryRunSandbox ? undefined : targetUrl.trim(),
          dryRunSandbox,
          onlyVerified,
        }),
      });
      const data = await resp.json();
      setWebhookResult(data);
      if (onWebhookDispatched) await onWebhookDispatched();
    } finally {
      setDispatching(false);
    }
  };

  return (
    <>
      <div className="glass-panel rounded-2xl p-5 space-y-3.5 transition-all">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2.5">
              <h3 className="text-sm font-semibold text-zinc-950">
                Egress &amp; Client Resolution
              </h3>
              <span className="rounded-full border border-zinc-200/80 bg-white/80 px-2.5 py-0.5 font-mono text-[10px] font-medium text-zinc-700 shadow-sm">
                {verifiedCount}/{totalCount} Items Validated
              </span>
            </div>
            <p className="text-xs text-zinc-500">
              Download normalized datasets or dispatch signed webhooks.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-zinc-200/60 bg-white/60 px-3 py-1.5 text-xs font-medium text-zinc-700 select-none hover:bg-white transition-all shadow-sm">
              <input
                type="checkbox"
                checked={onlyVerified}
                onChange={(e) => setOnlyVerified(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
              />
              Verified Only ({verifiedCount})
            </label>

            {chaserReport.missingItems.length > 0 && (
              <button
                type="button"
                onClick={() => setChaserOpen(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3.5 py-1.5 text-xs font-medium text-amber-900 shadow-sm hover:bg-amber-500/15 transition-all"
              >
                <MailCheck className="h-3.5 w-3.5 text-amber-600" />
                Request Missing Info ({chaserReport.missingItems.length})
              </button>
            )}

            <button
              type="button"
              onClick={() => setWebhookOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-950 px-4 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-zinc-800 transition-all active:scale-[0.98]"
            >
              <Send className="h-3.5 w-3.5 text-zinc-400" />
              Dispatch Webhook
            </button>
          </div>
        </div>

        {/* Clean Monochromatic Export Group */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-200/50 pt-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[10px] font-mono text-zinc-400 mr-1 uppercase tracking-wider">Export:</span>
            <button
              type="button"
              onClick={() => openPreview('sql')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white/70 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-white transition-all shadow-sm"
            >
              <Database className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.5} />
              SQL Script
            </button>
            <button
              type="button"
              onClick={() => openPreview('csv')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white/70 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-white transition-all shadow-sm"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.5} />
              CSV
            </button>
            <button
              type="button"
              onClick={() => downloadFile('xlsx')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white/70 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-white transition-all shadow-sm"
            >
              <FileSpreadsheet className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.5} />
              Excel .xlsx
            </button>
            <button
              type="button"
              onClick={() => openPreview('json')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white/70 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-white transition-all shadow-sm"
            >
              <FileCode2 className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.5} />
              JSON
            </button>
            <button
              type="button"
              onClick={() => openPreview('md')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white/70 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-white transition-all shadow-sm"
            >
              <FileText className="h-3.5 w-3.5 text-zinc-500" strokeWidth={1.5} />
              Markdown
            </button>
          </div>

          <button
            type="button"
            onClick={() => downloadFile('zip')}
            disabled={submission.assets.filter((a) => !a.isDuplicate && !a.error).length === 0}
            className="inline-flex items-center gap-1.5 rounded-xl border border-zinc-200/80 bg-white px-3.5 py-1.5 text-xs font-semibold text-zinc-800 hover:bg-zinc-50 transition-all shadow-sm disabled:opacity-40 disabled:pointer-events-none active:scale-[0.98]"
          >
            <FolderArchive className="h-3.5 w-3.5 text-zinc-600" strokeWidth={1.5} />
            Pack Assets .zip
          </button>
        </div>
      </div>

      {/* Format Code Preview Modal */}
      {previewFormat && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setPreviewFormat(null);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
        >
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl border border-slate-200 bg-white shadow-modal overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
              <span className="font-mono text-xs font-semibold uppercase tracking-wider text-slate-800">
                {previewFormat.toUpperCase()} Compiled Output Preview
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopyText(previewContent)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      Copy
                    </>
                  )}
                </button>
                <button
                  onClick={() => downloadFile(previewFormat)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-700"
                >
                  <Download className="h-3.5 w-3.5" />
                  Download
                </button>
                <button
                  onClick={() => setPreviewFormat(null)}
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="overflow-auto bg-slate-50 p-4">
              {loadingPreview ? (
                <div className="py-12 text-center font-mono text-xs text-slate-500">
                  Compiling output...
                </div>
              ) : (
                <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed text-slate-800">
                  {previewContent}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Missing-Item Client Follow-Up Modal */}
      {chaserOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setChaserOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
        >
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-slate-200 bg-white shadow-modal overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Client Follow-Up Generator ({chaserReport.completionPercent}% Verified)
                </h3>
                <p className="text-xs text-slate-500">
                  Auto-compiled checklist of {chaserReport.missingItems.length} item(s) requiring client resolution.
                </p>
              </div>
              <button
                onClick={() => setChaserOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-200/70"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              {/* Timeframe Selector & Target Deadline Banner */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex items-center gap-2">
                  <label htmlFor="chaser-timeframe" className="font-mono text-xs font-semibold text-slate-700">
                    Resolution Timeframe:
                  </label>
                  <select
                    id="chaser-timeframe"
                    value={timeframeHours}
                    onChange={(e) => setTimeframeHours(Number(e.target.value))}
                    className="rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <option value={24}>24 Hours (Fast Turnaround)</option>
                    <option value={48}>48 Hours (Standard)</option>
                    <option value={72}>72 Hours (Extended)</option>
                  </select>
                </div>
                {chaserReport.deadlineText && (
                  <span className="font-mono text-[11px] font-medium text-slate-500">
                    Target: <span className="font-semibold text-indigo-700">{chaserReport.deadlineText}</span>
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                {(['whatsapp', 'email', 'markdown'] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setChaserTab(t)}
                    className={`rounded-md px-3 py-1.5 font-mono text-xs font-semibold capitalize ${
                      chaserTab === t
                        ? 'bg-indigo-600 text-white'
                        : 'border border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {t}
                  </button>
                ))}
                <button
                  onClick={() =>
                    handleCopyText(
                      chaserTab === 'whatsapp'
                        ? chaserReport.whatsappText
                        : chaserTab === 'email'
                        ? chaserReport.emailText
                        : chaserReport.markdownText
                    )
                  }
                  className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy Template'}
                </button>
              </div>

              <pre className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed text-slate-800">
                {chaserTab === 'whatsapp'
                  ? chaserReport.whatsappText
                  : chaserTab === 'email'
                  ? chaserReport.emailText
                  : chaserReport.markdownText}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Webhook Delivery & HMAC Tester Modal */}
      {webhookOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setWebhookOpen(false);
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4"
        >
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl border border-slate-200 bg-white shadow-modal overflow-hidden">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-3.5">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Signed Webhook Dispatch (`X-Vistar-Signature` HMAC-SHA256)
                </h3>
                <p className="text-xs text-slate-500">
                  Push verified JSON records directly to Zapier, Make, or your internal REST API.
                </p>
              </div>
              <button
                onClick={() => setWebhookOpen(false)}
                className="rounded-md p-1 text-slate-400 hover:bg-slate-200/70"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto">
              <div>
                <label className="block font-mono text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Destination Webhook URL
                </label>
                <div className="mt-1.5 flex gap-2">
                  <input
                    type="url"
                    value={targetUrl}
                    onChange={(e) => setTargetUrl(e.target.value)}
                    placeholder="https://webhook.site/your-endpoint"
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 font-mono text-xs text-slate-900 focus:border-indigo-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    disabled={dispatching || !targetUrl.trim()}
                    onClick={() => handleDispatchWebhook(false)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {dispatching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    Send Live POST
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3.5 py-2.5">
                <span className="text-xs text-slate-600">
                  No external endpoint ready? Verify HMAC signing and payload structure locally:
                </span>
                <button
                  type="button"
                  disabled={dispatching}
                  onClick={() => handleDispatchWebhook(true)}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 font-mono text-xs font-semibold text-slate-800 hover:bg-slate-100"
                >
                  Run HMAC Sandbox Test
                </button>
              </div>

              {webhookResult && (
                <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      className={`rounded border px-2 py-0.5 font-mono text-xs font-bold ${
                        webhookResult.delivered
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-rose-200 bg-rose-50 text-rose-700'
                      }`}
                    >
                      HTTP {webhookResult.statusCode} · {webhookResult.latencyMs}ms
                    </span>
                    <span className="font-mono text-[10px] text-slate-500 truncate max-w-xs">
                      Sig: {webhookResult.signatureHeader}
                    </span>
                  </div>
                  <pre className="max-h-48 overflow-auto rounded border border-slate-200 bg-white p-3 font-mono text-[11px] text-slate-800">
                    {webhookResult.responseBody || 'Empty response body'}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
