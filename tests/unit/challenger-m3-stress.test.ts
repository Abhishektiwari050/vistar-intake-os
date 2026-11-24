import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GET as getHealth } from '@app/api/health/route';
import GlobalError from '@app/global-error';
import { resetTestDbSingleton } from '@/lib/db/client';

describe('Challenger M3 Empirical Verification & Adversarial Stress Harness', () => {
  beforeEach(() => {
    resetTestDbSingleton();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ===========================================================================
  // 1. Adversarial Challenge: GET /api/health Endpoint
  // ===========================================================================
  describe('GET /api/health Endpoint Empirical Challenges', () => {
    it('accurately measures realistic non-negative DB query latency', async () => {
      const response = await getHealth();
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.database).toBeDefined();
      expect(data.database.status).toBe('connected');
      expect(typeof data.database.latencyMs).toBe('number');
      expect(data.database.latencyMs).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(data.database.latencyMs)).toBe(true);
    });

    it('dynamically reflects induced database query delay in latencyMs', async () => {
      const dbClientModule = await import('@/lib/db/client');
      const originalDb = await dbClientModule.getDb();

      // Mock execute with a controlled 40ms artificial sleep
      const delayedExecute = async () => {
        await new Promise((resolve) => setTimeout(resolve, 45));
        return [{ ping: 1 }];
      };

      vi.spyOn(dbClientModule, 'getDb').mockResolvedValueOnce({
        ...originalDb,
        execute: delayedExecute as any,
      } as any);

      const response = await getHealth();
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.database.status).toBe('connected');
      // Latency must reflect at least 35ms of induced delay
      expect(data.database.latencyMs).toBeGreaterThanOrEqual(35);
    });

    it('samples real Node process memory statistics within bounded variance', async () => {
      const memBefore = process.memoryUsage();
      const response = await getHealth();
      const data = await response.json();
      const memAfter = process.memoryUsage();

      expect(typeof data.memory.heapUsedMb).toBe('number');
      expect(typeof data.memory.rssMb).toBe('number');
      expect(data.memory.heapUsedMb).toBeGreaterThan(0);
      expect(data.memory.rssMb).toBeGreaterThan(0);

      // RSS should always be greater than or equal to heapUsed in Node.js
      expect(data.memory.rssMb).toBeGreaterThanOrEqual(data.memory.heapUsedMb);

      // Convert memory to MB for bounds check
      const minHeapMb = (Math.min(memBefore.heapUsed, memAfter.heapUsed) / (1024 * 1024)) * 0.7;
      const maxHeapMb = (Math.max(memBefore.heapUsed, memAfter.heapUsed) / (1024 * 1024)) * 1.3;
      expect(data.memory.heapUsedMb).toBeGreaterThanOrEqual(minHeapMb);
      expect(data.memory.heapUsedMb).toBeLessThanOrEqual(maxHeapMb);
    });

    it('reports valid positive uptime and RFC 3339 / ISO-8601 timestamp in healthy state', async () => {
      const startMs = Date.now();
      const response = await getHealth();
      const data = await response.json();
      const endMs = Date.now();

      expect(typeof data.uptimeSeconds).toBe('number');
      expect(data.uptimeSeconds).toBeGreaterThan(0);

      expect(typeof data.timestamp).toBe('string');
      // Must match strict ISO-8601 UTC format
      expect(data.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

      const parsedMs = Date.parse(data.timestamp);
      expect(Number.isNaN(parsedMs)).toBe(false);
      // Timestamp must be within the execution window (+- 3000ms)
      expect(parsedMs).toBeGreaterThanOrEqual(startMs - 3000);
      expect(parsedMs).toBeLessThanOrEqual(endMs + 3000);
      expect(data.version).toBe('1.0.0');
    });

    it('returns HTTP 503 degraded when getDb() rejects with connection error', async () => {
      const dbClientModule = await import('@/lib/db/client');
      vi.spyOn(dbClientModule, 'getDb').mockRejectedValueOnce(
        new Error('PostgreSQL connection refused: ECONNREFUSED 127.0.0.1:5432')
      );

      const response = await getHealth();
      expect(response.status).toBe(503);
      expect(response.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate');

      const data = await response.json();
      expect(data.status).toBe('degraded');
      expect(data.database.status).toBe('disconnected');
      expect(data.database.latencyMs).toBe(-1);
      expect(data.database.error).toContain('ECONNREFUSED');
      expect(data.version).toBe('1.0.0');
      expect(typeof data.uptimeSeconds).toBe('number');
      expect(typeof data.memory.heapUsedMb).toBe('number');
    });

    it('returns HTTP 503 degraded when database execute() rejects with SQL query error', async () => {
      const dbClientModule = await import('@/lib/db/client');
      const originalDb = await dbClientModule.getDb();

      vi.spyOn(dbClientModule, 'getDb').mockResolvedValueOnce({
        ...originalDb,
        execute: vi.fn().mockRejectedValueOnce(new Error('canceling statement due to statement timeout')),
      } as any);

      const response = await getHealth();
      expect(response.status).toBe(503);

      const data = await response.json();
      expect(data.status).toBe('degraded');
      expect(data.database.status).toBe('disconnected');
      expect(data.database.latencyMs).toBe(-1);
      expect(data.database.error).toBe('canceling statement due to statement timeout');
    });

    it('gracefully handles non-Error object exceptions in catch block without crashing', async () => {
      const dbClientModule = await import('@/lib/db/client');
      vi.spyOn(dbClientModule, 'getDb').mockRejectedValueOnce('Critical fatal socket abort string');

      const response = await getHealth();
      expect(response.status).toBe(503);

      const data = await response.json();
      expect(data.status).toBe('degraded');
      expect(data.database.status).toBe('disconnected');
      expect(data.database.latencyMs).toBe(-1);
      expect(data.database.error).toBe('Database ping failed');
    });

    it('guarantees dynamic, non-cached sequential responses and anti-caching headers', async () => {
      const responses: Array<{ status: number; timestamp: string; uptime: number; cacheControl: string | null }> = [];

      for (let i = 0; i < 3; i++) {
        const res = await getHealth();
        expect(res.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate');
        const json = await res.json();
        responses.push({
          status: res.status,
          timestamp: json.timestamp,
          uptime: json.uptimeSeconds,
          cacheControl: res.headers.get('Cache-Control'),
        });
        if (i < 2) {
          await new Promise((r) => setTimeout(r, 20));
        }
      }

      expect(responses).toHaveLength(3);
      // All responses healthy
      expect(responses.every((r) => r.status === 200)).toBe(true);
      // All headers present
      expect(responses.every((r) => r.cacheControl === 'no-store, no-cache, must-revalidate')).toBe(true);
      // Timestamps must not be identical across spaced requests
      const timestamps = responses.map((r) => r.timestamp);
      expect(new Set(timestamps).size).toBeGreaterThanOrEqual(2);
      // Uptime must be non-decreasing
      expect(responses[2].uptime).toBeGreaterThanOrEqual(responses[0].uptime);
    });
  });

  // ===========================================================================
  // 2. Adversarial Challenge: app/global-error.tsx Error Boundary
  // ===========================================================================
  describe('app/global-error.tsx Component & Recovery Contract', () => {
    it('exports a default functional component conforming to Next.js App Router boundary spec', () => {
      expect(GlobalError).toBeDefined();
      expect(typeof GlobalError).toBe('function');
    });

    it('renders root <html> and <body> elements required by Next.js root error boundaries', () => {
      const testError = new Error('Simulated root layout crash');
      const resetMock = vi.fn();

      const html = renderToStaticMarkup(
        React.createElement(GlobalError, { error: testError, reset: resetMock })
      );

      // Next.js App Router specification requires global-error to render its own <html> and <body>
      expect(html).toContain('<html lang="en">');
      expect(html).toContain('<head>');
      expect(html).toContain('<title>Vistar Intake OS — System Exception</title>');
      expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1.0"/>');
      expect(html).toContain('<body');
      expect(html).toContain('</html>');
      expect(html).toContain('</body>');
    });

    it('renders Vistar architectural brand identity and styling on Alabaster canvas', () => {
      const testError = new Error('Simulated failure');
      const resetMock = vi.fn();

      const html = renderToStaticMarkup(
        React.createElement(GlobalError, { error: testError, reset: resetMock })
      );

      // Brand Wordmark & Tagline
      expect(html).toContain('VISTAR');
      expect(html).toContain('INTELLIGENCE FOR WHAT&#x27;S NEXT');
      // Root Boundary Intercept pill
      expect(html).toContain('Root Boundary Intercept');
      expect(html).toContain('animate-pulse');
      // Alabaster / Obsidian styling tokens
      expect(html).toContain('bg-[#FAFAFA]');
      expect(html).toContain('text-[#0A0A0A]');
      // Explanatory copy
      expect(html).toContain('Root Application Exception');
      expect(html).toContain('safely halted to protect pipeline state integrity');
      // Footer attribution
      expect(html).toContain('Vistar Intake OS · Enterprise Client Asset Healing &amp; Schema Normalization');
    });

    it('renders error digest code when error.digest is provided', () => {
      const digestError = Object.assign(new Error('Catalog parser fatal exception'), {
        digest: 'NEXT_DIGEST_8849204',
      });
      const resetMock = vi.fn();

      const html = renderToStaticMarkup(
        React.createElement(GlobalError, { error: digestError, reset: resetMock })
      );

      expect(html).toContain('Catalog parser fatal exception');
      expect(html).toContain('Digest:');
      expect(html).toContain('NEXT_DIGEST_8849204');
    });

    it('omits digest container when error.digest is undefined', () => {
      const plainError = new Error('Generic unhandled pipeline abort');
      const resetMock = vi.fn();

      const html = renderToStaticMarkup(
        React.createElement(GlobalError, { error: plainError, reset: resetMock })
      );

      expect(html).toContain('Generic unhandled pipeline abort');
      expect(html).not.toContain('Digest:');
    });

    it('falls back to default error message when error.message is empty', () => {
      const emptyError = new Error('');
      const resetMock = vi.fn();

      const html = renderToStaticMarkup(
        React.createElement(GlobalError, { error: emptyError, reset: resetMock })
      );

      expect(html).toContain('An unexpected runtime error occurred.');
    });

    it('renders stack trace details in non-production environment and hides in production', () => {
      const originalEnv = process.env.NODE_ENV;
      const stackError = new Error('Memory leak trace');
      stackError.stack = 'Error: Memory leak trace\n    at eval (file:///app/pipeline.ts:42:15)';
      const resetMock = vi.fn();

      try {
        // Development environment: stack trace should be included
        (process.env as Record<string, string | undefined>).NODE_ENV = 'development';
        const devHtml = renderToStaticMarkup(
          React.createElement(GlobalError, { error: stackError, reset: resetMock })
        );
        expect(devHtml).toContain('View Call Stack');
        expect(devHtml).toContain('file:///app/pipeline.ts:42:15');

        // Production environment: stack trace should be suppressed
        (process.env as Record<string, string | undefined>).NODE_ENV = 'production';
        const prodHtml = renderToStaticMarkup(
          React.createElement(GlobalError, { error: stackError, reset: resetMock })
        );
        expect(prodHtml).not.toContain('View Call Stack');
        expect(prodHtml).not.toContain('file:///app/pipeline.ts:42:15');
      } finally {
        (process.env as Record<string, string | undefined>).NODE_ENV = originalEnv;
      }
    });

    it('binds reset callback to "Try Again" recovery button and exposes reload and home actions', () => {
      const testError = new Error('Crash for recovery testing');
      const resetMock = vi.fn();

      const element = GlobalError({ error: testError, reset: resetMock }) as React.ReactElement<any>;

      // Traverse element tree to locate Try Again button
      // In JSX: body -> main -> card -> action buttons container
      const body = (element.props.children as React.ReactElement<any>[]).find(
        (c) => c && c.type === 'body'
      );
      expect(body).toBeDefined();

      const main = (body?.props.children as React.ReactElement<any>[]).find(
        (c) => c && c.type === 'main'
      );
      expect(main).toBeDefined();

      const card = main?.props.children as React.ReactElement<any>;
      expect(card).toBeDefined();

      // Find buttons container
      const cardChildren = React.Children.toArray(card.props.children) as React.ReactElement<any>[];
      const buttonContainer = cardChildren.find(
        (c) => c && c.props && typeof c.props.className === 'string' && c.props.className.includes('mt-8')
      );
      expect(buttonContainer).toBeDefined();

      const actions = React.Children.toArray(buttonContainer?.props.children) as React.ReactElement<any>[];
      expect(actions).toHaveLength(3);

      const [tryAgainBtn, reloadBtn, studioLink] = actions;

      // 1. Try Again button
      expect(tryAgainBtn.type).toBe('button');
      expect(tryAgainBtn.props.onClick).toBe(resetMock);
      // Trigger callback
      tryAgainBtn.props.onClick();
      expect(resetMock).toHaveBeenCalledTimes(1);

      // 2. Reload Page button
      expect(reloadBtn.type).toBe('button');
      expect(typeof reloadBtn.props.onClick).toBe('function');

      // 3. Studio Console Link
      expect(studioLink.props.href).toBe('/');
    });
  });
});
