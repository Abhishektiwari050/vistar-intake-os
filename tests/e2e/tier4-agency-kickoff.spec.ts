import { test, expect } from '@playwright/test';

test.describe('Tier 4 E2E: Agency Client Kickoff Full Journey', () => {
  test('Complete journey: Client name entry, unformatted notes paste, schema mapping, chaser generator, inline email fix & verified webhook dispatch', async ({
    page,
  }) => {
    // Step 1: Open public Magic Dropzone for Agency Client Kickoff
    await page.goto('/intake/agency-client-kickoff');
    await expect(page.getByText('Zero-Login Magic Link')).toBeVisible();
    await expect(page.getByRole('heading', { name: /Agency Client Project Kickoff/i })).toBeVisible();

    // Step 2: Set Client / Brand Name
    const clientNameInput = page.getByLabel(/Client \/ Brand Name/i);
    if (await clientNameInput.isVisible()) {
      await clientNameInput.fill('Acme Fintech Corp');
    } else {
      await page.locator('input[type="text"]').first().fill('Acme Fintech Corp');
    }

    // Step 3: Switch to Raw CSV / Notes tab and enter client deliverables notes
    await page.getByRole('button', { name: /Raw CSV \/ Notes/i }).click();

    const agencyNotes = [
      'Ticket ID,Feature / Deliverable,Contact Email,Fee Estimate,Urgency',
      'mod 01,  EXECUTIVE DASHBOARD  ,rahul@acmefin.in,"Rs. 45,000/-",High',
      'mod 02,WhatsApp Notification Relay,priya.ops@acmefin.in,25k,Medium',
      'mod 03,GST Invoice PDF Export,invalid-contact-email,"Rs. 18,500",High',
      'mod 04,Audit Security Matrix,security@acmefin.in,"32,000",Normal',
    ].join('\n');

    await page.locator('textarea').fill(agencyNotes);

    // Step 4: Review and Confirm Interactive Column Mapping
    await page.getByRole('button', { name: 'Review Column Mapping' }).click();
    await expect(page.getByText(/Step 1 · Interactive Schema Mapping/i)).toBeVisible();
    await expect(page.getByText('EXECUTIVE DASHBOARD', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /Confirm Mapping & Normalize/i }).click();

    // Step 5: Verify Normalized Diff Table
    await expect(page.locator('table').getByText('MOD-01', { exact: true })).toBeVisible();
    await expect(page.locator('table').getByText('Executive Dashboard', { exact: true })).toBeVisible();
    await expect(page.locator('table').getByText('MOD-02', { exact: true })).toBeVisible();
    await expect(page.locator('table').getByText('MOD-03', { exact: true })).toBeVisible();

    // Verify partial readiness (3 of 4 rows verified, 1 row has invalid email)
    await expect(page.getByText('3/4 Ready')).toBeVisible();

    // Step 6: Test Automated Client Follow-up Chaser Modal
    await page.getByRole('button', { name: /Request Missing Info/i }).click();
    await expect(page.getByText(/Client Follow-Up Generator/i)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Client Follow-Up Generator \(75% Verified\)/i })
    ).toBeVisible();

    // Check WhatsApp copy
    await page.getByRole('button', { name: 'whatsapp', exact: true }).click();
    await expect(page.getByText(/Acme Fintech Corp/i).first()).toBeVisible();
    await expect(page.getByText(/\*75% verified\*/i)).toBeVisible();

    // Check Email copy
    await page.getByRole('button', { name: 'email', exact: true }).click();
    await expect(page.getByText(/Invalid Client Stakeholder Email/i)).toBeVisible();

    // Close chaser modal
    await page.keyboard.press('Escape');
    await expect(page.getByText(/Client Follow-Up Generator/i)).not.toBeVisible();

    // Step 7: Filter by "Action Needed" and Fix Invalid Email Inline
    await page.getByRole('button', { name: /Action Needed \(1\)/i }).click();
    await expect(page.locator('table').getByText('MOD-03', { exact: true })).toBeVisible();
    await expect(page.locator('table').getByText('MOD-01', { exact: true })).not.toBeVisible();

    // Click on the invalid email cell button and enter correct address
    const invalidCellBtn = page.locator('table tbody').getByRole('button', { name: /invalid-contact-email/i });
    if (await invalidCellBtn.isVisible()) {
      await invalidCellBtn.click();
    } else {
      await page.locator('table tbody td button').first().click();
    }
    const emailInput = page.locator('table tbody input[type="text"]');
    await emailInput.fill('priya.finance@acmefin.in');
    await emailInput.press('Enter');

    // Verification status transitions to 4/4 Ready
    await expect(page.getByText('4/4 Ready')).toBeVisible();

    // Step 8: Return to All Rows and Verify Attribution Pill
    await page.getByRole('button', { name: /All Rows/i }).click();
    await expect(page.getByText(/Normalized & Verified by Vistar Intake OS/i)).toBeVisible();

    // Step 9: Webhook HMAC Sandbox Dispatch
    await page.getByRole('button', { name: 'Dispatch Webhook' }).click();
    await expect(page.getByText(/Signed Webhook Dispatch/i)).toBeVisible();
    await page.getByRole('button', { name: 'Run HMAC Sandbox Test' }).click();
    await expect(page.getByText(/HTTP 200 · \d+ms/i)).toBeVisible();
    await expect(page.getByText(/Sig: t=/i)).toBeVisible();
    await page.keyboard.press('Escape');
  });
});
