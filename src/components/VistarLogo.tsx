'use client';

import React from 'react';

export interface VistarLogoProps {
  variant?: 'full' | 'icon' | 'wordmark' | 'tagline' | 'badge' | 'sidebar' | 'horizontal';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  inverted?: boolean; // True for dark background (white logo), false for light glass
  showTagline?: boolean;
  showDivider?: boolean;
  className?: string;
}

/**
 * Official Vistar Intelligence Brand Design System
 * 
 * Supports discrete modular components:
 * - `icon`: Standalone 4-pointed diamond star emblem (/vistar-emblem.svg)
 * - `wordmark`: Standalone stylized VISTAR typography (/vistar-wordmark.svg)
 * - `tagline`: Standalone "INTELLIGENCE FOR WHAT'S NEXT." (/vistar-tagline.svg)
 * - `full`: The full master horizontal corporate brand lockup (/vistar-logo.svg)
 * - `sidebar`: Premium responsive executive badge specifically proportioned for vertical sidebars
 * - `badge`: Glassmorphic squircle app icon container
 * - `horizontal`: Modular horizontal combination of emblem + divider + wordmark
 */
export function VistarLogo({
  variant = 'full',
  size = 'md',
  inverted = false,
  showTagline = true,
  showDivider = true,
  className = '',
}: VistarLogoProps) {
  // Height scale in px for high-density crisp rendering
  const heightMap = {
    xs: 18,
    sm: 24,
    md: 32,
    lg: 44,
    xl: 60,
  };

  const height = heightMap[size] || 32;
  const filterStyle = inverted ? 'invert(1) brightness(1.2)' : 'none';

  // 1. STANDALONE DIAMOND STAR EMBLEM (ICON ONLY)
  if (variant === 'icon') {
    return (
      <div
        className={`inline-flex items-center justify-center select-none shrink-0 ${className}`}
        style={{ width: `${height}px`, height: `${height}px` }}
        role="img"
        aria-label="VISTAR Emblem"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/vistar-emblem.svg"
          alt="Vistar Emblem"
          className="w-full h-full object-contain pointer-events-none transition-transform active:scale-95"
          style={{ filter: filterStyle }}
          loading="eager"
        />
      </div>
    );
  }

  // 2. STANDALONE VISTAR WORDMARK ONLY
  if (variant === 'wordmark') {
    return (
      <div
        className={`inline-flex items-center select-none shrink-0 ${className}`}
        style={{ height: `${height}px` }}
        role="img"
        aria-label="VISTAR Wordmark"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/vistar-wordmark.svg"
          alt="VISTAR"
          className="h-full w-auto object-contain pointer-events-none"
          style={{ filter: filterStyle }}
          loading="eager"
        />
      </div>
    );
  }

  // 3. STANDALONE TAGLINE ONLY
  if (variant === 'tagline') {
    return (
      <div
        className={`inline-flex items-center select-none shrink-0 ${className}`}
        style={{ height: `${Math.max(12, Math.round(height * 0.35))}px` }}
        role="img"
        aria-label="Intelligence For What's Next"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/vistar-tagline.svg"
          alt="Intelligence For What's Next"
          className="h-full w-auto object-contain pointer-events-none"
          style={{ filter: filterStyle }}
          loading="eager"
        />
      </div>
    );
  }

  // 4. PREMIER EXECUTIVE SIDEBAR BRAND LOCKUP
  // Solves the cramped horizontal logo problem by pairing the diamond star mark in an obsidian squircle with clean typography
  if (variant === 'sidebar') {
    return (
      <div className={`flex items-center gap-2.5 select-none ${className}`}>
        {/* Luxury Obsidian Badge containing Diamond Star Emblem */}
        <div className="relative flex h-9 w-9 items-center justify-center rounded-2xl bg-[#0D0D0E] text-white shadow-md border border-white/10 shrink-0 overflow-hidden group">
          <div className="absolute inset-0 bg-gradient-to-br from-white/15 to-transparent pointer-events-none" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/vistar-emblem.svg"
            alt="Vistar"
            className="w-5 h-5 object-contain filter invert brightness-200 pointer-events-none transition-transform group-hover:scale-110 duration-300"
          />
        </div>

        {/* Cohesive Typographic Hierarchy */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 leading-none">
            <span className="font-extrabold text-sm tracking-tight text-zinc-950 font-display">
              VISTAR
            </span>
            <span className="rounded-full bg-black/5 border border-black/5 px-1.5 py-0.5 font-mono text-[9px] font-semibold text-zinc-700">
              OS
            </span>
          </div>
          <div className="font-mono text-[9px] tracking-widest text-zinc-400 uppercase mt-1 truncate">
            Intake Engine
          </div>
        </div>
      </div>
    );
  }

  // 5. APP BADGE (ICON IN LUXURY GLASS SQUIRCLE)
  if (variant === 'badge') {
    return (
      <div
        className={`inline-flex items-center justify-center rounded-2xl bg-white/80 backdrop-blur-md border border-white shadow-xs p-2 select-none group cursor-pointer hover:bg-white hover:shadow-md transition-all ${className}`}
        style={{ width: `${height + 12}px`, height: `${height + 12}px` }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/vistar-emblem.svg"
          alt="Vistar App Badge"
          className="w-full h-full object-contain pointer-events-none group-hover:scale-105 transition-transform"
          style={{ filter: filterStyle }}
        />
      </div>
    );
  }

  // 6. MODULAR HORIZONTAL COMBINATION (Emblem + Divider + Wordmark)
  if (variant === 'horizontal') {
    return (
      <div className={`inline-flex items-center gap-2.5 select-none ${className}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/vistar-emblem.svg"
          alt="Vistar Emblem"
          style={{ height: `${height}px`, width: `${height}px`, filter: filterStyle }}
          className="object-contain shrink-0"
        />
        {showDivider && (
          <div
            className="w-[1.5px] bg-zinc-300 dark:bg-zinc-700 rounded-full"
            style={{ height: `${height * 0.75}px` }}
          />
        )}
        <div className="flex flex-col justify-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/vistar-wordmark.svg"
            alt="VISTAR"
            style={{ height: `${Math.round(height * 0.58)}px`, filter: filterStyle }}
            className="w-auto object-contain"
          />
          {showTagline && (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              src="/vistar-tagline.svg"
              alt="Intelligence For What's Next"
              style={{ height: `${Math.max(7, Math.round(height * 0.18))}px`, filter: filterStyle }}
              className="w-auto object-contain mt-0.5 opacity-75"
            />
          )}
        </div>
      </div>
    );
  }

  // 7. DEFAULT FULL HORIZONTAL CORPORATE BRAND LOCKUP
  return (
    <div
      className={`inline-flex items-center select-none transition-transform duration-200 active:scale-[0.99] ${className}`}
      role="img"
      aria-label="VISTAR — Intelligence for What's Next"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/vistar-logo.svg"
        alt="VISTAR Intelligence — For What's Next"
        height={height}
        className="h-auto w-auto max-h-full object-contain pointer-events-none"
        style={{
          height: `${height}px`,
          filter: filterStyle,
        }}
        loading="eager"
      />
    </div>
  );
}

/**
 * Standalone Diamond Star Emblem component
 * Ultra-crisp vector emblem with exact pixel dimensions and optional inverted fill
 */
export function VistarStarIcon({
  size = 20,
  className = '',
  inverted = false,
}: {
  size?: number;
  className?: string;
  inverted?: boolean;
}) {
  return (
    <div
      className={`inline-flex items-center justify-center select-none shrink-0 ${className}`}
      style={{ width: `${size}px`, height: `${size}px` }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/vistar-emblem.svg"
        alt="Vistar Star"
        className="w-full h-full object-contain pointer-events-none"
        style={{ filter: inverted ? 'invert(1) brightness(1.2)' : 'none' }}
        loading="eager"
      />
    </div>
  );
}
