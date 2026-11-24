import { NextResponse } from 'next/server';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/client';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export interface HealthCheckResponse {
  status: 'healthy' | 'degraded';
  uptimeSeconds: number;
  timestamp: string;
  database: {
    status: 'connected' | 'disconnected';
    latencyMs: number;
    error?: string;
  };
  memory: {
    heapUsedMb: number;
    rssMb: number;
  };
  version: string;
}

export async function GET(): Promise<Response> {
  const timestamp = new Date().toISOString();
  const uptimeSeconds = Number(process.uptime().toFixed(1));
  const mem = process.memoryUsage();
  const memory = {
    heapUsedMb: Number((mem.heapUsed / (1024 * 1024)).toFixed(1)),
    rssMb: Number((mem.rss / (1024 * 1024)).toFixed(1)),
  };
  const version = '1.0.0';

  try {
    const db = await getDb();
    const start = performance.now();
    await db.execute(sql`SELECT 1 as ping`);
    const latencyMs = Number((performance.now() - start).toFixed(1));

    const payload: HealthCheckResponse = {
      status: 'healthy',
      uptimeSeconds,
      timestamp,
      database: {
        status: 'connected',
        latencyMs,
      },
      memory,
      version,
    };

    return NextResponse.json(payload, {
      status: 200,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Content-Type': 'application/json',
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Database ping failed';

    const payload: HealthCheckResponse = {
      status: 'degraded',
      uptimeSeconds,
      timestamp,
      database: {
        status: 'disconnected',
        latencyMs: -1,
        error: errorMsg,
      },
      memory,
      version,
    };

    return NextResponse.json(payload, {
      status: 503,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Content-Type': 'application/json',
      },
    });
  }
}
