import { describe, it, expect, beforeEach } from 'vitest';
import sharp from 'sharp';
import { buildSkuDeepLink, formatDeadline, generateClientFollowUp } from '@/lib/export/chaser';
import { computeDifferenceHash, hammingDistance, healAndLinkAssets } from '@/lib/media/healer';
import { GET as getMappingMemory } from '@app/api/mapping-memory/route';
import { DELETE as deleteMappingMemory } from '@app/api/mapping-memory/[id]/route';
import { resetTestDbSingleton, getDb } from '@/lib/db/client';
import { blueprints, mappingMemory } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import type { Blueprint, IntakeSubmission, NormalizedRow, SubmissionStats } from '@/lib/types/intake';

const mockBlueprint: Blueprint = {
  id: 'bp-challenger-1',
  slug: 'challenger-test',
  name: 'Challenger Stress Blueprint',
  description: 'Adversarial stress testing blueprint',
  targetType: 'ecommerce_catalog',
  sqlTableName: 'challenger_products',
  schemaRules: [
    { key: 'sku', label: 'SKU Code', type: 'sku', required: true, aliases: [] },
    { key: 'title', label: 'Product Title', type: 'string', required: true, aliases: [] },
    { key: 'price', label: 'Unit Price', type: 'currency', required: true, aliases: [] },
  ],
  mediaRules: {
    minWidth: 100,
    minHeight: 100,
    targetWidth: 1080,
    targetHeight: 1080,
    aspectRatio: '1:1',
    outputFormat: 'webp',
    autoHealOffRatio: true,
    deduplicateByHash: true,
  },
  createdAt: '2026-11-12T00:00:00.000Z',
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
    headerFingerprint: 'challenger-fingerprint',
    totalProcessingMs: 100,
    ...overrides,
  };
}

