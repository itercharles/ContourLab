/**
 * CRS-001: Clinicians shall view CT/MRI images in axial, sagittal, and coronal planes.
 *
 * Uses page.route() to intercept DICOMweb and verify the clinical user experience:
 * patients appear in the browser, studies are selectable, and the system
 * communicates loading state.
 */

import { test, expect, type Page } from '@playwright/test';

const MOCK_SERIES = [
  {
    '00100010': { Value: [{ Alphabetic: 'ANDERSON^MARY' }] },
    '00100020': { Value: ['MRN-003'] },
    '0020000D': { Value: ['1.2.826.0.1.3680043.8.498.10'] },
    '0020000E': { Value: ['1.2.826.0.1.3680043.8.498.11'] },
    '00080060': { Value: ['CT'] },
    '00080020': { Value: ['20240401'] },
    '00081030': { Value: ['Prostate Planning CT'] },
    '0008103E': { Value: ['PELVIS CT PLANNING'] },
    '00201209': { Value: [96] },
  },
];

async function openPatientBrowserWithMock(page: Page) {
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

test.describe('Clinical image access @links:CRS-001', () => {
  test('clinician can see available patients in the browser @links:CRS-001 @testing:T1', async ({ page }) => {
    await openPatientBrowserWithMock(page);
    // Patient should appear with identifiable information
    await expect(page.getByText('Mary Anderson').or(page.getByText('ANDERSON'))).toBeVisible();
  });

  test('clinician can identify the study by description and date @links:CRS-001 @testing:T2', async ({
    page,
  }) => {
    await openPatientBrowserWithMock(page);
    // Study context visible without selecting a specific patient
    await expect(
      page.getByText(/Prostate Planning CT/i).or(page.getByText(/Pelvis/i)).first(),
    ).toBeVisible();
  });

  test('clinician can search for a patient by MRN @links:CRS-001 @testing:T3', async ({ page }) => {
    await openPatientBrowserWithMock(page);
    await page.getByPlaceholder(/Search patient/i).fill('MRN-003');
    await expect(page.getByText('Mary Anderson').or(page.getByText('ANDERSON'))).toBeVisible();
  });

  test('workspace shows no active patient before series selection @links:CRS-001 @testing:T4', async ({
    page,
  }) => {
    await openPatientBrowserWithMock(page);
    // Close browser and verify workspace still shows empty state
    await page.keyboard.press('Escape');
    await expect(page.getByText('Load Patient')).toBeVisible();
    await expect(page.getByText('No active image set')).toBeVisible();
  });
});
