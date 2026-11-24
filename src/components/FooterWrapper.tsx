'use client';

import React from 'react';
import { usePathname } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';

export function FooterWrapper() {
  const pathname = usePathname();
  if (pathname === '/') return null; // Clean, full-page immersive studio on home dashboard

  return (
    <footer className="mt-auto border-t border-black/[0.04] bg-white/40 backdrop-blur-md py-5">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 flex flex-wrap items-center justify-between gap-4">
        <span className="font-mono text-[11px] text-zinc-500">
          Vistar Intake OS · Enterprise Client Asset Healing &amp; Schema Normalization
        </span>
        <div className="inline-flex items-center gap-1.5 rounded-full border border-black/[0.06] bg-white/70 px-3 py-1 font-mono text-[11px] font-medium text-zinc-700 shadow-xs">
          <ShieldCheck className="h-3.5 w-3.5 text-zinc-900" strokeWidth={1.75} />
          <span>Normalized &amp; Verified by Vistar Intake OS</span>
        </div>
      </div>
    </footer>
  );
}
