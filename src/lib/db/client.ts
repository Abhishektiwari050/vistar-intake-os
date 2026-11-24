import { PGlite } from '@electric-sql/pglite';
import { drizzle as drizzlePglite, type PgliteDatabase } from 'drizzle-orm/pglite';
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as schema from './schema';
import { DEFAULT_BLUEPRINTS } from './defaults';
import { count } from 'drizzle-orm';

export type IntakeDatabase = PgliteDatabase<typeof schema> | PostgresJsDatabase<typeof schema>;

declare global {
  // eslint-disable-next-line no-var
  var __vistarIntakeDbPromise: Promise<IntakeDatabase> | undefined;
}

const SCHEMA_DDL = `
CREATE TABLE IF NOT EXISTS blueprints (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL,
  target_type text NOT NULL,
  sql_table_name text NOT NULL,
  schema_rules jsonb NOT NULL,
  media_rules jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS mapping_memory (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  blueprint_id uuid NOT NULL REFERENCES blueprints(id) ON DELETE CASCADE,
  header_hash text NOT NULL,
  mapping_json jsonb NOT NULL,
  hit_count integer DEFAULT 1 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_mapping_memory_hash_bp ON mapping_memory (blueprint_id, header_hash);

CREATE TABLE IF NOT EXISTS submissions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  blueprint_id uuid NOT NULL REFERENCES blueprints(id) ON DELETE CASCADE,
  blueprint_slug text NOT NULL,
  client_name text NOT NULL,
  status text DEFAULT 'draft' NOT NULL,
  rows jsonb NOT NULL,
  assets jsonb NOT NULL,
  pipeline_logs jsonb NOT NULL,
  audit_events jsonb DEFAULT '[]'::jsonb NOT NULL,
  stats jsonb NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

ALTER TABLE submissions ADD COLUMN IF NOT EXISTS audit_events jsonb DEFAULT '[]'::jsonb NOT NULL;

CREATE TABLE IF NOT EXISTS webhooks (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  url text NOT NULL,
  secret text NOT NULL,
  enabled boolean DEFAULT true NOT NULL,
  last_status integer,
  last_latency_ms integer,
  created_at timestamptz DEFAULT now() NOT NULL
);
`;

async function seedDefaultBlueprints(db: IntakeDatabase): Promise<void> {
  const [{ value }] = await db.select({ value: count() }).from(schema.blueprints);
  if (Number(value) > 0) return;

  for (const bp of DEFAULT_BLUEPRINTS) {
    await db
      .insert(schema.blueprints)
      .values({
        slug: bp.slug,
        name: bp.name,
        description: bp.description,
        targetType: bp.targetType,
        sqlTableName: bp.sqlTableName,
        schemaRules: bp.schemaRules,
        mediaRules: bp.mediaRules,
      })
      .onConflictDoNothing();
  }
}

/**
 * Resolves PostgreSQL SSL options based on the DATABASE_SSL environment variable.
 * Returns { rejectUnauthorized: false } if 'true', otherwise undefined.
 */
export function resolveDatabaseSsl(
  sslEnv: string | undefined = process.env.DATABASE_SSL
): { rejectUnauthorized: boolean } | undefined {
  return sslEnv === 'true' ? { rejectUnauthorized: false } : undefined;
}

async function initDatabase(): Promise<IntakeDatabase> {
  const remoteUrl = process.env.DATABASE_URL;
  const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

  if (remoteUrl && !isTestEnv) {
    const ssl = resolveDatabaseSsl();
    const sqlClient = postgres(remoteUrl, {
      max: 10,
      prepare: false,
      ssl,
    });
    const db = drizzlePostgres(sqlClient, { schema });
    await sqlClient.unsafe(SCHEMA_DDL);
    await seedDefaultBlueprints(db);
    return db;
  }

  let pgliteClient: PGlite;
  if (isTestEnv) {
    pgliteClient = new PGlite();
  } else {
    const dataDir = path.join(process.cwd(), 'data', 'intake_pgdata');
    fs.mkdirSync(dataDir, { recursive: true });
    pgliteClient = new PGlite(dataDir);
  }

  await pgliteClient.waitReady;
  await pgliteClient.exec(SCHEMA_DDL);
  const db = drizzlePglite(pgliteClient, { schema });
  await seedDefaultBlueprints(db);
  return db;
}

export async function getDb(): Promise<IntakeDatabase> {
  if (!globalThis.__vistarIntakeDbPromise) {
    globalThis.__vistarIntakeDbPromise = initDatabase().catch((err) => {
      globalThis.__vistarIntakeDbPromise = undefined;
      throw err;
    });
  }
  return globalThis.__vistarIntakeDbPromise;
}

export function resetTestDbSingleton(): void {
  globalThis.__vistarIntakeDbPromise = undefined;
}
