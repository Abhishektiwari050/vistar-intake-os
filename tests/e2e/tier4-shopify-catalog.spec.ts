import { test, expect } from '@playwright/test';

test.describe('Tier 4 E2E: Shopify D2C Catalog Onboarding Full Journey', () => {
  test('Complete journey: Magic dropzone raw CSV paste, schema mapping confirm, diff inspector filtering, inline cell fix, QR bridge & multi-target exports', async ({
    page,
  }) => {
    // Step 1: Open public Magic Dropzone for Shopify D2C Catalog
    await page.goto('/intake/shopify-d2c-catalog');
    await expect(page.getByText('Zero-Login Magic Link')).toBeVisible();
    await expect(page.getByRole('heading', { name: /E-Commerce Product Catalog Intake/i })).toBeVisible();

    // Step 2: Switch to Raw CSV / Notes tab and enter dirty vendor catalog data
    await page.getByRole('button', { name: /Raw CSV \/ Notes/i }).click();

    const dirtyCatalogCsv = [
      'Code,Product Title,Category,Selling Price,Inventory Count,GSTIN Number',
      'SKU 201,  SILK SUMMER SHIRT  ,Apparel,Rs. 1,499/-,45,27AABCU9603R1ZM',
      'SKU 202,Cotton Oxford Trouser,Apparel,₹ 2,450.00,12,27AABCU9603R1ZM',
      'SKU 203,Handmade Leather Tote,,3.5k,,27AABCU9603R1ZM',
      'SKU 204,Linen Pocket Square,Accessories,$14.99,60,27AABCU9603R1ZM',
    ].join('\n');

    await page.locator('textarea').fill(dirtyCatalogCsv);

    // Step 3: Trigger Interactive Schema Mapping Step
    await page.getByRole('button', { name: 'Review Column Mapping' }).click();
    await expect(page.getByText(/Step 1 · Interactive Schema Mapping/i)).toBeVisible();
    await expect(page.getByText('SILK SUMMER SHIRT', { exact: true })).toBeVisible();

    // Confirm mapping and initiate normalization
    await page.getByRole('button', { name: /Confirm Mapping & Normalize/i }).click();

    // Step 4: Verify Diff Inspector Table rendered with normalized results
    await expect(page.locator('table').getByText('SKU-201', { exact: true })).toBeVisible();
    await expect(page.locator('table').getByText('Silk Summer Shirt', { exact: true })).toBeVisible();
    await expect(page.locator('table').getByText('SKU-202', { exact: true })).toBeVisible();
    await expect(page.locator('table').getByText('Cotton Oxford Trouser', { exact: true })).toBeVisible();

    // Batch status shows 3/4 ready (SKU-203 has missing inventory)
    await expect(page.getByText('3/4 Ready')).toBeVisible();

    // Step 5: Test Diff Inspector Tab Filtering
    // Filter to "Action Needed (1)"
    await page.getByRole('button', { name: /Action Needed \(1\)/i }).click();
    await expect(page.locator('table').getByText('SKU-203', { exact: true })).toBeVisible();
    await expect(page.locator('table').getByText('SKU-201', { exact: true })).not.toBeVisible();

    // Step 6: Inline Edit missing inventory on SKU-203
    await page.locator('table tbody').getByRole('button', { name: /Missing/i }).first().click();
    const cellInput = page.locator('table tbody input[type="text"]');
    await cellInput.fill('28');
    await cellInput.press('Enter');

    // Verification status now reaches 100% (4/4 Ready)
    await expect(page.getByText('4/4 Ready')).toBeVisible();

    // Step 7: Bulk Approve Auto-Healed Cells
    await page.getByRole('button', { name: /All Rows/i }).click();
    const approveAllBtn = page.getByRole('button', { name: /Approve All Auto-Healed/i });
    if (await approveAllBtn.isVisible()) {
      await approveAllBtn.click();
      await expect(approveAllBtn).not.toBeVisible();
    }

    // Step 8: Mobile QR Bridge Modal Verification
    await page.getByRole('button', { name: 'Mobile QR Bridge' }).click();
    await expect(page.getByText('Mobile Photo Handoff QR')).toBeVisible();
    const qrImg = page.getByAltText('Intake Magic Link QR');
    await expect(qrImg).toBeVisible();
    const qrSrc = await qrImg.getAttribute('src');
    expect(qrSrc).toContain('data:image/png;base64');
    await page.keyboard.press('Escape');
    await expect(page.getByText('Mobile Photo Handoff QR')).not.toBeVisible();

    // Step 9: Multi-Target Export Previews (SQL, JSON)
    await page.getByRole('button', { name: 'PostgreSQL .sql' }).click();
    await expect(page.getByText('SQL Compiled Output Preview')).toBeVisible();
    await expect(page.getByText(/CREATE TABLE IF NOT EXISTS "catalog_products"/i)).toBeVisible();
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Payload .json' }).click();
    await expect(page.getByText('JSON Compiled Output Preview')).toBeVisible();
    await page.keyboard.press('Escape');

    // Step 10: Signed HMAC Webhook Sandbox Dispatch
    await page.getByRole('button', { name: 'Dispatch Webhook' }).click();
    await expect(page.getByText(/Signed Webhook Dispatch/i)).toBeVisible();
    await page.getByRole('button', { name: 'Run HMAC Sandbox Test' }).click();
    await expect(page.getByText(/HTTP 200 · \d+ms/i)).toBeVisible();
    await expect(page.getByText(/Sig: t=/i)).toBeVisible();
    await page.keyboard.press('Escape');
  });
});
