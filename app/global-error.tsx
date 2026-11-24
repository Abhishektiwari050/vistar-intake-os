'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, RotateCcw, RefreshCw, Home, ShieldAlert } from 'lucide-react';
import { VistarLogo } from '@/components/VistarLogo';

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  const isDev = process.env.NODE_ENV !== 'production';

  const handleHardReload = () => {
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  return (
    <html lang="en">
      <head>
        <title>Vistar Intake OS — System Exception</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      </head>
      <body className="min-h-screen bg-[#FAFAFA] text-[#0A0A0A] font-sans antialiased flex flex-col justify-between selection:bg-zinc-200">
        {/* Minimalist Alabaster Header */}
        <header className="border-b border-zinc-200/80 bg-white/90 backdrop-blur-sm px-6 py-4">
          <div className="mx-auto max-w-5xl flex items-center justify-between">
            <VistarLogo size="sm" showTagline={true} />
            <div className="flex items-center gap-2 px-2.5 py-1 rounded-full border border-rose-200 bg-rose-50 text-[11px] font-mono font-medium text-rose-700">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
              <span>Root Boundary Intercept</span>
            </div>
          </div>
        </header>

        {/* Central Error Card */}
        <main className="flex-1 flex items-center justify-center p-6 sm:p-12">
          <div className="w-full max-w-xl rounded-2xl border border-zinc-200 bg-white p-8 sm:p-10 shadow-[0_4px_20px_-4px_rgba(0,0,0,0.05)] text-center">
            {/* Warning Icon Emblem */}
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-rose-200 bg-rose-50 text-rose-600 shadow-sm">
              <AlertTriangle className="h-7 w-7" strokeWidth={1.8} />
            </div>

            {/* Title & Description */}
            <h1 className="mt-6 text-xl sm:text-2xl font-bold tracking-tight text-[#0A0A0A]">
              Root Application Exception
            </h1>
            <p className="mt-2 text-xs sm:text-sm text-zinc-600 leading-relaxed">
              A fatal rendering exception occurred at the root layout boundary. The application runtime has safely halted to protect pipeline state integrity.
            </p>

            {/* Error Message Box */}
            <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50/80 p-4 text-left">
              <div className="flex items-start gap-2.5">
                <ShieldAlert className="h-4 w-4 text-rose-500 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="font-mono text-xs font-semibold text-zinc-900 break-words">
                    {error.message || 'An unexpected runtime error occurred.'}
                  </p>
                  {error.digest && (
                    <div className="mt-2 flex items-center gap-1.5 font-mono text-[11px] text-zinc-500">
                      <span className="font-semibold text-zinc-700">Digest:</span>
                      <code className="rounded bg-zinc-200/60 px-1.5 py-0.5 text-zinc-800">
                        {error.digest}
                      </code>
                    </div>
                  )}
                </div>
              </div>

              {/* Dev Stack Trace */}
              {isDev && error.stack && (
                <details className="mt-3 border-t border-zinc-200/80 pt-2 text-[11px] text-zinc-500 font-mono">
                  <summary className="cursor-pointer text-zinc-700 hover:text-zinc-900 select-none">
                    View Call Stack
                  </summary>
                  <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-zinc-900 p-3 text-zinc-100 text-[10px]">
                    {error.stack}
                  </pre>
                </details>
              )}
            </div>

            {/* Action Buttons */}
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <button
                type="button"
                onClick={reset}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl bg-[#0A0A0A] px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 transition-colors"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>Try Again</span>
              </button>

              <button
                type="button"
                onClick={handleHardReload}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-300 bg-white px-5 py-2.5 text-xs font-medium text-zinc-800 hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-400 transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5 text-zinc-500" />
                <span>Reload Page</span>
              </button>

              <Link
                href="/"
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-zinc-100 px-5 py-2.5 text-xs font-medium text-zinc-700 hover:bg-zinc-200/80 focus:outline-none focus:ring-2 focus:ring-zinc-400 transition-colors"
              >
                <Home className="h-3.5 w-3.5 text-zinc-500" />
                <span>Studio Console</span>
              </Link>
            </div>
          </div>
        </main>

        {/* Minimalist Footer */}
        <footer className="border-t border-zinc-200/80 bg-white/70 py-4 text-center">
          <p className="font-mono text-[11px] text-zinc-500">
            Vistar Intake OS · Enterprise Client Asset Healing &amp; Schema Normalization
          </p>
        </footer>
      </body>
    </html>
  );
}
