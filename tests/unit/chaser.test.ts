import { describe, it, expect } from 'vitest';
import {
  generateClientFollowUp,
  formatDeadline,
  buildSkuDeepLink,
} from '@/lib/export/chaser';
import type { Blueprint, IntakeSubmission, NormalizedRow, SubmissionStats } from '@/lib/types/intake';

const mockBlueprint: Blueprint = {
  id: 'bp-test-1',
  slug: 'test-catalog',
  name: 'Test E-Commerce Catalog',
  description: 'Test catalog blueprint for client follow-up',
  targetType: 'ecommerce_catalog',
  sqlTableName: 'test_products',
  schemaRules: [
    { key: 'sku', label: 'SKU Code', type: 'sku', required: true, aliases: [] },
    { key: 'title', label: 'Product Title', type: 'string', required: true, aliases: [] },
    { key: 'price', label: 'Unit Price', type: 'currency', required: true, aliases: [] },
  ],
  mediaRules: {
    minWidth: 500,
    minHeight: 500,
    targetWidth: 1080,
    targetHeight: 1080,
    aspectRatio: '1:1',
    outputFormat: 'webp',
    autoHealOffRatio: true,
    deduplicateByHash: true,
  },
  createdAt: '2026-11-11T00:00:00.000Z',
};

function createMockStats(overrides: Partial<SubmissionStats> = {}): SubmissionStats {
  return {
    totalRawRows: 2,
    strippedNoiseRows: 0,
    verifiedRowsCount: 1,
    healedCellsCount: 0,
    totalAssetsUploaded: 1,
    duplicatesRemoved: 0,
    assetsAutoHealed: 0,
    visionMatchedCount: 0,
    usedMappingMemory: false,
    headerFingerprint: 'mock-fingerprint',
    totalProcessingMs: 120,
    ...overrides,
  };
}

function createMockRow(
  rowId: string,
  skuVal: string,
  titleVal: string,
  isVerified: boolean,
  priceStatus: 'verified' | 'missing_required' = 'verified'
): NormalizedRow {
  return {
    rowId,
    rowIndex: 1,
    cells: {
      sku: {
        originalRaw: skuVal,
        value: skuVal,
        confidence: 1.0,
        status: 'verified',
        reason: 'Valid',
      },
      title: {
        originalRaw: titleVal,
        value: titleVal,
        confidence: 1.0,
        status: 'verified',
        reason: 'Valid',
      },
      price: {
        originalRaw: priceStatus === 'verified' ? '19.99' : '',
        value: priceStatus === 'verified' ? 19.99 : null,
        confidence: priceStatus === 'verified' ? 1.0 : 0,
        status: priceStatus,
        reason: priceStatus === 'verified' ? 'Valid' : 'Price is required',
      },
    },
    linkedAssetIds: ['asset-1'],
    isRowVerified: isVerified,
    pendingApproval: !isVerified,
  };
}

