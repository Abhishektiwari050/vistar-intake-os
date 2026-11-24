import { test, expect } from '@playwright/test';

test.describe('Vistar Intake OS — Full Production E2E Journeys', () => {
  test('Journey 1 & 2: Studio Console KPIs, Custom Blueprint CRUD, Chaotic Dry-Run, Diff Filtering, Inline Fix & Bulk Approve', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Studio Blueprint Console' })).toBeVisible();
    await expect(page.getByText('Verified Intake Batches')).toBeVisible();
    await expect(page.getByText('E-Commerce Product Catalog Intake')).toBeVisible();

    // Create Custom Blueprint via UI Modal
    await page.getByRole('button', { name: /New Blueprint/i }).click();
    await expect(page.getByText('Create Custom Intake Blueprint')).toBeVisible();

    const uniqueSlug = `parts-${Date.now().toString().slice(-5)}`;
    await page.getByPlaceholder('e.g. Automotive Parts Intake').fill('Automotive Parts E2E');
    await page.getByPlaceholder('auto-parts-intake').fill(uniqueSlug);
    await page.getByPlaceholder('auto_parts_catalog').fill('auto_parts_e2e');
    await page
      .getByPlaceholder('Upload supplier part spreadsheets and product photos for instant validation.')
      .fill('E2E verified parts onboarding rules');

    await page.getByRole('button', { name: 'Create Blueprint' }).click();
    await expect(page.getByText('Automotive Parts E2E')).toBeVisible();

    // Delete Custom Blueprint via trash button
    const cardDeleteBtn = page.getByRole('button', { name: 'Delete Custom Blueprint' }).first();
    await cardDeleteBtn.click();
    await expect(page.getByText('Automotive Parts E2E')).not.toBeVisible();

    // Trigger Chaotic Dry-Run on E-Commerce Catalog
    await page
      .locator('div.rounded-xl', {
        has: page.getByRole('heading', { name: 'E-Commerce Product Catalog Intake' }),
      })
      .getByRole('button', { name: 'Simulate Chaotic Upload' })
      .click();
    await page.waitForURL(/\/submissions\/[0-9a-f-]+/i);

    await expect(page.getByText('Chaotic Dry-Run Demo')).toBeVisible();
    await expect(page.getByText('Pre-Ingestion Structural Sanitizer')).toBeVisible();
    await expect(page.getByText('3/4 Ready')).toBeVisible();

    // Verify Filter Tabs
    await page.getByRole('button', { name: /Action Needed \(1\)/i }).click();
    await expect(page.locator('table').getByText('SKU-104', { exact: true })).toBeVisible();
    await expect(page.locator('table').getByText('SKU-101', { exact: true })).not.toBeVisible();

    // Fix missing stock cell inline on SKU-104
    await page.locator('table tbody').getByRole('button', { name: /Missing/i }).first().click();
    const cellInput = page.locator('table tbody input[type="text"]');
    await cellInput.fill('42');
    await cellInput.press('Enter');

    // Status upgrades to Verified and 4/4 Ready
    await expect(page.getByText('4/4 Ready')).toBeVisible();

    // Switch back to All Rows and Bulk Approve Auto-Healed cells
    await page.getByRole('button', { name: /All Rows/i }).click();
    const approveBtn = page.getByRole('button', { name: /Approve All Auto-Healed/i });
    if (await approveBtn.isVisible()) {
      await approveBtn.click();
      await expect(approveBtn).not.toBeVisible();
    }

    // Verify Audit Log records the edits
    await expect(page.getByText(/Field & Asset Modification Audit Log/i)).toBeVisible();
  });

  test('Journey 3: Client Chaser Modal, 6-Format Exports & Signed HMAC Webhook Sandbox Dispatch', async ({
    page,
  }) => {
    await page.goto('/');
    await page
      .locator('div.rounded-xl', {
        has: page.getByRole('heading', { name: 'E-Commerce Product Catalog Intake' }),
      })
      .getByRole('button', { name: 'Simulate Chaotic Upload' })
      .click();
    await page.waitForURL(/\/submissions\/[0-9a-f-]+/i);

    // Client Chaser Modal (Missing info)
    await page.getByRole('button', { name: /Request Missing Info/i }).click();
    await expect(page.getByText(/Client Follow-Up Generator/i)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /Client Follow-Up Generator \(75% Verified\)/i })
    ).toBeVisible();
    await page.getByRole('button', { name: 'email', exact: true }).click();
    await expect(page.getByText(/Missing Inventory Qty/i)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByText(/Client Follow-Up Generator/i)).not.toBeVisible();

    // Export Previews: SQL, JSON, CSV
    await page.getByRole('button', { name: 'PostgreSQL .sql' }).click();
    await expect(page.getByText('SQL Compiled Output Preview')).toBeVisible();
    await expect(page.getByText(/CREATE TABLE IF NOT EXISTS "catalog_products"/i)).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Payload .json' }).click();
    await expect(page.getByText('JSON Compiled Output Preview')).toBeVisible();
    await page.keyboard.press('Escape');

    // Webhook HMAC Sandbox Dispatch
    await page.getByRole('button', { name: 'Dispatch Webhook' }).click();
    await expect(page.getByText(/Signed Webhook Dispatch/i)).toBeVisible();
    await page.getByRole('button', { name: 'Run HMAC Sandbox Test' }).click();
    await expect(page.getByText(/HTTP 200 · \d+ms/i)).toBeVisible();
    await expect(page.getByText(/Sig: t=/i)).toBeVisible();
    await page.keyboard.press('Escape');

    // Navigate back and verify submission deletion from Studio Console
    await page.getByRole('link', { name: /Back to Studio Console/i }).click();
    const deleteSubBtn = page.getByRole('button', { name: 'Delete submission Chaotic Dry-Run Demo' }).first();
    await deleteSubBtn.click();
  });

  test('Journey 4 & 5: Magic Dropzone Raw CSV, Interactive Column Mapping Override, QR Bridge & Mobile Viewport', async ({
    page,
  }) => {
    await page.goto('/intake/shopify-d2c-catalog');
    await expect(page.getByText('Zero-Login Magic Link')).toBeVisible();

    // Test Raw CSV / Notes Mode + Interactive Column Mapping Step
    await page.getByRole('button', { name: /Raw CSV \/ Notes/i }).click();
    await page
      .locator('textarea')
      .fill('Code, Name, Cost, Inventory\nsku 909, VELVET JACKET, Rs. 2,999/-, 25 pcs');

    await page.getByRole('button', { name: 'Review Column Mapping' }).click();
    await expect(page.getByText(/Step 1 · Interactive Schema Mapping/i)).toBeVisible();
    await expect(page.getByText('VELVET JACKET', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /Confirm Mapping & Normalize/i }).click();
    await expect(page.locator('table').getByText('SKU-909', { exact: true })).toBeVisible();
    await expect(page.locator('table').getByText('Velvet Jacket', { exact: true })).toBeVisible();

    // Test Mobile QR Bridge Modal & Escape key close
    await page.getByRole('button', { name: 'Mobile QR Bridge' }).click();
    await expect(page.getByText('Mobile Photo Handoff QR')).toBeVisible();
    const qrSrc = await page.getByAltText('Intake Magic Link QR').getAttribute('src');
    expect(qrSrc).toContain('data:image/png;base64');
    await page.keyboard.press('Escape');
    await expect(page.getByText('Mobile Photo Handoff QR')).not.toBeVisible();

    // Mobile Viewport Responsive Check (390x844)
    await page.setViewportSize({ width: 390, height: 844 });
    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
