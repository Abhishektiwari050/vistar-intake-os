import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as path from 'node:path';
import { GET as getHealth } from '@app/api/health/route';
import { validateEnv } from '@/lib/env';
import { resetTestDbSingleton, resolveDatabaseSsl } from '@/lib/db/client';
import playwrightConfig from '../../playwright.config';

describe('Milestone 3: Production Readiness & Hardening Suite (R3)', () => {
  beforeEach(() => {
    resetTestDbSingleton();
    vi.restoreAllMocks();
  });

  // ---------------------------------------------------------------------------
  // 1. Health Monitoring Endpoint (/api/health)
  // ---------------------------------------------------------------------------
  describe('/api/health Endpoint', () => {
    it('returns HTTP 200 with healthy status, DB latency, memory metrics, and uptime', async () => {
      const response = await getHealth();
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('healthy');
      expect(typeof data.uptimeSeconds).toBe('number');
      expect(data.uptimeSeconds).toBeGreaterThanOrEqual(0);
      expect(typeof data.timestamp).toBe('string');
      expect(new Date(data.timestamp).toISOString()).toBe(data.timestamp);

      // Database probe metrics
      expect(data.database).toBeDefined();
      expect(data.database.status).toBe('connected');
      expect(typeof data.database.latencyMs).toBe('number');
      expect(data.database.latencyMs).toBeGreaterThanOrEqual(0);

      // Memory metrics
      expect(data.memory).toBeDefined();
      expect(typeof data.memory.heapUsedMb).toBe('number');
      expect(data.memory.heapUsedMb).toBeGreaterThan(0);
      expect(typeof data.memory.rssMb).toBe('number');
      expect(data.memory.rssMb).toBeGreaterThan(0);

      // Application version
      expect(data.version).toBe('1.0.0');

      // Cache-control headers
      expect(response.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate');
    });

    it('returns HTTP 503 with degraded status when database connectivity fails', async () => {
      const dbClientModule = await import('@/lib/db/client');
      vi.spyOn(dbClientModule, 'getDb').mockRejectedValueOnce(
        new Error('Database connection pool exhausted')
      );

      const response = await getHealth();
      expect(response.status).toBe(503);

      const data = await response.json();
      expect(data.status).toBe('degraded');
      expect(data.database.status).toBe('disconnected');
      expect(data.database.latencyMs).toBe(-1);
      expect(data.database.error).toContain('Database connection pool exhausted');
      expect(data.version).toBe('1.0.0');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Centralized Environment Variable Validation (src/lib/env.ts)
  // ---------------------------------------------------------------------------
  describe('Environment Schema Validator (src/lib/env.ts)', () => {
    it('applies sensible defaults when optional environment variables are omitted', () => {
      const result = validateEnv({});
      expect(result.success).toBe(true);
      expect(result.data?.NODE_ENV).toBe('development');
      expect(result.data?.PORT).toBe('3000');
      expect(result.data?.HOSTNAME).toBe('0.0.0.0');
      expect(result.data?.DATABASE_SSL).toBe('false');
      expect(result.data?.DATABASE_URL).toBeUndefined();
      expect(result.data?.GEMINI_API_KEY).toBeUndefined();
    });

    it('parses valid production environment configuration', () => {
      const validConfig = {
        NODE_ENV: 'production',
        PORT: '8080',
        HOSTNAME: '0.0.0.0',
        DATABASE_URL: 'postgresql://vistar_admin:secure_pass@db.internal:5432/vistar_prod',
        DATABASE_SSL: 'true',
        GEMINI_API_KEY: 'test-gemini-key-xyz',
      };

      const result = validateEnv(validConfig);
      expect(result.success).toBe(true);
      expect(result.data?.NODE_ENV).toBe('production');
      expect(result.data?.PORT).toBe('8080');
      expect(result.data?.DATABASE_URL).toBe(validConfig.DATABASE_URL);
      expect(result.data?.DATABASE_SSL).toBe('true');
      expect(result.data?.GEMINI_API_KEY).toBe('test-gemini-key-xyz');
    });

    it('rejects invalid NODE_ENV value with structured errors', () => {
      const result = validateEnv({ NODE_ENV: 'qa_staging' });
      expect(result.success).toBe(false);
      expect(result.errors?.NODE_ENV?._errors.length).toBeGreaterThan(0);
    });

    it('rejects non-numeric PORT value', () => {
      const result = validateEnv({ PORT: 'three-thousand' });
      expect(result.success).toBe(false);
      expect(result.errors?.PORT?._errors.length).toBeGreaterThan(0);
    });

    it('rejects invalid DATABASE_SSL values', () => {
      const result = validateEnv({ DATABASE_SSL: 'enabled' });
      expect(result.success).toBe(false);
      expect(result.errors?.DATABASE_SSL?._errors.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. PostgreSQL SSL Resolution (src/lib/db/client.ts)
  // ---------------------------------------------------------------------------
  describe('PostgreSQL SSL Resolution (src/lib/db/client.ts)', () => {
    it('returns { rejectUnauthorized: false } when SSL is explicitly enabled via "true"', () => {
      const ssl = resolveDatabaseSsl('true');
      expect(ssl).toEqual({ rejectUnauthorized: false });
    });

    it('returns undefined when SSL is disabled via "false"', () => {
      const ssl = resolveDatabaseSsl('false');
      expect(ssl).toBeUndefined();
    });

    it('returns undefined when SSL is undefined or empty string', () => {
      expect(resolveDatabaseSsl(undefined)).toBeUndefined();
      expect(resolveDatabaseSsl('')).toBeUndefined();
    });

    it('returns undefined when an arbitrary unrecognized string is provided', () => {
      expect(resolveDatabaseSsl('random_value')).toBeUndefined();
    });

    it('reads from process.env.DATABASE_SSL when parameter is omitted', () => {
      const originalEnv = process.env.DATABASE_SSL;
      try {
        process.env.DATABASE_SSL = 'true';
        expect(resolveDatabaseSsl()).toEqual({ rejectUnauthorized: false });

        process.env.DATABASE_SSL = 'false';
        expect(resolveDatabaseSsl()).toBeUndefined();
      } finally {
        if (originalEnv !== undefined) {
          process.env.DATABASE_SSL = originalEnv;
        } else {
          delete process.env.DATABASE_SSL;
        }
      }
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Playwright Configuration Integrity (playwright.config.ts)
  // ---------------------------------------------------------------------------
  describe('Playwright Configuration Integrity (playwright.config.ts)', () => {
    it('configures webServer with cwd set to project root directory', () => {
      expect(playwrightConfig.webServer).toBeDefined();
      const rawWebServer = playwrightConfig.webServer;
      const webServer = Array.isArray(rawWebServer) ? rawWebServer[0] : rawWebServer;
      expect(webServer).toBeDefined();

      // Assert cwd is configured
      expect(webServer?.cwd).toBeDefined();
      expect(typeof webServer?.cwd).toBe('string');

      // Assert cwd resolves to vistar-intake-os directory
      const resolvedCwd = path.resolve(webServer!.cwd!);
      expect(resolvedCwd).toContain('vistar-intake-os');

      // Assert port and URL alignment
      expect(webServer?.url).toBe('http://127.0.0.1:3020');
      expect(webServer?.command).toContain('-p 3020');
      expect(playwrightConfig.use?.baseURL).toBe('http://127.0.0.1:3020');
    });
  });
});
