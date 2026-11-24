'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';

interface ClientPortalProps {
  children: React.ReactNode;
  lockScroll?: boolean;
}

/**
 * ClientPortal
 * 
 * Safely teleports overlays, modals, and drawers directly to document.body.
 * Eliminates CSS Containing Block issues caused by ancestor transform, filter,
 * or backdrop-filter styles on parent elements.
 * 
 * Automatically locks background page scroll when mounted.
 */
export function ClientPortal({ children, lockScroll = true }: ClientPortalProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    if (lockScroll) {
      const prevOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prevOverflow;
      };
    }
  }, [lockScroll]);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(children, document.body);
}
