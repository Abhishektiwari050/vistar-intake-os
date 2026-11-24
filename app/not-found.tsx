import React from 'react';
import Link from 'next/link';
import { ArrowLeft, SearchX } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="mx-auto my-12 max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-card">
      <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-600">
        <SearchX className="h-5 w-5" strokeWidth={1.75} />
      </div>
      <h2 className="mt-4 text-base font-bold text-slate-900">Resource Not Found</h2>
      <p className="mt-1.5 text-xs text-slate-600">
        The requested Blueprint, Magic Link, or Intake Submission does not exist.
      </p>
      <Link
        href="/"
        className="mt-6 inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Return to Studio Console
      </Link>
    </div>
  );
}
