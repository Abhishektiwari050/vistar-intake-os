import { z } from 'zod';
import { normalizeHeaderToken } from '@/lib/excel/sanitizer';
import type {
  Blueprint,
  ColumnMappingPreview,
  NormalizedCell,
  NormalizedRow,
  SchemaFieldRule,
} from '@/lib/types/intake';

const EMAIL_SCHEMA = z.string().email();
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const URL_SCHEMA = z.string().url();

/**
 * Computes Jaccard + substring token similarity between an incoming spreadsheet header
 * and a target blueprint schema field.
 */
export function scoreHeaderMatch(rawHeader: string, rule: SchemaFieldRule): number {
  const normRaw = normalizeHeaderToken(rawHeader);
  if (!normRaw) return 0;

  const candidates = [rule.key, rule.label, ...rule.aliases].map(normalizeHeaderToken);
  if (candidates.includes(normRaw)) return 1.0;

  let best = 0;
  const rawTokens = new Set(normRaw.split('_').filter(Boolean));
  for (const cand of candidates) {
    if (!cand) continue;
    if (normRaw.includes(cand) || cand.includes(normRaw)) {
      best = Math.max(best, 0.85);
    }
    const candTokens = new Set(cand.split('_').filter(Boolean));
    const intersection = [...rawTokens].filter((t) => candTokens.has(t)).length;
    const union = new Set([...rawTokens, ...candTokens]).size;
    if (union > 0) {
      best = Math.max(best, (intersection / union) * 0.8);
    }
  }
  return best;
}

/**
 * Uses Gemini API (when GEMINI_API_KEY is present) to map ambiguous column headers,
 * falling back cleanly to deterministic semantic alias scoring.
 */
export async function resolveColumnMapping(
  rawHeaders: string[],
  schemaRules: SchemaFieldRule[],
  cachedMapping?: Record<string, string> | null
): Promise<{
  mapping: Record<string, string>;
  confidences: Record<string, number>;
  usedAi: boolean;
  usedMemory: boolean;
}> {
  if (cachedMapping && Object.keys(cachedMapping).length > 0) {
    const confidences: Record<string, number> = {};
    for (const k of Object.keys(cachedMapping)) {
      confidences[k] = 1.0;
    }
    return { mapping: cachedMapping, confidences, usedAi: false, usedMemory: true };
  }

  const mapping: Record<string, string> = {};
  const confidences: Record<string, number> = {};
  const assignedRawHeaders = new Set<string>();

  const pairs: Array<{ raw: string; target: string; score: number }> = [];
  for (const rule of schemaRules) {
    for (const raw of rawHeaders) {
      const score = scoreHeaderMatch(raw, rule);
      if (score >= 0.35) {
        pairs.push({ raw, target: rule.key, score });
      }
    }
  }

  pairs.sort((a, b) => b.score - a.score);
  for (const p of pairs) {
    if (!mapping[p.target] && !assignedRawHeaders.has(p.raw)) {
      mapping[p.target] = p.raw;
      confidences[p.target] = p.score;
      assignedRawHeaders.add(p.raw);
    }
  }

  const unmappedRequired = schemaRules.filter((r) => r.required && !mapping[r.key]);
  const apiKey = process.env.GEMINI_API_KEY;
  if (unmappedRequired.length > 0 && apiKey) {
    try {
      const prompt = `Map the raw spreadsheet headers ${JSON.stringify(rawHeaders)} to the target schema keys ${JSON.stringify(
        schemaRules.map((r) => ({ key: r.key, label: r.label, aliases: r.aliases }))
      )}. Return strict JSON object mapping targetKey -> rawHeaderName.`;

      const resp = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: 'application/json' },
          }),
        }
      );

      if (resp.ok) {
        const json = await resp.json();
        const rawText = json?.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleanedJson = rawText
          .replace(/^```(?:json)?\s*/i, '')
          .replace(/\s*```$/, '')
          .trim();
        if (cleanedJson) {
          const parsed = JSON.parse(cleanedJson) as Record<string, string>;
          for (const rule of schemaRules) {
            if (
              !mapping[rule.key] &&
              parsed[rule.key] &&
              rawHeaders.includes(parsed[rule.key]) &&
              !assignedRawHeaders.has(parsed[rule.key])
            ) {
              mapping[rule.key] = parsed[rule.key];
              confidences[rule.key] = 0.88;
              assignedRawHeaders.add(parsed[rule.key]);
            }
          }
          return { mapping, confidences, usedAi: true, usedMemory: false };
        }
      }
    } catch {
      // Deterministic mapping stays active on API fallback
    }
  }

  return { mapping, confidences, usedAi: false, usedMemory: false };
}

/**
 * Generates column preview entries (raw header, predicted target key, confidence, 3 sample values)
 * for the Interactive Column Mapping Override step.
 */
