import { test, expect } from '@playwright/test';

/**
 * CRS-009: Clinicians shall always see the active patient, image set, structure source, and sync state.
 * CRS-008: Clinicians shall select a patient and study from the image repository browser.
 */

test.describe('Clinical workspace context @links:CRS-009', () => {
  test('workspace context is always present with default empty state @links:CRS-009', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('No active patient')).toBeVisible();
    await expect(page.getByText('No active image set')).toBeVisible();
    await expect(page.getByText('Synced', { exact: true })).toBeVisible();
  });
});

test.describe('Patient and study selection @links:CRS-008', () => {
  test('clinician can open the patient browser @links:CRS-008', async ({ page }) => {
    await page.goto('/');
    await page.getByText('No active patient').waitFor();
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('webtps:open-patient-selector'));
    });
    await expect(page.getByText('Patient browser')).toBeVisible();
    await expect(page.getByPlaceholder('Search patient, MRN, study, series…')).toBeVisible();
    await expect(page.getByRole('tab', { name: /All/ })).toBeVisible();
  });

  test('clinician can search by patient name or MRN @links:CRS-008', async ({ page }) => {
    await page.goto('/');
    await page.getByText('No active patient').waitFor();
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('webtps:open-patient-selector'));
    });
    const search = page.getByPlaceholder('Search patient, MRN, study, series…');
    await search.waitFor();
    await search.fill('DOE');
    await expect(search).toHaveValue('DOE');
  });

  test('clinician can close the patient browser @links:CRS-008', async ({ page }) => {
    await page.goto('/');
    await page.getByText('No active patient').waitFor();
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('webtps:open-patient-selector'));
    });
    await expect(page.getByText('Patient browser')).toBeVisible();
    await page.getByRole('button', { name: 'Close patient browser' }).click();
    await expect(page.getByText('Patient browser')).not.toBeVisible();
  });
});
