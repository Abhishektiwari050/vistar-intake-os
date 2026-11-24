'use client';

import React from 'react';
import Link from 'next/link';
import { AlertCircle, RotateCcw, ArrowLeft } from 'lucide-react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto my-12 max-w-lg rounded-xl border border-rose-200 bg-white p-8 text-center shadow-card">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-rose-200 bg-rose-50 text-rose-600">
        <AlertCircle className="h-5 w-5" strokeWidth={2} />
      </div>
      <h2 className="mt-4 text-base font-bold text-slate-900">
        Unexpected Pipeline Exception
      </h2>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
        {error.message || 'An unexpected runtime error occurred while rendering this view.'}
      </p>
      <div className="mt-6 flex items-center justify-center gap-3">
        <button
          onClick={reset}
          className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Retry View
        </button>
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Studio Console
        </Link>
      </div>
    </div>
  );
}