describe('Empirical Challenger: Milestone 2 Adversarial Stress Suite', () => {
  // =========================================================================
  // SECTION 1: Deep Link Generator Stress Testing
  // =========================================================================
  describe('1. buildSkuDeepLink Adversarial Edge Cases', () => {
    it('handles complex URL characters, slashes, ampersands, plus, and hash', () => {
      const hostileSkus = [
        'SKU/WITH/SLASHES',
        'SKU & PARTNER + CO',
        'SKU#FRAGMENT',
        'SKU?QUERY=1',
        'SKU%20ENCODED',
        'SKU=VALUE&ANOTHER=VALUE',
        '"QUOTED_SKU"',
        "'SINGLE_QUOTED'",
        'SKU WITH SPACES   MULTIPLE',
      ];

      for (const sku of hostileSkus) {
        const link = buildSkuDeepLink('https://app.vistar.tech/catalog', sku);
        expect(link.startsWith('https://app.vistar.tech/catalog?focusSku=')).toBe(true);

        // URL parsing round-trip test: searchParams must decode to the exact original string
        const parsed = new URL(link);
        expect(parsed.searchParams.get('focusSku')).toBe(sku);
      }
    });

    it('handles unicode, CJK characters, accents, and emojis safely', () => {
      const unicodeSkus = [
        'SKU-東京-2026',
        'PROD-café-au-lait',
        'СКУ-МОСКВА-99',
        'SKU-👟-PRO-MAX',
        '🔥-HOT-DEAL-100%',
      ];

      for (const sku of unicodeSkus) {
        const link = buildSkuDeepLink('https://app.vistar.tech/catalog', sku);
        const parsed = new URL(link);
        expect(parsed.searchParams.get('focusSku')).toBe(sku);
      }
    });

    it('handles base URLs with complex query strings, fragments, and trailing slashes', () => {
      const baseUrls = [
        'https://app.vistar.tech/submissions/sub-1?filter=pending&sort=desc',
        'https://app.vistar.tech/submissions/sub-1?tab=media&preview=true#section',
        'https://app.vistar.tech/submissions/sub-1/',
        'http://localhost:3000/intake/custom-blueprint?debug=1&mode=chaotic',
      ];

      for (const base of baseUrls) {
        const link = buildSkuDeepLink(base, 'SKU-TEST-99');
        if (base.includes('?')) {
          expect(link).toContain('&focusSku=SKU-TEST-99');
        } else {
          expect(link).toContain('?focusSku=SKU-TEST-99');
        }
      }
    });

    it('handles empty SKU, whitespace SKU, and newlines safely without crashing', () => {
      const emptyLink = buildSkuDeepLink('https://app.vistar.tech/catalog', '');
      expect(emptyLink).toBe('https://app.vistar.tech/catalog?focusSku=');

      const newlineSku = 'SKU\nINJECTED\r\nLINE';
      const newlineLink = buildSkuDeepLink('https://app.vistar.tech/catalog', newlineSku);
      const parsed = new URL(newlineLink);
      expect(parsed.searchParams.get('focusSku')).toBe(newlineSku);
    });
  });

  // =========================================================================
  // SECTION 2: Dynamic Deadline Calculation Stress Testing
  // =========================================================================
  describe('2. formatDeadline Adversarial Edge Cases', () => {
    it('safely handles negative, zero, and infinite hours by falling back to 48', () => {
      const baseDate = new Date('2026-11-12T12:00:00.000Z');

      const negativeResult = formatDeadline(-24, baseDate);
      expect(negativeResult).toContain('within 48 hours');

      const zeroResult = formatDeadline(0, baseDate);
      expect(zeroResult).toContain('within 48 hours');

      const infResult = formatDeadline(Infinity, baseDate);
      expect(infResult).toContain('within 48 hours');

      const nanResult = formatDeadline(NaN, baseDate);
      expect(nanResult).toContain('within 48 hours');
    });

    it('accurately calculates leap day boundary (Feb 28 -> Feb 29 in a leap year)', () => {
      // 2028 is a leap year. Feb 28, 2028 at 12:00 UTC + 24 hours = Feb 29, 2028 at 12:00 UTC
      const feb28_2028 = new Date(Date.UTC(2028, 1, 28, 12, 0, 0)); // Month is 0-indexed (1 = Feb)
      const result = formatDeadline(24, feb28_2028);

      expect(result).toContain('within 24 hours');
      // Feb 29, 2028 is Tuesday
      expect(result).toContain('Tuesday');
    });

    it('accurately calculates non-leap year boundary (Feb 28 -> Mar 1 in non-leap year)', () => {
      // 2026 is NOT a leap year. Feb 28, 2026 at 12:00 UTC + 24 hours = Mar 1, 2026
      const feb28_2026 = new Date(Date.UTC(2026, 1, 28, 12, 0, 0));
      const result = formatDeadline(24, feb28_2026);

      expect(result).toContain('within 24 hours');
      // March 1, 2026 is Sunday
      expect(result).toContain('Sunday');
    });

    it('accurately calculates year rollover (Dec 31 -> Jan 2)', () => {
      const dec31 = new Date(Date.UTC(2026, 11, 31, 10, 0, 0)); // Dec 31, 2026 Thursday
      const result = formatDeadline(48, dec31); // +48h -> Jan 2, 2027 Saturday

      expect(result).toContain('within 48 hours');
      expect(result).toContain('Saturday');
    });

    it('handles fractional hours safely', () => {
      const baseDate = new Date('2026-11-12T12:00:00.000Z');
      const resultHalf = formatDeadline(0.5, baseDate); // 30 minutes
      expect(resultHalf).toContain('within 0.5 hours');
      expect(resultHalf).toMatch(/by [A-Za-z]+, \d{1,2}:\d{2} [AP]M/);

      const resultFraction = formatDeadline(36.5, baseDate);
      expect(resultFraction).toContain('within 36.5 hours');
    });

    it('handles extreme large hour values without exception', () => {
      const baseDate = new Date('2026-11-12T12:00:00.000Z');
      const largeResult = formatDeadline(10000, baseDate);
      expect(largeResult).toContain('within 10000 hours');
      expect(largeResult).toMatch(/by [A-Za-z]+, \d{1,2}:\d{2} [AP]M/);
    });
  });

  // =========================================================================
  // SECTION 3: Mapping Memory API Adversarial Payloads
  // =========================================================================
  describe('3. Mapping Memory API Security & Edge Payloads', () => {
    beforeEach(() => {
      resetTestDbSingleton();
    });

    it('rejects path traversal attempts with 400 Bad Request', async () => {
      const traversalPayloads = [
        '../../etc/passwd',
        '..\\..\\windows\\win.ini',
        '....//....//etc/shadow',
        '../../api/submissions',
        '%2e%2e%2f%2e%2e%2f',
      ];

      for (const payload of traversalPayloads) {
        const req = new Request(`http://localhost/api/mapping-memory/${encodeURIComponent(payload)}`, {
          method: 'DELETE',
        });
        const res = await deleteMappingMemory(req, {
          params: Promise.resolve({ id: payload }),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe('Invalid mapping memory UUID format');
      }
    });

    it('rejects SQL injection payloads with 400 Bad Request before database touch', async () => {
      const sqlInjectionPayloads = [
        "' OR '1'='1",
        "'; DROP TABLE mapping_memory; --",
        "1' UNION SELECT 1,2,3,4,5,6,7,8 --",
        "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11' OR 1=1 --",
        "SLEEP(5)",
        "00000000-0000-0000-0000-000000000000; SELECT * FROM blueprints",
      ];

      for (const payload of sqlInjectionPayloads) {
        const req = new Request('http://localhost/api/mapping-memory/exploit', {
          method: 'DELETE',
        });
        const res = await deleteMappingMemory(req, {
          params: Promise.resolve({ id: payload }),
        });

        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error).toBe('Invalid mapping memory UUID format');
      }
    });

    it('accepts uppercase and mixed-case UUIDs correctly', async () => {
      const db = await getDb();
      const [bp] = await db.select().from(blueprints).limit(1);

      // Seed mapping
      const [inserted] = await db
        .insert(mappingMemory)
        .values({
          blueprintId: bp.id,
          headerHash: 'uppercase-uuid-test-hash',
          mappingJson: { sku: 'SKU_UPPER' },
          hitCount: 1,
        })
        .returning();

      const upperUuid = inserted.id.toUpperCase();
      expect(upperUuid).not.toBe(inserted.id); // Confirms uppercase transform

      const req = new Request(`http://localhost/api/mapping-memory/${upperUuid}`, {
        method: 'DELETE',
      });
      const res = await deleteMappingMemory(req, {
        params: Promise.resolve({ id: upperUuid }),
      });

      // PostgreSQL/PGlite UUID comparison is case-insensitive for standard hex
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);

      // Verify deletion from DB
      const after = await db.select().from(mappingMemory).where(eq(mappingMemory.id, inserted.id));
      expect(after.length).toBe(0);
    });

    it('rejects empty, blank, or malformed UUIDs with 400 Bad Request', async () => {
      const malformed = [
        '',
        '   ',
        '123',
        '12345678-1234-1234-1234',
        '12345678-1234-1234-1234-123456789abcde', // Too long
        '12345678-1234-1234-1234-123456789abg', // Non-hex 'g'
        'undefined',
        'null',
      ];

      for (const badId of malformed) {
        const req = new Request(`http://localhost/api/mapping-memory/${encodeURIComponent(badId)}`, {
          method: 'DELETE',
        });
        const res = await deleteMappingMemory(req, {
          params: Promise.resolve({ id: badId }),
        });

        expect(res.status).toBe(400);
      }
    });

    it('handles idempotent double-deletion cleanly (200 on first, 404 on second)', async () => {
      const db = await getDb();
      const [bp] = await db.select().from(blueprints).limit(1);

      const [inserted] = await db
        .insert(mappingMemory)
        .values({
          blueprintId: bp.id,
          headerHash: 'double-delete-hash',
          mappingJson: { sku: 'SKU_DUP' },
          hitCount: 2,
        })
        .returning();

      const req1 = new Request(`http://localhost/api/mapping-memory/${inserted.id}`, { method: 'DELETE' });
      const res1 = await deleteMappingMemory(req1, { params: Promise.resolve({ id: inserted.id }) });
      expect(res1.status).toBe(200);

      // Second deletion must return 404
      const req2 = new Request(`http://localhost/api/mapping-memory/${inserted.id}`, { method: 'DELETE' });
      const res2 = await deleteMappingMemory(req2, { params: Promise.resolve({ id: inserted.id }) });
      expect(res2.status).toBe(404);
      const err = await res2.json();
      expect(err.error).toBe('Mapping memory entry not found');
    });
  });

  // =========================================================================
  // SECTION 4: Perceptual Deduplication Stress Testing
  // =========================================================================
  describe('4. Perceptual Deduplication Adversarial Scenarios', () => {
    it('flags identical images with Hamming distance 0 and RGB distance 0', async () => {
      // Create a 200x200 patterned image
      const pattern = Buffer.from(
        `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
          <rect width="100" height="200" fill="#336699"/>
          <rect x="100" width="100" height="200" fill="#ff9900"/>
          <circle cx="100" cy="100" r="50" fill="#ffffff"/>
        </svg>`
      );
      const imgBuffer = await sharp(pattern).png().toBuffer();

      const hash1 = await computeDifferenceHash(imgBuffer);
      const hash2 = await computeDifferenceHash(imgBuffer);

      expect(hash1).toBe(hash2);
      expect(hammingDistance(hash1, hash2)).toBe(0);

      const res = await healAndLinkAssets(
        [
          { filename: 'shirt-original.png', buffer: imgBuffer, mimeType: 'image/png' },
          { filename: 'shirt-duplicate.png', buffer: imgBuffer, mimeType: 'image/png' },
        ],
        [],
        mockBlueprint.mediaRules
      );

      expect(res.assets.length).toBe(2);
      expect(res.assets[0].isDuplicate).toBe(false);
      expect(res.assets[1].isDuplicate).toBe(true);
      expect(res.assets[1].duplicateOfFilename).toBe('shirt-original.png');
      expect(res.assets[1].duplicateMetrics?.hammingDistance).toBe(0);
      expect(res.assets[1].duplicateMetrics?.rgbDistance).toBe(0);
      expect(res.duplicatesRemoved).toBe(1);
    });

    it('preserves color-inverted images as distinct due to high Hamming and RGB distance', async () => {
      // Asymmetric pattern with horizontal and vertical gradients
      const baseSvg = Buffer.from(
        `<svg width="200" height="200" xmlns="http://www.w3.org/2000/svg">
          <rect width="100" height="200" fill="#101010"/>
          <rect x="100" width="100" height="200" fill="#e8e8e8"/>
          <circle cx="60" cy="80" r="40" fill="#ffffff"/>
        </svg>`
      );
      const normalImg = await sharp(baseSvg).png().toBuffer();
      const invertedImg = await sharp(normalImg).negate().png().toBuffer();

      const hashNormal = await computeDifferenceHash(normalImg);
      const hashInverted = await computeDifferenceHash(invertedImg);
      const hDist = hammingDistance(hashNormal, hashInverted);

      // Inverted image has inverted gradients, yielding high Hamming distance (> 4)
      expect(hDist).toBeGreaterThan(4);

      const res = await healAndLinkAssets(
        [
          { filename: 'normal.png', buffer: normalImg, mimeType: 'image/png' },
          { filename: 'inverted.png', buffer: invertedImg, mimeType: 'image/png' },
        ],
        [],
        mockBlueprint.mediaRules
      );

      expect(res.assets[0].isDuplicate).toBe(false);
      expect(res.assets[1].isDuplicate).toBe(false);
      expect(res.duplicatesRemoved).toBe(0);
    });

    it('preserves completely solid black vs completely solid white images via RGB distance guard', async () => {
      // Solid black: all pixels 0 -> dHash is 0000000000000000
      const solidBlack = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 0 } },
      })
        .png()
        .toBuffer();

      // Solid white: all pixels 255 -> dHash is also 0000000000000000
      const solidWhite = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 255, b: 255 } },
      })
        .png()
        .toBuffer();

      const hashBlack = await computeDifferenceHash(solidBlack);
      const hashWhite = await computeDifferenceHash(solidWhite);

      // Both flat images have hash 0000000000000000
      expect(hashBlack).toBe('0000000000000000');
      expect(hashWhite).toBe('0000000000000000');
      // Hamming distance alone is 0!
      expect(hammingDistance(hashBlack, hashWhite)).toBe(0);

      // BUT the RGB distance guard must prevent false duplicate collapse!
      const res = await healAndLinkAssets(
        [
          { filename: 'black.png', buffer: solidBlack, mimeType: 'image/png' },
          { filename: 'white.png', buffer: solidWhite, mimeType: 'image/png' },
        ],
        [],
        mockBlueprint.mediaRules
      );

      expect(res.assets[0].isDuplicate).toBe(false);
      expect(res.assets[1].isDuplicate).toBe(false); // MUST NOT be collapsed as duplicate!
      expect(res.duplicatesRemoved).toBe(0);
    });

    it('preserves solid red vs solid blue images via RGB distance guard', async () => {
      const solidRed = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 255, g: 0, b: 0 } },
      })
        .png()
        .toBuffer();

      const solidBlue = await sharp({
        create: { width: 100, height: 100, channels: 3, background: { r: 0, g: 0, b: 255 } },
      })
        .png()
        .toBuffer();

      const res = await healAndLinkAssets(
        [
          { filename: 'red-dress.png', buffer: solidRed, mimeType: 'image/png' },
          { filename: 'blue-dress.png', buffer: solidBlue, mimeType: 'image/png' },
        ],
        [],
        mockBlueprint.mediaRules
      );

      expect(res.assets[0].isDuplicate).toBe(false);
      expect(res.assets[1].isDuplicate).toBe(false); // Preserved color variant
      expect(res.duplicatesRemoved).toBe(0);
    });

    it('isolates 0-byte and corrupt images safely without aborting valid images in batch', async () => {
      const validBuffer = await sharp({
        create: { width: 200, height: 200, channels: 3, background: { r: 100, g: 150, b: 200 } },
      })
        .png()
        .toBuffer();

      const corruptBuffer = Buffer.from('NOT_AN_IMAGE_RANDOM_GARBAGE_BYTES_12345');
      const emptyBuffer = Buffer.alloc(0);

      const res = await healAndLinkAssets(
        [
          { filename: 'corrupt1.jpg', buffer: corruptBuffer, mimeType: 'image/jpeg' },
          { filename: 'valid.png', buffer: validBuffer, mimeType: 'image/png' },
          { filename: 'empty.jpg', buffer: emptyBuffer, mimeType: 'image/jpeg' },
        ],
        [],
        mockBlueprint.mediaRules
      );

      expect(res.assets.length).toBe(3);
      expect(res.corruptAssetsCount).toBe(2);
      expect(res.assets[0].error).toBeDefined();
      expect(res.assets[1].error).toBeUndefined();
      expect(res.assets[1].wasAutoHealed).toBe(true);
      expect(res.assets[2].error).toBeDefined();
    });
  });

  // =========================================================================
  // SECTION 5: End-to-End Client Chaser Integration Stress
  // =========================================================================
  describe('5. Full Client Chaser Workflow with Edge Submissions', () => {
    it('handles submission with messy SKUs, all-missing rows, and custom timeframe', () => {
      const submission: IntakeSubmission = {
        id: 'sub-adversarial-1',
        blueprintId: mockBlueprint.id,
        blueprintSlug: mockBlueprint.slug,
        clientName: 'Adversarial & Sons <script>alert(1)</script>',
        status: 'draft',
        rows: [
          {
            rowId: 'row-hostile-1',
            rowIndex: 1,
            cells: {
              sku: {
                originalRaw: 'SKU/WITH#SPECIAL?CHARS&1',
                value: 'SKU/WITH#SPECIAL?CHARS&1',
                confidence: 0.5,
                status: 'invalid_format',
                reason: 'Format warning',
              },
              title: {
                originalRaw: 'Item 1',
                value: 'Item 1',
                confidence: 1.0,
                status: 'verified',
                reason: 'Valid',
              },
              price: {
                originalRaw: '',
                value: null,
                confidence: 0,
                status: 'missing_required',
                reason: 'Required',
              },
            },
            linkedAssetIds: [],
            isRowVerified: false,
            pendingApproval: true,
          },
        ],
        assets: [],
        stats: createMockStats({ totalRawRows: 1, verifiedRowsCount: 0 }),
        pipelineLogs: [],
        auditEvents: [],
        createdAt: '2026-11-12T00:00:00.000Z',
      };

      const portalUrl = 'https://portal.vistar.tech/intake/custom-1?client=adv';
      const report = generateClientFollowUp(submission, mockBlueprint, portalUrl, {
        timeframeHours: 72,
        referenceDate: new Date('2026-11-12T10:00:00.000Z'),
      });

      expect(report.completionPercent).toBe(0);
      expect(report.verifiedCount).toBe(0);
      expect(report.totalCount).toBe(1);
      expect(report.missingItems.length).toBe(1);

      const missing = report.missingItems[0];
      expect(missing.deepLink).toContain('&focusSku=SKU%2FWITH%23SPECIAL%3FCHARS%261');
      expect(report.markdownText).toContain(missing.deepLink);
      expect(report.whatsappText).toContain(missing.deepLink);
      expect(report.emailText).toContain(missing.deepLink);
      expect(report.deadlineText).toContain('within 72 hours');
    });
  });
});
