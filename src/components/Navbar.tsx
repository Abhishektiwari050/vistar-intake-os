'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowUpRight, ShieldCheck } from 'lucide-react';
import { VistarLogo } from './VistarLogo';

export function Navbar() {
  const pathname = usePathname();
  const isIntake = pathname?.startsWith('/intake');
  const isSubmission = pathname?.startsWith('/submissions');
  const isHome = pathname === '/';

  // For the immersive full-page studio dashboard, the integrated sidebar & header own navigation
  if (isHome) {
    return null;
  }

  return (
    <header className="sticky top-0 z-40 glass-nav transition-all">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-5">
          <Link href="/" className="flex items-center gap-2 group transition-transform active:scale-[0.98]">
            <VistarLogo variant="horizontal" size="sm" showTagline={false} showDivider={true} />
            <span className="sr-only">VISTAR INTAKE OS</span>
          </Link>

          <nav className="flex items-center gap-1 border-l border-zinc-200/60 pl-4 text-xs font-medium">
            <Link
              href="/"
              className={`rounded-lg px-3 py-1.5 transition-all duration-200 ${
                !isIntake && !isSubmission
                  ? 'bg-zinc-900/5 text-zinc-950 font-semibold shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)]'
                  : 'text-zinc-600 hover:text-zinc-950 hover:bg-white/60'
              }`}
            >
              Studio Console
            </Link>
            <Link
              href="/intake/shopify-d2c-catalog"
              className={`rounded-lg px-3 py-1.5 transition-all duration-200 inline-flex items-center gap-1 ${
                isIntake
                  ? 'bg-zinc-900/5 text-zinc-950 font-semibold shadow-[inset_0_1px_1px_rgba(255,255,255,0.6)]'
                  : 'text-zinc-600 hover:text-zinc-950 hover:bg-white/60'
              }`}
            >
              Client Dropzone
              <ArrowUpRight className="h-3 w-3 text-zinc-400" strokeWidth={1.75} />
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[11px] font-mono text-emerald-800 shadow-[inset_0_1px_1px_rgba(255,255,255,0.7)]">
            <span className="relative flex h-1.5 w-1.5">
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500 animate-pulse-subtle" />
            </span>
            <span>Engine Ready</span>
          </div>

          <div className="hidden lg:flex items-center gap-1.5 rounded-lg border border-zinc-200/60 bg-white/50 px-2.5 py-1 text-zinc-600 shadow-sm">
            <ShieldCheck className="h-3.5 w-3.5 text-zinc-900" strokeWidth={1.5} />
            <span className="font-mono text-[10px] tracking-wide">Deterministic Zod Gate</span>
          </div>
        </div>
      </div>
    </header>
  );
}