export function buildColumnMappingPreview(
  headers: string[],
  rawRows: Array<Record<string, string>>,
  mapping: Record<string, string>,
  confidences: Record<string, number>
): ColumnMappingPreview[] {
  const inverseMap = new Map<string, { targetKey: string; confidence: number }>();
  for (const [targetKey, rawHeader] of Object.entries(mapping)) {
    inverseMap.set(rawHeader, {
      targetKey,
      confidence: confidences[targetKey] ?? 0.9,
    });
  }

  return headers.map((h) => {
    const match = inverseMap.get(h);
    const samples = rawRows
      .slice(0, 3)
      .map((r) => r[h])
      .filter((v) => v !== undefined && v !== '');
    return {
      rawHeader: h,
      predictedTargetKey: match?.targetKey || null,
      confidence: match?.confidence || 0,
      sampleValues: samples,
    };
  });
}

/**
 * Cleans and validates an individual raw cell against its target Blueprint FieldRule.
 */
export function normalizeCell(rawValue: string | undefined, rule: SchemaFieldRule): NormalizedCell {
  const originalRaw = rawValue !== undefined && rawValue !== null ? String(rawValue).trim() : '';

  if (!originalRaw) {
    return {
      value: null,
      originalRaw: null,
      status: rule.required ? 'missing_required' : 'verified',
      reason: rule.required ? `Missing mandatory ${rule.label}` : undefined,
      confidence: rule.required ? 0 : 1,
    };
  }

  switch (rule.type) {
    case 'currency': {
      // Detect leading/accounting negative indicators BEFORE stripping currency symbols (while ignoring trailing "/-")
      const withoutTrailingDash = originalRaw.replace(/\/-\s*$/, '').trim();
      const isAccountingNeg = /^\(.*\)$/.test(withoutTrailingDash);
      const hasLeadingNeg = /^-\s*/.test(withoutTrailingDash) || /\b(?:rs|inr|usd|eur|gbp)\.?\s*-/i.test(withoutTrailingDash);

      if (isAccountingNeg || hasLeadingNeg) {
        return {
          value: originalRaw,
          originalRaw,
          status: 'invalid_format',
          reason: `Negative currency value "${originalRaw}" is invalid`,
          confidence: 0.1,
        };
      }

      const cleanedLower = withoutTrailingDash.toLowerCase();
      let multiplier = 1;
      if (/\b\d+(?:\.\d+)?\s*k\b/i.test(cleanedLower)) multiplier = 1000;
      else if (/\b\d+(?:\.\d+)?\s*(?:lakh|lakhs|lac)\b/i.test(cleanedLower)) multiplier = 100000;
      else if (/\b\d+(?:\.\d+)?\s*(?:crore|crores|cr)\b/i.test(cleanedLower)) multiplier = 10000000;

      const numericStr = cleanedLower
        .replace(/rs\.?|inr|usd|eur|gbp|[₹$€£,\s]/gi, '')
        .replace(/(k|lakhs?|lac|crores?|cr)$/i, '')
        .trim();

      const num = Number(numericStr);
      if (Number.isNaN(num) || !Number.isFinite(num) || numericStr === '' || num > 1e14) {
        return {
          value: originalRaw,
          originalRaw,
          status: 'invalid_format',
          reason: `Could not parse valid currency from "${originalRaw}"`,
          confidence: 0.2,
        };
      }

      const finalNum = Math.round(num * multiplier * 100) / 100;
      const wasChanged = String(finalNum) !== originalRaw;
      return {
        value: finalNum,
        originalRaw,
        status: wasChanged ? 'ai_healed' : 'verified',
        reason: wasChanged ? `Normalized currency "${originalRaw}" -> ${finalNum}` : undefined,
        confidence: wasChanged ? 0.96 : 1,
      };
    }

    case 'number': {
      const unitStripped = originalRaw
        .replace(/\b(pcs|pieces|units|unit|qty|nos|items)\b/gi, '')
        .replace(/[,\s]/g, '')
        .trim();
      const num = Number(unitStripped);
      if (Number.isNaN(num) || !Number.isFinite(num) || unitStripped === '' || num < 0 || num > 1e14) {
        return {
          value: originalRaw,
          originalRaw,
          status: 'invalid_format',
          reason: num < 0 ? `Negative quantity "${originalRaw}" not permitted` : `Expected valid number, got "${originalRaw}"`,
          confidence: 0.2,
        };
      }
      const wasChanged = String(num) !== originalRaw;
      return {
        value: num,
        originalRaw,
        status: wasChanged ? 'ai_healed' : 'verified',
        reason: wasChanged ? `Extracted number from "${originalRaw}"` : undefined,
        confidence: wasChanged ? 0.95 : 1,
      };
    }

    case 'sku': {
      const normalizedSku = originalRaw
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      if (!normalizedSku) {
        return {
          value: originalRaw,
          originalRaw,
          status: 'invalid_format',
          reason: `SKU "${originalRaw}" contains no alphanumeric characters`,
          confidence: 0.1,
        };
      }
      const wasChanged = normalizedSku !== originalRaw;
      return {
        value: normalizedSku,
        originalRaw,
        status: wasChanged ? 'ai_healed' : 'verified',
        reason: wasChanged ? `Standardized SKU code "${originalRaw}" -> "${normalizedSku}"` : undefined,
        confidence: wasChanged ? 0.97 : 1,
      };
    }

    case 'email': {
      const cleanedEmail = originalRaw.toLowerCase().trim();
      const valid = EMAIL_SCHEMA.safeParse(cleanedEmail).success;
      if (!valid) {
        return {
          value: originalRaw,
          originalRaw,
          status: 'invalid_format',
          reason: `Invalid email address "${originalRaw}"`,
          confidence: 0.1,
        };
      }
      const wasChanged = cleanedEmail !== originalRaw;
      return {
        value: cleanedEmail,
        originalRaw,
        status: wasChanged ? 'ai_healed' : 'verified',
        reason: wasChanged ? 'Trimmed and lowercased email' : undefined,
        confidence: 1,
      };
    }

    case 'gstin': {
      const cleanedGst = originalRaw.toUpperCase().replace(/[\s-]+/g, '');
      const statePrefix = Number(cleanedGst.slice(0, 2));
      const validState = !Number.isNaN(statePrefix) && ((statePrefix >= 1 && statePrefix <= 38) || statePrefix === 97 || statePrefix === 99);
      const valid = GSTIN_REGEX.test(cleanedGst) && validState;
      if (!valid) {
        return {
          value: originalRaw,
          originalRaw,
          status: 'invalid_format',
          reason: `Invalid 15-character GSTIN "${originalRaw}"`,
          confidence: 0.15,
        };
      }
      const wasChanged = cleanedGst !== originalRaw;
      return {
        value: cleanedGst,
        originalRaw,
        status: wasChanged ? 'ai_healed' : 'verified',
        reason: wasChanged ? 'Uppercased and stripped separators in GSTIN' : undefined,
        confidence: 1,
      };
    }

    case 'url': {
      const lower = originalRaw.toLowerCase();
      if (/^(javascript|data|vbscript|file):/i.test(lower)) {
        return {
          value: originalRaw,
          originalRaw,
          status: 'invalid_format',
          reason: 'Unsafe URL protocol rejected',
          confidence: 0,
        };
      }
      let candidate = originalRaw;
      if (!/^https?:\/\//i.test(candidate) && candidate.includes('.')) {
        candidate = `https://${candidate}`;
      }
      const valid = URL_SCHEMA.safeParse(candidate).success && /^https?:\/\//i.test(candidate);
      if (!valid) {
        return {
          value: originalRaw,
          originalRaw,
          status: 'invalid_format',
          reason: `Malformed HTTP/HTTPS URL "${originalRaw}"`,
          confidence: 0.2,
        };
      }
      const wasChanged = candidate !== originalRaw;
      return {
        value: candidate,
        originalRaw,
        status: wasChanged ? 'ai_healed' : 'verified',
        reason: wasChanged ? 'Prepended https:// protocol' : undefined,
        confidence: wasChanged ? 0.92 : 1,
      };
    }

    case 'string':
    default: {
      const collapsed = originalRaw.replace(/\s+/g, ' ').trim();
      let formatted = collapsed;
      if (collapsed.length > 4 && collapsed === collapsed.toUpperCase() && /[A-Z]/.test(collapsed)) {
        formatted = collapsed.toLowerCase().replace(/\b\w/g, (ch) => ch.toUpperCase());
      }
      const wasChanged = formatted !== originalRaw;
      return {
        value: formatted,
        originalRaw,
        status: wasChanged ? 'ai_healed' : 'verified',
        reason: wasChanged ? `Formatted string casing/spacing from "${originalRaw}"` : undefined,
        confidence: wasChanged ? 0.94 : 1,
      };
    }
  }
}

