import { test, expect } from '@playwright/test';

/**
 * SYS-012: System shall display persistent workspace context.
 * SYS-011: System shall provide patient and study selection from the DICOMweb repository.
 */

test.describe('Workspace context and patient selection @links:SYS-012,SYS-011', () => {
  test('workspace context bar is visible on load @links:SYS-012', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('No active patient')).toBeVisible();
    await expect(page.getByText('No active image set')).toBeVisible();
    await expect(page.getByText('Synced', { exact: true })).toBeVisible();
  });

  test('patient browser opens from the workspace context command @links:SYS-011', async ({ page }) => {
    await page.goto('/');
    // Wait for the app to be interactive before dispatching the event
    await page.getByText('No active patient').waitFor();
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('webtps:open-patient-selector'));
    });
    await expect(page.getByText('Patient browser')).toBeVisible();
    await expect(page.getByPlaceholder('Search patient, MRN, study, series…')).toBeVisible();
  });

  test('patient browser can be closed with Escape @links:SYS-011', async ({ page }) => {
    await page.goto('/');
    await page.getByText('No active patient').waitFor();
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('webtps:open-patient-selector'));
    });
    await expect(page.getByText('Patient browser')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByText('Patient browser')).not.toBeVisible();
  });

  test('patient browser search input is functional @links:SYS-011', async ({ page }) => {
    await page.goto('/');
    await page.getByText('No active patient').waitFor();
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('webtps:open-patient-selector'));
    });
    const search = page.getByPlaceholder('Search patient, MRN, study, series…');
    await search.waitFor();
    await search.fill('test');
    await expect(search).toHaveValue('test');
  });
});
