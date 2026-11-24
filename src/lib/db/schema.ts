import { pgTable, text, integer, jsonb, timestamp, uuid, uniqueIndex, boolean } from 'drizzle-orm/pg-core';
import type {
  SchemaFieldRule,
  MediaRuleConfig,
  NormalizedRow,
  ProcessedAsset,
  PipelineStepLog,
  SubmissionStats,
  AuditEvent,
} from '@/lib/types/intake';

export const blueprints = pgTable(
  'blueprints',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    targetType: text('target_type').notNull(), // 'ecommerce_catalog' | 'agency_kickoff'
    sqlTableName: text('sql_table_name').notNull(),
    schemaRules: jsonb('schema_rules').$type<SchemaFieldRule[]>().notNull(),
    mediaRules: jsonb('media_rules').$type<MediaRuleConfig>().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('idx_blueprints_slug').on(table.slug)]
);

export const mappingMemory = pgTable(
  'mapping_memory',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    blueprintId: uuid('blueprint_id')
      .references(() => blueprints.id, { onDelete: 'cascade' })
      .notNull(),
    headerHash: text('header_hash').notNull(),
    mappingJson: jsonb('mapping_json').$type<Record<string, string>>().notNull(),
    hitCount: integer('hit_count').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('idx_mapping_memory_hash_bp').on(table.blueprintId, table.headerHash)]
);

export const submissions = pgTable('submissions', {
  id: uuid('id').defaultRandom().primaryKey(),
  blueprintId: uuid('blueprint_id')
    .references(() => blueprints.id, { onDelete: 'cascade' })
    .notNull(),
  blueprintSlug: text('blueprint_slug').notNull(),
  clientName: text('client_name').notNull(),
  status: text('status').default('draft').notNull(), // 'draft' | 'partial_approved' | 'verified'
  rows: jsonb('rows').$type<NormalizedRow[]>().notNull(),
  assets: jsonb('assets').$type<ProcessedAsset[]>().notNull(),
  pipelineLogs: jsonb('pipeline_logs').$type<PipelineStepLog[]>().notNull(),
  auditEvents: jsonb('audit_events').$type<AuditEvent[]>().default([]).notNull(),
  stats: jsonb('stats').$type<SubmissionStats>().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export const webhooks = pgTable('webhooks', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: text('name').notNull(),
  url: text('url').notNull(),
  secret: text('secret').notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  lastStatus: integer('last_status'),
  lastLatencyMs: integer('last_latency_ms'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});
