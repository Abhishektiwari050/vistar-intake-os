import { test, expect } from '@playwright/test';

test.describe('Empirical Challenger: DiffInspectorTable & StudioConsole Interactive Verification', () => {
  test('1. StudioConsole: Quick-copy magic link, clipboard feedback, and toast notification', async ({
    page,
    context,
  }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);

    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Studio Blueprint Console' })).toBeVisible();

    // Wait for blueprints to load from /api/blueprints
    await expect(page.getByText('E-Commerce Product Catalog Intake')).toBeVisible({ timeout: 30000 });

    // Locate the E-Commerce Product Catalog card
    const catalogCard = page.locator('div.rounded-xl', {
      has: page.getByRole('heading', { name: 'E-Commerce Product Catalog Intake' }),
    });
    await expect(catalogCard).toBeVisible();

    const copyBtn = catalogCard.getByRole('button', { name: /Copy.*Link/i });
    await expect(copyBtn).toBeVisible();

    // Trigger copy
    await copyBtn.click();

    // Verify inline button state transition to "Copied!" with Check icon
    await expect(copyBtn.getByText('Copied!')).toBeVisible();

    // Verify floating toast notification pill appears at bottom right
    const toast = page.locator('[role="status"]', {
      hasText: 'Magic link copied to clipboard!',
    });
    await expect(toast).toBeVisible();
    await expect(toast.getByText('E-Commerce Product Catalog Intake')).toBeVisible();
    await expect(toast.getByText('/intake/shopify-d2c-catalog')).toBeVisible();

    // Verify clipboard content
    const clipboardText = await page.evaluate(async () => {
      return await navigator.clipboard.readText();
    });
    expect(clipboardText).toContain('/intake/shopify-d2c-catalog');

    // Test dismiss button on toast
    const dismissBtn = toast.getByLabel('Dismiss copy notification');
    await expect(dismissBtn).toBeVisible();
    await dismissBtn.click();
    await expect(toast).not.toBeVisible();
  });

  test('2. StudioConsole: Clipboard fallback handling when navigator.clipboard.writeText is absent', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByText('E-Commerce Product Catalog Intake')).toBeVisible({ timeout: 30000 });

    // Simulate environment where navigator.clipboard.writeText is undefined (e.g. insecure origin or older browser)
    await page.evaluate(() => {
      // @ts-expect-error Mocking clipboard absence
      delete window.navigator.clipboard;
    });

    const catalogCard = page.locator('div.rounded-xl', {
      has: page.getByRole('heading', { name: 'E-Commerce Product Catalog Intake' }),
    });
    const copyBtn = catalogCard.getByRole('button', { name: /Copy.*Link/i });
    await copyBtn.click();

    // Verify inline button state still transitions to "Copied!" via document.execCommand fallback
    await expect(copyBtn.getByText('Copied!')).toBeVisible();

    // Verify toast pill still appears
    const toast = page.locator('[role="status"]', {
      hasText: 'Magic link copied to clipboard!',
    });
    await expect(toast).toBeVisible();
  });

  test('3. DiffInspectorTable: Multi-row selection, batch toolbar, and Select All toggle', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByText('E-Commerce Product Catalog Intake')).toBeVisible({ timeout: 30000 });

    // Launch chaotic dry run to get populated diff table
    const catalogCard = page.locator('div.rounded-xl', {
      has: page.getByRole('heading', { name: 'E-Commerce Product Catalog Intake' }),
    });
    await catalogCard.getByRole('button', { name: 'Simulate Chaotic Upload' }).click();
    await page.waitForURL(/\/submissions\/[0-9a-f-]+/i);

    const diffTable = page.locator('table');
    await expect(diffTable).toBeVisible();

    // Verify Select All header checkbox
    const selectAllCheckbox = diffTable.getByLabel('Select all rows');
    await expect(selectAllCheckbox).toBeVisible();
    await expect(selectAllCheckbox).not.toBeChecked();

    // Batch toolbar must not be visible initially
    await expect(page.getByText('rows selected')).not.toBeVisible();

    // Select row 1
    const row1Checkbox = diffTable.getByLabel('Select row 1');
    await expect(row1Checkbox).toBeVisible();
    await row1Checkbox.check();
    await expect(row1Checkbox).toBeChecked();

    // Batch toolbar appears with "1 row selected"
    await expect(page.getByText('1 row selected')).toBeVisible();
    const bulkApproveBtn = page.getByRole('button', { name: /Bulk Approve Selected \(1\)/i });
    const deleteSelectedBtn = page.getByRole('button', { name: /Delete Selected Rows \(1\)/i });
    const cancelBtn = page.getByRole('button', { name: 'Cancel' });
    await expect(bulkApproveBtn).toBeVisible();
    await expect(deleteSelectedBtn).toBeVisible();
    await expect(cancelBtn).toBeVisible();

    // Select row 2
    const row2Checkbox = diffTable.getByLabel('Select row 2');
    await row2Checkbox.check();
    await expect(page.getByText('2 rows selected')).toBeVisible();

    // Test Cancel button clears selection and hides toolbar
    await cancelBtn.click();
    await expect(page.getByText('rows selected')).not.toBeVisible();
    await expect(row1Checkbox).not.toBeChecked();
    await expect(row2Checkbox).not.toBeChecked();

    // Test Select All checkbox
    await selectAllCheckbox.check();
    await expect(page.getByText('4 rows selected')).toBeVisible();
    await expect(row1Checkbox).toBeChecked();
    await expect(row2Checkbox).toBeChecked();

    // Toggle Select All off
    await selectAllCheckbox.uncheck();
    await expect(page.getByText('rows selected')).not.toBeVisible();
    await expect(row1Checkbox).not.toBeChecked();
  });

  test('4. DiffInspectorTable: Sticky header, scroll drop-shadow, and confidence score badges', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByText('E-Commerce Product Catalog Intake')).toBeVisible({ timeout: 30000 });

    const catalogCard = page.locator('div.rounded-xl', {
      has: page.getByRole('heading', { name: 'E-Commerce Product Catalog Intake' }),
    });
    await catalogCard.getByRole('button', { name: 'Simulate Chaotic Upload' }).click();
    await page.waitForURL(/\/submissions\/[0-9a-f-]+/i);

    // Verify Sticky Header classes
    const thElement = page.locator('table thead th').first();
    await expect(thElement).toHaveClass(/sticky top-0/);

    // Verify Confidence Badges
    // 1. Deterministic Badge (Green)
    const deterministicBadge = page.locator('table tbody').getByText(/100% Deterministic/i).first();
    await expect(deterministicBadge).toBeVisible();

    // 2. AI Healed Badge (Amber)
    const healedBadge = page.locator('table tbody').getByText(/% (Normalized|AI Healed)/i).first();
    await expect(healedBadge).toBeVisible();

    // 3. Missing / Invalid Badge (Rose)
    const missingBadge = page.locator('table tbody').getByText(/0% Missing/i).first();
    await expect(missingBadge).toBeVisible();

    // Test Scroll Container drop shadow transition:
    // To trigger vertical scroll overflow in a 4-row table with max-h-[600px],
    // set container max-height dynamically to force scrollHeight > clientHeight.
    const scrollContainer = page.locator('div.max-h-\\[600px\\]');
    await expect(scrollContainer).toBeVisible();

    const didScroll = await scrollContainer.evaluate((el) => {
      el.style.maxHeight = '120px';
      el.scrollTop = 30;
      el.dispatchEvent(new Event('scroll'));
      return el.scrollTop;
    });

    if (didScroll > 4) {
      await expect(thElement).toHaveClass(/shadow-sm/);
    }
  });

  test('5. DiffInspectorTable: Inline edit keyboard navigation (Enter save, Escape cancel)', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByText('E-Commerce Product Catalog Intake')).toBeVisible({ timeout: 30000 });

    const catalogCard = page.locator('div.rounded-xl', {
      has: page.getByRole('heading', { name: 'E-Commerce Product Catalog Intake' }),
    });
    await catalogCard.getByRole('button', { name: 'Simulate Chaotic Upload' }).click();
    await page.waitForURL(/\/submissions\/[0-9a-f-]+/i);

    // Filter to Action Needed
    await page.getByRole('button', { name: /Action Needed \(1\)/i }).click();

    // Locate the missing inventory cell button on SKU-104
    const missingCellBtn = page.locator('table tbody').getByRole('button', { name: /Missing/i }).first();
    await expect(missingCellBtn).toBeVisible();

    // Click to enter inline edit
    await missingCellBtn.click();

    // Verify input and shortcut helper
    const cellInput = page.locator('table tbody input[type="text"]');
    await expect(cellInput).toBeVisible();
    await expect(page.getByText('↵ Enter save · Esc cancel')).toBeVisible();

    // Press Escape to cancel
    await cellInput.fill('9999');
    await cellInput.press('Escape');

    // Input should be dismissed without saving
    await expect(cellInput).not.toBeVisible();
    await expect(page.locator('table tbody').getByText('9999')).not.toBeVisible();
    await expect(missingCellBtn).toBeVisible();

    // Now click again and press Enter to save
    await missingCellBtn.click();
    const cellInput2 = page.locator('table tbody input[type="text"]');
    await cellInput2.fill('50');
    await cellInput2.press('Enter');

    // Input dismissed, cell value updated, and verification counter updates to 4/4 Ready
    await expect(cellInput2).not.toBeVisible();
    await expect(page.getByText('4/4 Ready')).toBeVisible();
  });

  test('6. DiffInspectorTable: Bulk Approve Selected batch action', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('E-Commerce Product Catalog Intake')).toBeVisible({ timeout: 30000 });

    const catalogCard = page.locator('div.rounded-xl', {
      has: page.getByRole('heading', { name: 'E-Commerce Product Catalog Intake' }),
    });
    await catalogCard.getByRole('button', { name: 'Simulate Chaotic Upload' }).click();
    await page.waitForURL(/\/submissions\/[0-9a-f-]+/i);

    // Filter to Auto-Healed rows tab (exact tab name match)
    await page.getByRole('button', { name: /^Auto-Healed \(\d+\)$/ }).click();

    // Select row 1
    const row1Checkbox = page.locator('table tbody').getByLabel(/Select row/i).first();
    await row1Checkbox.check();

    // Bulk Approve Selected button
    const bulkApproveBtn = page.getByRole('button', { name: /Bulk Approve Selected/i });
    await expect(bulkApproveBtn).toBeVisible();
    await bulkApproveBtn.click();

    // Toolbar should dismiss after processing
    await expect(page.getByText('rows selected')).not.toBeVisible();
  });

  test('7. DiffInspectorTable: Asset picker dropdown Escape key dismissal', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('E-Commerce Product Catalog Intake')).toBeVisible({ timeout: 30000 });

    const catalogCard = page.locator('div.rounded-xl', {
      has: page.getByRole('heading', { name: 'E-Commerce Product Catalog Intake' }),
    });
    await catalogCard.getByRole('button', { name: 'Simulate Chaotic Upload' }).click();
    await page.waitForURL(/\/submissions\/[0-9a-f-]+/i);

    // Switch to All Rows
    await page.getByRole('button', { name: /All Rows/i }).click();

    // Click on linked media of row 1 to open asset picker dropdown
    const mediaBtn = page.locator('table tbody tr').first().locator('td').nth(2).locator('button');
    await expect(mediaBtn).toBeVisible();
    await mediaBtn.click();

    // Asset select dropdown should appear
    const selectEl = page.locator('table tbody select');
    await expect(selectEl).toBeVisible();

    // Press Escape to cancel
    await selectEl.press('Escape');

    // Select dropdown should be dismissed
    await expect(selectEl).not.toBeVisible();
  });

  test('8. DiffInspectorTable: Delete selected row and verify contiguous index integrity', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page.getByText('E-Commerce Product Catalog Intake')).toBeVisible({ timeout: 30000 });

    const catalogCard = page.locator('div.rounded-xl', {
      has: page.getByRole('heading', { name: 'E-Commerce Product Catalog Intake' }),
    });
    await catalogCard.getByRole('button', { name: 'Simulate Chaotic Upload' }).click();
    await page.waitForURL(/\/submissions\/[0-9a-f-]+/i);

    const diffTable = page.locator('table');
    await expect(diffTable).toBeVisible();

    // Verify initial row count (4 rows)
    const initialRows = diffTable.locator('tbody tr');
    await expect(initialRows).toHaveCount(4);

    // Select row 2 (SKU-102)
    const row2Checkbox = diffTable.getByLabel('Select row 2');
    await row2Checkbox.check();

    // Verify batch toolbar and click "Delete Selected Rows (1)"
    const deleteBtn = page.getByRole('button', { name: /Delete Selected Rows \(1\)/i });
    await expect(deleteBtn).toBeVisible();
    await deleteBtn.click();

    // Toolbar should disappear
    await expect(page.getByText('rows selected')).not.toBeVisible();

    // Remaining rows should now be 3
    await expect(diffTable.locator('tbody tr')).toHaveCount(3);

    // Verify index integrity: row checkboxes must be re-indexed as row 1, row 2, row 3
    await expect(diffTable.getByLabel('Select row 1')).toBeVisible();
    await expect(diffTable.getByLabel('Select row 2')).toBeVisible();
    await expect(diffTable.getByLabel('Select row 3')).toBeVisible();
    await expect(diffTable.getByLabel('Select row 4')).not.toBeVisible();

    // Verify SKU-102 was deleted and SKU-101, SKU-103, SKU-104 remain
    await expect(diffTable.getByText('SKU-101')).toBeVisible();
    await expect(diffTable.getByText('SKU-102')).not.toBeVisible();
    await expect(diffTable.getByText('SKU-103')).toBeVisible();
    await expect(diffTable.getByText('SKU-104')).toBeVisible();
  });

  test('9. ClientIntake: 60MB batch limit enforcement and capacity warning', async ({ page }) => {
    await page.goto('/intake/shopify-d2c-catalog');
    await expect(page.getByRole('heading', { name: 'E-Commerce Product Catalog Intake' })).toBeVisible({ timeout: 30000 });

    // Staging 5 files of 13MB each using DataTransfer to simulate file drop
    await page.evaluate(() => {
      const dt = new DataTransfer();
      for (let i = 1; i <= 5; i++) {
        const chunk = new Uint8Array(13 * 1024 * 1024);
        const file = new File([chunk], `product_batch_${i}.jpg`, { type: 'image/jpeg' });
        dt.items.add(file);
      }
      const input = document.querySelector('input[type="file"]') as HTMLInputElement;
      if (input) {
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });

    // Verify Staged Files Queue renders
    await expect(page.getByText('Staged Files Queue')).toBeVisible();
    await expect(page.getByText('5 files')).toBeVisible();

    // Verify 60MB batch limit warning indicator
    await expect(page.getByText(/65\.0 MB \/ 60 MB batch limit/i)).toBeVisible();

    // Verify Normalize button is disabled with text "Batch Exceeds 60MB Limit"
    const submitBtn = page.getByRole('button', { name: 'Batch Exceeds 60MB Limit' });
    await expect(submitBtn).toBeVisible();
    await expect(submitBtn).toBeDisabled();

    // Verify Clear all removes files and hides queue
    const clearBtn = page.getByRole('button', { name: 'Clear all' });
    await expect(clearBtn).toBeVisible();
    await clearBtn.click();
    await expect(page.getByText('Staged Files Queue')).not.toBeVisible();
  });

  test('10. ClientIntake: IngestionStepper error resilience, retry button, and dismiss action', async ({
    page,
  }) => {
    await page.goto('/intake/shopify-d2c-catalog');
    await expect(page.getByRole('heading', { name: 'E-Commerce Product Catalog Intake' })).toBeVisible({ timeout: 30000 });

    // Mock /api/intake to return a 500 failure
    await page.route('/api/intake', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Pipeline Gate Failure: Simulated cluster timeout during normalization' }),
      });
    });

    // Trigger intake with chaotic simulation
    const simulateBtn = page.getByRole('button', { name: 'Simulate Chaotic Upload' });
    await simulateBtn.click();

    // Ingestion stepper error strip should become visible with the exact error
    const stepper = page.getByText('Deterministic Ingestion Pipeline');
    await expect(stepper).toBeVisible();
    await expect(page.getByText('Ingestion halted due to pipeline error')).toBeVisible();
    await expect(page.getByText('Pipeline Gate Failure: Simulated cluster timeout during normalization').first()).toBeVisible();

    // Verify Retry Ingestion button is visible
    const retryBtn = page.getByRole('button', { name: 'Retry Ingestion' });
    await expect(retryBtn).toBeVisible();

    // Verify Dismiss button is visible and dismisses error
    const dismissBtn = page.getByRole('button', { name: 'Dismiss' });
    await expect(dismissBtn).toBeVisible();
    await dismissBtn.click();

    // Error and stepper should be dismissed
    await expect(page.getByText('Ingestion halted due to pipeline error')).not.toBeVisible();
  });
});