describe('Client Follow-up Chaser Enhancements', () => {
  describe('formatDeadline', () => {
    it('formats a readable deadline string within specified timeframe', () => {
      // Fixed reference date: Wednesday, Nov 12, 2026, 10:00 AM UTC
      const fixedDate = new Date('2026-11-12T10:00:00.000Z');
      const deadline = formatDeadline(48, fixedDate);

      expect(deadline).toContain('within 48 hours');
      expect(deadline).toMatch(/by [A-Za-z]+, \d{1,2}:\d{2} [AP]M/);
    });

    it('formats custom timeframes (24 hours and 72 hours)', () => {
      const fixedDate = new Date('2026-11-12T10:00:00.000Z');

      const d24 = formatDeadline(24, fixedDate);
      expect(d24).toContain('within 24 hours');

      const d72 = formatDeadline(72, fixedDate);
      expect(d72).toContain('within 72 hours');
    });

    it('falls back to 48 hours on invalid, zero, or negative inputs', () => {
      expect(formatDeadline(0)).toContain('within 48 hours');
      expect(formatDeadline(-12)).toContain('within 48 hours');
      expect(formatDeadline(NaN as unknown as number)).toContain('within 48 hours');
    });
  });

  describe('buildSkuDeepLink', () => {
    it('constructs SKU deep-link with ?focusSku= on clean base URL', () => {
      const url = buildSkuDeepLink('https://intake.vistar.tech/submissions/sub-123', 'SKU-100');
      expect(url).toBe('https://intake.vistar.tech/submissions/sub-123?focusSku=SKU-100');
    });

    it('constructs SKU deep-link with &focusSku= when base URL has existing query parameters', () => {
      const url = buildSkuDeepLink(
        'https://intake.vistar.tech/submissions/sub-123?tab=items&filter=dirty',
        'SKU-100'
      );
      expect(url).toBe(
        'https://intake.vistar.tech/submissions/sub-123?tab=items&filter=dirty&focusSku=SKU-100'
      );
    });

    it('safely percent-encodes special characters in SKU identifiers', () => {
      const specialSku = 'PROD/123 & 45 + RED#1';
      const url = buildSkuDeepLink('https://intake.vistar.tech/sub-1', specialSku);
      expect(url).toBe(
        'https://intake.vistar.tech/sub-1?focusSku=PROD%2F123%20%26%2045%20%2B%20RED%231'
      );
    });
  });

  describe('generateClientFollowUp', () => {
    it('generates multi-channel templates with deadline and SKU deep-links', () => {
      const submission: IntakeSubmission = {
        id: 'sub-chaser-1',
        blueprintId: mockBlueprint.id,
        blueprintSlug: mockBlueprint.slug,
        clientName: 'Acme Fashion',
        status: 'partial_approved',
        rows: [
          createMockRow('row-1', 'ACME-001', 'Cotton Shirt', true, 'verified'),
          createMockRow('row-2', 'ACME-002', 'Linen Trousers', false, 'missing_required'),
        ],
        assets: [
          {
            id: 'asset-1',
            originalFilename: 'shirt.jpg',
            healedFilename: 'ACME-001.webp',
            mimeType: 'image/webp',
            originalWidth: 1080,
            originalHeight: 1080,
            healedWidth: 1080,
            healedHeight: 1080,
            dHash: 'a1b2c3d4e5f60718',
            isDuplicate: false,
            wasAutoHealed: false,
            healActions: [],
            linkedRowId: 'row-1',
            matchConfidence: 0.95,
            dataUrl: 'data:image/webp;base64,mock',
            byteSize: 1024,
          },
        ],
        stats: createMockStats({ totalRawRows: 2, verifiedRowsCount: 1 }),
        pipelineLogs: [],
        auditEvents: [],
        createdAt: '2026-11-12T00:00:00.000Z',
      };

      const fixedDate = new Date('2026-11-12T10:00:00.000Z');
      const portalUrl = 'https://intake.vistar.tech/submissions/sub-chaser-1';

      const report = generateClientFollowUp(submission, mockBlueprint, portalUrl, {
        timeframeHours: 24,
        referenceDate: fixedDate,
      });

      // Verification stats
      expect(report.totalCount).toBe(2);
      expect(report.verifiedCount).toBe(1);
      expect(report.completionPercent).toBe(50);
      expect(report.timeframeHours).toBe(24);
      expect(report.deadlineText).toContain('within 24 hours');

      // Missing items & deep-links
      expect(report.missingItems.length).toBe(1);
      const missing = report.missingItems[0];
      expect(missing.identifier).toBe('ACME-002');
      expect(missing.sku).toBe('ACME-002');
      expect(missing.deepLink).toBe(
        'https://intake.vistar.tech/submissions/sub-chaser-1?focusSku=ACME-002'
      );
      expect(missing.issues).toContain('Missing Unit Price');
      expect(missing.issues).toContain('Missing linked product/brand image');

      // Markdown assertions
      expect(report.markdownText).toContain('### Client Follow-up Checklist: Acme Fashion');
      expect(report.markdownText).toContain('**Status:** 50% Complete (1/2 rows verified)');
      expect(report.markdownText).toContain(`**Deadline:** ${report.deadlineText}`);
      expect(report.markdownText).toContain(
        `- **[ACME-002](${missing.deepLink})**: Missing Unit Price, Missing linked product/brand image`
      );
      expect(report.markdownText).toContain(`[Open Verification Portal](${portalUrl})`);

      // WhatsApp assertions
      expect(report.whatsappText).toContain('Hi Acme Fashion team!');
      expect(report.whatsappText).toContain('*50% verified* (1/2 ready)');
      expect(report.whatsappText).toContain(`Please check these remaining items ${report.deadlineText}:`);
      expect(report.whatsappText).toContain(`* ACME-002 (${missing.deepLink}):`);
      expect(report.whatsappText).toContain(portalUrl);

      // Email assertions
      expect(report.emailText).toContain('Subject: Action Needed: Complete Remaining Items for Acme Fashion');
      expect(report.emailText).toContain(`To finalize the remaining package ${report.deadlineText}`);
      expect(report.emailText).toContain(`* ACME-002 (${missing.deepLink}):`);
      expect(report.emailText).toContain(portalUrl);
    });

    it('maintains backwards compatibility with numeric hours and default call', () => {
      const submission: IntakeSubmission = {
        id: 'sub-legacy',
        blueprintId: mockBlueprint.id,
        blueprintSlug: mockBlueprint.slug,
        clientName: 'Legacy Client',
        status: 'draft',
        rows: [
          createMockRow('r-1', 'LEG-1', 'Item 1', true),
          createMockRow('r-2', 'LEG-2', 'Item 2', false, 'missing_required'),
        ],
        assets: [],
        stats: createMockStats({ totalRawRows: 2, verifiedRowsCount: 1 }),
        pipelineLogs: [],
        auditEvents: [],
        createdAt: '2026-11-12T00:00:00.000Z',
      };

      // Called with numeric hours
      const reportNum = generateClientFollowUp(submission, mockBlueprint, 'https://legacy.io/sub', 72);
      expect(reportNum.timeframeHours).toBe(72);
      expect(reportNum.deadlineText).toContain('within 72 hours');

      // Called with no options (defaults to 48 hours)
      const reportDefault = generateClientFollowUp(submission, mockBlueprint, 'https://legacy.io/sub');
      expect(reportDefault.timeframeHours).toBe(48);
      expect(reportDefault.deadlineText).toContain('within 48 hours');
    });

    it('handles 100% verified submission cleanly with 0 missing items', () => {
      const submission: IntakeSubmission = {
        id: 'sub-perfect',
        blueprintId: mockBlueprint.id,
        blueprintSlug: mockBlueprint.slug,
        clientName: 'Perfect Client',
        status: 'verified',
        rows: [createMockRow('r-1', 'PERF-1', 'Item 1', true, 'verified')],
        assets: [
          {
            id: 'a-1',
            originalFilename: 'perf.jpg',
            healedFilename: 'PERF-1.webp',
            mimeType: 'image/webp',
            originalWidth: 1080,
            originalHeight: 1080,
            healedWidth: 1080,
            healedHeight: 1080,
            dHash: 'ffff0000ffff0000',
            isDuplicate: false,
            wasAutoHealed: false,
            healActions: [],
            linkedRowId: 'r-1',
            matchConfidence: 1.0,
            dataUrl: 'data:image/webp;base64,mock',
            byteSize: 500,
          },
        ],
        stats: createMockStats({ totalRawRows: 1, verifiedRowsCount: 1 }),
        pipelineLogs: [],
        auditEvents: [],
        createdAt: '2026-11-12T00:00:00.000Z',
      };

      const report = generateClientFollowUp(submission, mockBlueprint, 'https://perfect.io/sub');
      expect(report.completionPercent).toBe(100);
      expect(report.missingItems.length).toBe(0);
      expect(report.markdownText).toContain('- All items verified.');
      expect(report.whatsappText).toContain('* All items verified.');
      expect(report.emailText).toContain('* All items verified.');
    });
  });
});