/**
 * Normalizes an entire sanitized table against a Blueprint's Schema Rules.
 */
export function normalizeDataset(
  rawRows: Array<Record<string, string>>,
  blueprint: Blueprint,
  columnMapping: Record<string, string>
): { rows: NormalizedRow[]; healedCellsCount: number; verifiedRowsCount: number } {
  let healedCellsCount = 0;
  let verifiedRowsCount = 0;

  const rows: NormalizedRow[] = rawRows.map((rawRow, idx) => {
    const cells: Record<string, NormalizedCell> = {};
    let isRowVerified = true;

    for (const rule of blueprint.schemaRules) {
      const sourceCol = columnMapping[rule.key];
      const rawVal = sourceCol ? rawRow[sourceCol] : undefined;
      const cell = normalizeCell(rawVal, rule);
      cells[rule.key] = cell;

      if (cell.status === 'ai_healed') {
        healedCellsCount++;
      }
      if (cell.status === 'missing_required' || cell.status === 'invalid_format') {
        isRowVerified = false;
      }
    }

    if (isRowVerified) {
      verifiedRowsCount++;
    }

    return {
      rowIndex: idx,
      rowId: `row_${idx + 1}`,
      cells,
      linkedAssetIds: [],
      isRowVerified,
      pendingApproval: !isRowVerified,
    };
  });

  return { rows, healedCellsCount, verifiedRowsCount };
}
