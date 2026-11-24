'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import type { Blueprint, IntakeSubmission } from '@/lib/types/intake';
import { SubmissionInspectorView } from '@/components/SubmissionInspectorView';

export default function SubmissionDetailPage() {
  const params = useParams<{ id: string }>();
  const [submission, setSubmission] = useState<IntakeSubmission | null>(null);
  const [blueprint, setBlueprint] = useState<Blueprint | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const resp = await fetch(`/api/submissions/${params.id}`);
        if (!resp.ok) {
          setError('Submission not found');
          return;
        }
        const data = await resp.json();
        setSubmission(data.submission);
        setBlueprint(data.blueprint);
      } catch {
        setError('Failed to load submission');
      }
    };
    if (params.id) load();
  }, [params.id]);

  if (error) {
    return (
      <div className="rounded-xl border border-rose-200 bg-white p-8 text-center">
        <p className="text-sm font-medium text-rose-700">{error}</p>
        <Link href="/" className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Studio Console
        </Link>
      </div>
    );
  }

  if (!submission || !blueprint) {
    return (
      <div className="space-y-4">
        <div className="h-32 animate-pulse rounded-xl border border-slate-200 bg-white" />
        <div className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Studio Console
        </Link>
      </div>

      <SubmissionInspectorView initialSubmission={submission} blueprint={blueprint} />
    </div>
  );
}
