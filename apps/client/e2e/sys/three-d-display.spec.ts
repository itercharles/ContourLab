/**
 * SYS-014: System shall render a fourth 3D viewport for the active image set.
 * SYS-015: System shall refresh 3D structure presentation after contour and visibility updates.
 */

import { test, expect, type Page } from '@playwright/test';

const SERIES_UID = 'sys-3d-series-001';

async function injectThreeDState(page: Page) {
  await page.goto('/');
  await page.getByText('Load Patient').waitFor();
  await page.waitForFunction(() => !!(window as Record<string, unknown>)['__contourlab_stores']);

  await page.evaluate(({ seriesUID }) => {
    const stores = (window as Record<string, unknown>)['__contourlab_stores'] as {
      volumeStore: { setState: (state: unknown) => void };
      structureStore: { setState: (state: unknown) => void };
    };

    stores.volumeStore.setState({
      loadedSeries: [
        {
          seriesUID,
          cornerstoneVolumeId: `cornerstoneStreamingImageVolume:${seriesUID}`,
          volume: {
            seriesUID,
            dimensions: [16, 16, 4] as [number, number, number],
            spacing: [1, 1, 2] as [number, number, number],
            origin: [0, 0, 0] as [number, number, number],
            directionCosines: [1, 0, 0, 0, 1, 0, 0, 0, 1],
            pixelData: new Float32Array(16 * 16 * 4).fill(350),
            windowCenter: 40,
            windowWidth: 400,
          },
          patient: {
            id: 'PAT-SYS3D',
            mrn: 'MRN-SYS3D',
            name: { given: 'James', family: 'Wilson' },
            dateOfBirth: '1960-03-22',
            studies: [],
          },
          study: {
            studyInstanceUID: 'study-sys-3d',
            studyDescription: 'Planning CT',
            studyDate: '20240601',
            series: [],
          },
          series: {
            seriesInstanceUID: seriesUID,
            seriesDescription: 'Thorax CT',
            modality: 'CT' as const,
            instances: [],
          },
        },
      ],
      activeSeriesUID: seriesUID,
      isLoading: false,
      loadError: null,
    });

    stores.structureStore.setState({
      structureSets: [
        {
          id: 'ss-sys-3d',
          label: 'SYS 3D Structures',
          referencedSeriesUID: seriesUID,
          version: 1,
          structures: [
            {
              id: 'structure-sys-1',
              name: 'GTV_SYS',
              type: 'GTV' as const,
              color: [255, 0, 0] as [number, number, number],
              isVisible: true,
              isLocked: false,
              volume_cc: 2.5,
              contours: [
                {
                  referencedSOPInstanceUID: '1.2.3.4.20',
                  slicePosition: 0,
                  isClosed: true,
                  points: new Float32Array([2, 2, 0, 10, 2, 0, 10, 10, 0, 2, 10, 0]),
                },
                {
                  referencedSOPInstanceUID: '1.2.3.4.22',
                  slicePosition: 2,
                  isClosed: true,
                  points: new Float32Array([2, 2, 2, 10, 2, 2, 10, 10, 2, 2, 10, 2]),
                },
              ],
            },
          ],
        },
      ],
      activeStructureSetId: 'ss-sys-3d',
      activeStructureId: 'structure-sys-1',
      dirtySeriesUIDs: [],
      repositoryDirtySeriesUIDs: [],
    });
  }, { seriesUID: SERIES_UID });
}

test.describe('3D viewport system requirements @links:SYS-014,SYS-015', () => {
  test('system renders CT and visible structures in the fourth 3D viewport @links:SYS-014', async ({ page }) => {
    await injectThreeDState(page);

    await expect(page.getByLabel('3D viewport')).toBeVisible();
    await expect(page.getByText(/CT surface ready/i)).toBeVisible();
    await expect(page.getByText(/1 visible structure/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hide CT' })).toBeVisible();
  });

  test('system refreshes 3D structure presentation after a manual refresh @links:SYS-015', async ({ page }) => {
    await injectThreeDState(page);

    await expect(page.getByText(/1 visible structure/i)).toBeVisible();

    await page.getByRole('button', { name: 'Refresh 3D' }).click();

    await expect(page.getByText(/CT surface ready/i)).toBeVisible();
    await expect(page.getByText(/1 visible structure/i)).toBeVisible();
  });
});
