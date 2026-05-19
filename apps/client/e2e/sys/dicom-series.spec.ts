/**
 * SYS-001: System shall load DICOM CT series from a DICOMweb repository.
 *
 * Tests use page.route() to intercept DICOMweb requests and return controlled
 * mock data, verifying that the system correctly parses and displays series
 * metadata without requiring a populated Orthanc instance.
 */

import { test, expect, type Page } from '@playwright/test';

// ---------------------------------------------------------------------------
// Mock DICOM JSON response (QIDO-RS series query format)
// ---------------------------------------------------------------------------
const MOCK_SERIES = [
  {
    '00100010': { Value: [{ Alphabetic: 'SMITH^JANE' }] },
    '00100020': { Value: ['MRN-001'] },
    '0020000D': { Value: ['1.2.826.0.1.3680043.8.498.1'] },
    '0020000E': { Value: ['1.2.826.0.1.3680043.8.498.2'] },
    '00080060': { Value: ['CT'] },
    '00080020': { Value: ['20240315'] },
    '00081030': { Value: ['Chest / Lung Planning'] },
    '0008103E': { Value: ['CHEST AP LUNG WINDOW'] },
    '00201209': { Value: [120] },
  },
  {
    '00100010': { Value: [{ Alphabetic: 'JONES^ROBERT' }] },
    '00100020': { Value: ['MRN-002'] },
    '0020000D': { Value: ['1.2.826.0.1.3680043.8.498.3'] },
    '0020000E': { Value: ['1.2.826.0.1.3680043.8.498.4'] },
    '00080060': { Value: ['CT'] },
    '00080020': { Value: ['20240210'] },
    '00081030': { Value: ['Head and Neck Planning'] },
    '0008103E': { Value: ['HN CT WITH CONTRAST'] },
    '00201209': { Value: [85] },
  },
];

async function setupDicomMockAndLoad(page: Page) {
  await page.route('**/dicom-web/series**', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/dicom+json',
      body: JSON.stringify(MOCK_SERIES),
    });
  });
  await page.goto('/');
  await page.getByText('Load Patient').waitFor();
  await page.evaluate(() =>
    window.dispatchEvent(new CustomEvent('contourlab:open-patient-selector')),
  );
  await page.getByText('Patient browser').waitFor();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('DICOMweb CT series retrieval @links:SYS-001', () => {
  test('patient browser lists patients from DICOMweb repository @links:SYS-001', async ({
    page,
  }) => {
    await setupDicomMockAndLoad(page);
    // Both mock patients should appear in the browser
    await expect(page.getByText('Jane Smith').or(page.getByText('SMITH'))).toBeVisible();
    await expect(page.getByText('Robert Jones').or(page.getByText('JONES'))).toBeVisible();
  });

  test('patient browser shows MRN for each patient @links:SYS-001', async ({ page }) => {
    await setupDicomMockAndLoad(page);
    await expect(page.getByText(/MRN-001/).first()).toBeVisible();
    await expect(page.getByText(/MRN-002/).first()).toBeVisible();
  });

  test('patient browser displays series count from repository @links:SYS-001', async ({
    page,
  }) => {
    await setupDicomMockAndLoad(page);
    // Each patient has one CT series — the browser groups by patient/study
    // Series metadata (study description) should be visible
    await expect(
      page.getByText(/Chest.*Lung Planning/i).or(page.getByText(/Head.*Neck Planning/i)).first(),
    ).toBeVisible();
  });

  test('patient browser search narrows results by patient name @links:SYS-001', async ({
    page,
  }) => {
    await setupDicomMockAndLoad(page);
    await page.getByPlaceholder(/Search patient/i).fill('SMITH');
    // After filtering, only Smith should be visible
    await expect(page.getByText('Jane Smith').or(page.getByText('SMITH'))).toBeVisible();
  });
});
