/**
 * CRS-012: Clinicians shall review the active image set and visible structures in a synchronized 3D viewport.
 */

import { test, expect, type Page } from '@playwright/test';

const SERIES_UID = 'crs-3d-series-001';

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
            id: 'PAT-3D',
            mrn: 'MRN-3D',
            name: { given: 'Mary', family: 'Anderson' },
            dateOfBirth: '1955-06-15',
            studies: [],
          },
          study: {
            studyInstanceUID: 'study-3d',
            studyDescription: 'Planning CT',
            studyDate: '20240401',
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
          id: 'ss-3d',
          label: '3D Structures',
          referencedSeriesUID: seriesUID,
          version: 1,
          structures: [
            {
              id: 'structure-1',
              name: 'PTV_3D',
              type: 'PTV' as const,
              color: [0, 0, 255] as [number, number, number],
              isVisible: true,
              isLocked: false,
              volume_cc: 3.2,
              contours: [
                {
                  referencedSOPInstanceUID: '1.2.3.4.10',
                  slicePosition: 0,
                  isClosed: true,
                  points: new Float32Array([2, 2, 0, 8, 2, 0, 8, 8, 0, 2, 8, 0]),
                },
                {
                  referencedSOPInstanceUID: '1.2.3.4.12',
                  slicePosition: 2,
                  isClosed: true,
                  points: new Float32Array([2, 2, 2, 8, 2, 2, 8, 8, 2, 2, 8, 2]),
                },
              ],
            },
          ],
        },
      ],
      activeStructureSetId: 'ss-3d',
      activeStructureId: 'structure-1',
      dirtySeriesUIDs: [],
      repositoryDirtySeriesUIDs: [],
    });
  }, { seriesUID: SERIES_UID });
}

test.describe('3D clinical review @links:CRS-012', () => {
  test('workspace exposes CT and visible structures in the fourth 3D quadrant @links:CRS-012 @testing:T1', async ({ page }) => {
    await injectThreeDState(page);

    await expect(page.getByLabel('3D viewport')).toBeVisible();
    await expect(page.getByText(/CT surface ready/i)).toBeVisible();
    await expect(page.getByText(/1 visible structure/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Hide CT' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Refresh 3D' })).toBeVisible();
  });
});
