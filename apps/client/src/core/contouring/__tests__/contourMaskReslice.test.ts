import { describe, expect, it } from 'vitest';
import type { ContourSlice, Volume } from '@webtps/shared-types';
import { buildMprMaskBoundaryPath } from '../contourMaskReslice';

const volume: Volume = {
  seriesUID: 'series-1',
  dimensions: [12, 12, 4],
  spacing: [1, 1, 1],
  origin: [0, 0, 0],
  directionCosines: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  pixelData: new Float32Array(0),
  windowCenter: 40,
  windowWidth: 400,
};

function makeSquare(z: number): ContourSlice {
  return {
    referencedSOPInstanceUID: `sop-${z}`,
    slicePosition: z,
    isClosed: true,
    points: new Float32Array([
      2, 2, z,
      8, 2, z,
      8, 8, z,
      2, 8, z,
    ]),
  };
}

describe('buildMprMaskBoundaryPath', () => {
  it('extracts a sagittal boundary from rasterized contour mask data', () => {
    const path = buildMprMaskBoundaryPath(
      volume,
      [makeSquare(1), makeSquare(2)],
      'SAGITTAL',
      5,
      ([, y, z]) => [y, z]
    );

    expect(path).toContain('M 1.5 0.5 L 2.5 0.5');
    expect(path).toContain('M 7.5 2.5 L 6.5 2.5');
  });

  it('returns no boundary when the MPR plane misses the contour mask', () => {
    const path = buildMprMaskBoundaryPath(
      volume,
      [makeSquare(1), makeSquare(2)],
      'CORONAL',
      10,
      ([x, , z]) => [x, z]
    );

    expect(path).toBe('');
  });

  // HFP scans (and any flipped-Y / flipped-Z orientation) hit the previous
  // direct-world-axis math with negative voxel indices and dropped every slice
  // below the volume's origin. Force the same geometry here so a regression
  // would surface as an empty path.
  it('extracts boundaries on HFP-style flipped-Y and flipped-Z volumes', () => {
    const hfpVolume: Volume = {
      ...volume,
      origin: [0, 10, 10],
      directionCosines: [1, 0, 0, 0, -1, 0, 0, 0, -1],
    };
    // Contour at world Z=8 (below origin Z=10 because K basis points in -Z).
    // Y range [2..8] is below origin Y=10 (J basis points in -Y).
    const contour: ContourSlice = {
      referencedSOPInstanceUID: 'sop-hfp-1',
      slicePosition: 8,
      isClosed: true,
      points: new Float32Array([
        2, 2, 8,
        8, 2, 8,
        8, 8, 8,
        2, 8, 8,
      ]),
    };

    // SAGITTAL plane at world X=5 cuts the contour. Identity worldToCanvas so
    // we can see the world coordinates directly in the SVG path.
    const sagittal = buildMprMaskBoundaryPath(
      hfpVolume,
      [contour],
      'SAGITTAL',
      5,
      ([, y, z]) => [y, z]
    );
    expect(sagittal).not.toBe('');
    // Top of contour should sit near world Y in [2, 8] and world Z near 8 —
    // a matching M segment confirms boundary edges land in the contour's
    // actual world coordinates rather than the flipped-sign region the bug
    // produced (Y >= origin[1]=10 and Z >= origin[2]=10).
    expect(sagittal).toMatch(/M [-\d.]+ 7\.5/);

    // CORONAL plane at world Y=5 should also intersect.
    const coronal = buildMprMaskBoundaryPath(
      hfpVolume,
      [contour],
      'CORONAL',
      5,
      ([x, , z]) => [x, z]
    );
    expect(coronal).not.toBe('');
  });
});
