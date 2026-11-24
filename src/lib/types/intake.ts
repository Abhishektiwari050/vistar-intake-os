export type TargetBlueprintType = 'ecommerce_catalog' | 'agency_kickoff';

export type FieldType = 'string' | 'number' | 'currency' | 'sku' | 'email' | 'gstin' | 'url';

export interface SchemaFieldRule {
  key: string;
  label: string;
  type: FieldType;
  required: boolean;
  aliases: string[];
  description?: string;
}

export interface MediaRuleConfig {
  minWidth: number;
  minHeight: number;
  targetWidth: number;
  targetHeight: number;
  aspectRatio: '1:1' | 'any';
  outputFormat: 'webp' | 'png';
  deduplicateByHash: boolean;
  autoHealOffRatio: boolean;
}

export interface Blueprint {
  id: string;
  slug: string;
  name: string;
  description: string;
  targetType: TargetBlueprintType;
  sqlTableName: string;
  schemaRules: SchemaFieldRule[];
  mediaRules: MediaRuleConfig;
  createdAt: string;
}

export type CellVerificationStatus = 'verified' | 'ai_healed' | 'missing_required' | 'invalid_format';

export interface NormalizedCell {
  value: string | number | null;
  originalRaw: string | null;
  status: CellVerificationStatus;
  reason?: string;
  confidence: number; // 0 to 1
}

export interface NormalizedRow {
  rowIndex: number;
  rowId: string;
  cells: Record<string, NormalizedCell>;
  linkedAssetIds: string[];
  isRowVerified: boolean;
  pendingApproval: boolean;
}

export interface DuplicateMetrics {
  hammingDistance: number;
  rgbDistance: number;
  thresholdHamming: number; // 4
  thresholdRgb: number;     // 28
}

export interface ProcessedAsset {
  id: string;
  originalFilename: string;
  healedFilename: string;
  mimeType: string;
  originalWidth: number;
  originalHeight: number;
  healedWidth: number;
  healedHeight: number;
  dHash: string;
  meanRgb?: [number, number, number];
  isDuplicate: boolean;
  duplicateOfFilename?: string;
  duplicateOfAssetId?: string;
  duplicateMetrics?: DuplicateMetrics;
  wasAutoHealed: boolean;
  healActions: string[];
  linkedRowId?: string;
  linkedSku?: string;
  matchConfidence: number;
  dataUrl: string;
  byteSize: number;
  error?: string;
}

export interface PipelineStepLog {
  step: string;
  status: 'completed' | 'skipped' | 'warning';
  detail: string;
  durationMs: number;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor: string;
  action: 'cell_edited' | 'cell_reverted' | 'bulk_healed_approved' | 'asset_reassigned' | 'duplicate_overridden' | 'webhook_dispatched';
  detail: string;
}

export interface SubmissionStats {
  totalRawRows: number;
  strippedNoiseRows: number;
  verifiedRowsCount: number;
  healedCellsCount: number;
  totalAssetsUploaded: number;
  duplicatesRemoved: number;
  assetsAutoHealed: number;
  visionMatchedCount: number;
  usedMappingMemory: boolean;
  headerFingerprint: string;
  totalProcessingMs: number;
}

export interface IntakeSubmission {
  id: string;
  blueprintId: string;
  blueprintSlug: string;
  clientName: string;
  status: 'draft' | 'partial_approved' | 'verified';
  rows: NormalizedRow[];
  assets: ProcessedAsset[];
  pipelineLogs: PipelineStepLog[];
  auditEvents: AuditEvent[];
  stats: SubmissionStats;
  createdAt: string;
}

export interface WebhookConfig {
  id: string;
  name: string;
  url: string;
  secret: string;
  enabled: boolean;
  lastStatus?: number | null;
  lastLatencyMs?: number | null;
  createdAt: string;
}

export interface ColumnMappingPreview {
  rawHeader: string;
  predictedTargetKey: string | null;
  confidence: number;
  sampleValues: string[];
}
