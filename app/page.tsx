'use client';

import React from 'react';
import dynamic from 'next/dynamic';

const StudioConsole = dynamic(
  () => import('@/components/StudioConsole').then((mod) => mod.StudioConsole),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-screen flex bg-[#FAFAFA] overflow-hidden font-sans text-zinc-900 animate-pulse">
        {/* Sidebar Skeleton */}
        <aside className="w-64 h-full border-r border-zinc-200/80 bg-white p-4 flex flex-col justify-between shrink-0">
          <div className="space-y-6">
            <div className="flex items-center gap-2.5 px-2">
              <div className="w-7 h-7 rounded-lg bg-zinc-900/10" />
              <div className="h-5 w-24 bg-zinc-200 rounded" />
            </div>
            <div className="space-y-1.5 pt-2">
              <div className="h-9 w-full bg-zinc-900/10 rounded-lg" />
              <div className="h-9 w-full bg-zinc-100 rounded-lg" />
              <div className="h-9 w-full bg-zinc-100 rounded-lg" />
              <div className="h-9 w-full bg-zinc-100 rounded-lg" />
              <div className="h-9 w-full bg-zinc-100 rounded-lg" />
            </div>
          </div>
          <div className="h-12 w-full bg-zinc-100 rounded-lg border border-zinc-200/60" />
        </aside>

        {/* Main Content Skeleton */}
        <main className="flex-1 h-full flex flex-col bg-[#FAFAFA] overflow-hidden">
          {/* Top Command Bar Skeleton */}
          <header className="h-14 border-b border-zinc-200/80 bg-white px-6 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
              <div className="h-4 w-36 bg-zinc-200 rounded" />
              <div className="h-6 w-px bg-zinc-200" />
              <div className="h-6 w-48 bg-zinc-100 rounded-md" />
            </div>
            <div className="flex items-center gap-3">
              <div className="h-8 w-64 bg-zinc-100 rounded-lg" />
              <div className="h-8 w-28 bg-zinc-900/10 rounded-lg" />
            </div>
          </header>

          {/* Workbench Body Skeleton */}
          <div className="flex-1 p-6 space-y-6 overflow-hidden">
            <div className="h-10 w-full bg-zinc-100 rounded-lg border border-zinc-200/60" />
            <div className="grid grid-cols-12 gap-5 h-72">
              <div className="col-span-4 bg-white rounded-xl border border-zinc-200/80 p-4 space-y-3">
                <div className="h-4 w-28 bg-zinc-200 rounded" />
                <div className="h-48 bg-zinc-50 rounded border border-zinc-100" />
              </div>
              <div className="col-span-4 bg-white rounded-xl border border-zinc-200/80 p-4 space-y-3">
                <div className="h-4 w-32 bg-zinc-200 rounded" />
                <div className="h-48 bg-zinc-50 rounded border border-zinc-100" />
              </div>
              <div className="col-span-4 bg-white rounded-xl border border-zinc-200/80 p-4 space-y-3">
                <div className="h-4 w-28 bg-zinc-200 rounded" />
                <div className="h-48 bg-zinc-50 rounded border border-zinc-100" />
              </div>
            </div>
            <div className="h-64 bg-white rounded-xl border border-zinc-200/80 p-4" />
          </div>
        </main>
      </div>
    ),
  }
);

export default function HomePage() {
  return <StudioConsole />;
}
