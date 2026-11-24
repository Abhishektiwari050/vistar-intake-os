import type { Blueprint, IntakeSubmission } from '@/lib/types/intake';

export interface MissingItemEntry {
  rowId: string;
  identifier: string;
  issues: string[];
  deepLink: string;
  sku?: string;
}

export interface ClientFollowUpOptions {
  timeframeHours?: number;
  referenceDate?: Date;
}

export interface ClientFollowUpReport {
  completionPercent: number;
  verifiedCount: number;
  totalCount: number;
  missingItems: MissingItemEntry[];
  unlinkedRowsCount: number;
  emailText: string;
  whatsappText: string;
  markdownText: string;
  timeframeHours: number;
  deadlineText: string;
}

/**
 * Builds a direct SKU deep-link appending ?focusSku= or &focusSku= safely encoded.
 */
export function buildSkuDeepLink(baseUrl: string, skuOrIdentifier: string): string {
  const safeSku = encodeURIComponent(skuOrIdentifier);
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}focusSku=${safeSku}`;
}

/**
 * Formats a human-readable resolution deadline string based on timeframe hours.
 * Example: "within 48 hours (by Thursday, 4:00 PM)"
 */
export function formatDeadline(hours: number = 48, baseDate: Date = new Date()): string {
  const safeHours = typeof hours === 'number' && Number.isFinite(hours) && hours > 0 ? hours : 48;
  const targetDate = new Date(baseDate.getTime() + safeHours * 3600 * 1000);

  const weekday = targetDate.toLocaleDateString('en-US', { weekday: 'long' });
  const time = targetDate.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });

  return `within ${safeHours} hours (by ${weekday}, ${time})`;
}

export function generateClientFollowUp(
  submission: IntakeSubmission,
  blueprint: Blueprint,
  submissionUrl: string,
  optionsOrHours?: ClientFollowUpOptions | number
): ClientFollowUpReport {
  const options: ClientFollowUpOptions =
    typeof optionsOrHours === 'number'
      ? { timeframeHours: optionsOrHours }
      : optionsOrHours || {};

  const timeframeHours =
    typeof options.timeframeHours === 'number' &&
    Number.isFinite(options.timeframeHours) &&
    options.timeframeHours > 0
      ? options.timeframeHours
      : 48;

  const referenceDate = options.referenceDate || new Date();
  const deadlineText = formatDeadline(timeframeHours, referenceDate);

  const totalCount = submission.rows.length;
  const verifiedCount = submission.rows.filter((r) => r.isRowVerified).length;
  const completionPercent = totalCount > 0 ? Math.round((verifiedCount / totalCount) * 100) : 100;

  const linkedRowIds = new Set(
    submission.assets
      .filter((a) => !a.isDuplicate && !a.error && a.linkedRowId)
      .map((a) => a.linkedRowId!)
  );

  const missingItems: MissingItemEntry[] = [];
  let unlinkedRowsCount = 0;

  for (const row of submission.rows) {
    const rawSku = row.cells.sku?.value;
    const idCell =
      rawSku ||
      row.cells.module_id?.value ||
      row.cells.title?.value ||
      row.cells.feature_name?.value ||
      row.rowId;
    const issues: string[] = [];

    for (const rule of blueprint.schemaRules) {
      const cell = row.cells[rule.key];
      if (!cell) continue;
      if (cell.status === 'missing_required') {
        issues.push(`Missing ${rule.label}`);
      } else if (cell.status === 'invalid_format') {
        issues.push(`Invalid ${rule.label} ("${cell.value}")`);
      }
    }

    if (submission.assets.length > 0 && !linkedRowIds.has(row.rowId)) {
      unlinkedRowsCount++;
      issues.push('Missing linked product/brand image');
    }

    if (issues.length > 0) {
      const identifier = String(idCell);
      missingItems.push({
        rowId: row.rowId,
        identifier,
        sku: rawSku ? String(rawSku) : undefined,
        issues,
        deepLink: buildSkuDeepLink(submissionUrl, identifier),
      });
    }
  }

  const markdownBullets =
    missingItems.length > 0
      ? missingItems
          .map((m) => `- **[${m.identifier}](${m.deepLink})**: ${m.issues.join(', ')}`)
          .join('\n')
      : '- All items verified.';

  const plainBulletsWithLinks =
    missingItems.length > 0
      ? missingItems
          .map((m) => `* ${m.identifier} (${m.deepLink}): ${m.issues.join(', ')}`)
          .join('\n')
      : '* All items verified.';

  const emailText = [
    `Subject: Action Needed: Complete Remaining Items for ${submission.clientName} Onboarding (${completionPercent}% Verified)`,
    '',
    `Hi ${submission.clientName} Team,`,
    '',
    `Our automated intake portal has already verified and formatted ${verifiedCount} of ${totalCount} items (${completionPercent}% complete) for ${blueprint.name}.`,
    '',
    `To finalize the remaining package ${deadlineText}, please update the following item(s):`,
    plainBulletsWithLinks,
    '',
    `You can resolve these directly in 30 seconds with no login required here:`,
    submissionUrl,
    '',
    `Thank you,`,
    `Operations Engineering`,
  ].join('\n');

  const whatsappText = [
    `Hi ${submission.clientName} team!`,
    ``,
    `Your onboarding package (${blueprint.name}) is *${completionPercent}% verified* (${verifiedCount}/${totalCount} ready).`,
    ``,
    `Please check these remaining items ${deadlineText}:`,
    plainBulletsWithLinks,
    ``,
    `Update them directly via this 1-click link (no login needed):`,
    submissionUrl,
  ].join('\n');

  const markdownText = [
    `### Client Follow-up Checklist: ${submission.clientName}`,
    `**Status:** ${completionPercent}% Complete (${verifiedCount}/${totalCount} rows verified)`,
    `**Deadline:** ${deadlineText}`,
    '',
    markdownBullets,
    '',
    `[Open Verification Portal](${submissionUrl})`,
  ].join('\n');

  return {
    completionPercent,
    verifiedCount,
    totalCount,
    missingItems,
    unlinkedRowsCount,
    emailText,
    whatsappText,
    markdownText,
    timeframeHours,
    deadlineText,
  };
}
