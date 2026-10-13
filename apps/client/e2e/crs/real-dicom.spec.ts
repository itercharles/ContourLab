/**
 * Real DICOM through the real pipeline: repository -> DICOMweb -> loader -> codec -> Cornerstone
 * -> WebGL -> viewport.
 *
 * Every other spec mocks DICOMweb or injects store state, so none decodes pixel data. This one
 * loads the synthetic phantom series (apps/client/e2e/fixtures/dicom, one per transfer syntax)
 * from a real Orthanc and checks that the three planar views actually show an image. Seed the
 * repository first with `pnpm repo:seed` (CI does it after `pnpm repo:up`).
 *
 * Not covered: HTJ2K (OpenJPH) - no encoder was available to make a fixture.
 */

import { test, expect, type Page } from '@playwright/test';

const VIEWPORTS = ['viewport-axial', 'viewport-sagittal', 'viewport-coronal'] as const;

const SERIES = [
  { variant: 'uncompressed', syntax: 'Explicit VR Little Endian (no codec)' },
  { variant: 'jpeg2000', syntax: 'JPEG 2000 lossless (OpenJPEG)' },
  { variant: 'jpegls', syntax: 'JPEG-LS lossless (CharLS)' },
  { variant: 'jpeg-baseline', syntax: 'JPEG baseline 8-bit (libjpeg-turbo)' },
] as const;

interface ImageStats {
  nonBlackFraction: number;
  meanLevel: number;
}

async function loadPhantom(page: Page, variant: string) {
  await page.goto('/workspace');
  await page.getByRole('button', { name: /Load patient/i }).click();
  await page.getByPlaceholder(/Search patient/i).fill(`PHANTOM-${variant.toUpperCase()}`);
  await page.getByText(`PHANTOM-${variant.toUpperCase()}`).first().dblclick();
}

async function viewportStats(page: Page, viewportId: string): Promise<ImageStats> {
  const png = await page.locator(`[data-viewport-id="${viewportId}"]`).screenshot();
  return page.evaluate(async (base64) => {
    const blob = await (await fetch(`data:image/png;base64,${base64}`)).blob();
    const bitmap = await createImageBitmap(blob);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2d context');
    ctx.drawImage(bitmap, 0, 0);
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let nonBlack = 0;
    let sum = 0;
    for (let i = 0; i < data.length; i += 4) {
      const v = Math.max(data[i], data[i + 1], data[i + 2]);
      sum += v;
      if (v > 20) nonBlack += 1;
    }
    const pixels = data.length / 4;
    return { nonBlackFraction: nonBlack / pixels, meanLevel: sum / pixels };
  }, png.toString('base64'));
}

// An empty view scores about 0.001 non-black; the phantom's sparsest view (coronal) scores about 0.07.
async function expectImage(page: Page, viewportId: string, timeout = 45_000) {
  await expect
    .poll(async () => (await viewportStats(page, viewportId)).nonBlackFraction, {
      message: `${viewportId} shows no image`,
      timeout,
    })
    .toBeGreaterThan(0.03);
}

test.describe('Real DICOM series render in the planar views', () => {
  for (const { variant, syntax } of SERIES) {
    test(`${syntax} series loads and every planar view shows an image @links:SYS-001,SYS-002 @testing:T4`, async ({
      page,
    }) => {
      await loadPhantom(page, variant);
      for (const id of VIEWPORTS) {
        await expectImage(page, id);
      }
    });
  }

  // The three lossless syntaxes carry identical pixel values, so the codecs must give the same picture.
  test('JPEG 2000 and JPEG-LS lossless series display the same axial image as uncompressed @links:SYS-001 @testing:T5', async ({
    page,
  }) => {
    const shown: Record<string, ImageStats> = {};
    for (const variant of ['uncompressed', 'jpeg2000', 'jpegls']) {
      await loadPhantom(page, variant);
      await expectImage(page, 'viewport-axial');
      shown[variant] = await viewportStats(page, 'viewport-axial');
    }
    for (const variant of ['jpeg2000', 'jpegls']) {
      expect(shown[variant].nonBlackFraction).toBeCloseTo(shown['uncompressed'].nonBlackFraction, 2);
      expect(Math.abs(shown[variant].meanLevel - shown['uncompressed'].meanLevel)).toBeLessThan(1);
    }
  });
});

test.describe('Maximize and restore a viewport (issue #164)', () => {
  test('@links:SRS-019 @testing:T3 maximizing the axial view fills the image area with the image', async ({ page }) => {
    await loadPhantom(page, 'uncompressed');
    await expectImage(page, 'viewport-axial');

    await page.locator('[data-viewport-id="viewport-axial"]').click({ button: 'right' });
    await page.getByRole('button', { name: 'Maximize View' }).click();

    await expect
      .poll(async () => (await page.locator('[data-viewport-id="viewport-axial"]').boundingBox())?.width ?? 0, {
        message: 'maximized axial panel has no width',
        timeout: 10_000,
      })
      .toBeGreaterThan(300);
    await expectImage(page, 'viewport-axial', 10_000);
  });

  test('@links:SYS-002 @testing:T5 restoring the layout shows the image in all three planar views again', async ({ page }) => {
    await loadPhantom(page, 'uncompressed');
    await expectImage(page, 'viewport-axial');

    await page.locator('[data-viewport-id="viewport-axial"]').click({ button: 'right' });
    await page.getByRole('button', { name: 'Maximize View' }).click();
    await page.keyboard.press('Escape');

    for (const id of VIEWPORTS) {
      await expectImage(page, id, 10_000);
    }
  });
});
