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

  // CTs that mix 5 mm and 2.5 mm slabs come back from Cornerstone3D as a
  // uniform grid spaced at the average (e.g. 2.765 mm), which means each
  // contour falls on a fractional voxel-K row. Rounded naively this leaves
  // every-other K row empty between consecutive contours and the S/C
  // boundary draws as a stack of disconnected stripes. Use a fractional
  // contour spacing to pin the ownership-window fix.
  it('fills every K row between consecutive contours when the volume grid is finer than the contour spacing', () => {
    const fineGridVolume: Volume = {
      ...volume,
      dimensions: [12, 12, 8],
      spacing: [1, 1, 2.765],
    };
    // Contours at world Z = 0, 5, 10 (5 mm physical spacing) on a volume with
    // K spacing 2.765 mm. Continuous voxel K = 0, 1.808, 3.617. Naive
    // rounding lands on K = 0, 2, 4 — leaving K=1, 3 empty.
    const contours = [makeSquare(0), makeSquare(5), makeSquare(10)];

    const path = buildMprMaskBoundaryPath(
      fineGridVolume,
      contours,
      'SAGITTAL',
      5,
      ([, y, z]) => [y, z]
    );

    expect(path.length).toBeGreaterThan(0);

    // The volume's K spacing is 2.765 mm. Sample voxel-boundary world Zs and
    // count how many integer K rows have a horizontal boundary edge passing
    // through them. A contiguous (well-filled) sagittal cross-section emits
    // horizontal edges only at the structure's top and bottom — exactly two
    // K rows. The buggy "round to nearest K" version of this code drops
    // every other K row from the mask, producing one new top+bottom edge
    // pair per filled K row (in this case ≥ 6 distinct K rows with
    // horizontal edges).
    const horizontalEdgeRegex = /M (-?\d+\.?\d*) (-?\d+\.?\d*) L (-?\d+\.?\d*) (-?\d+\.?\d*)/g;
    const horizontalEdgeKRows = new Set<string>();
    for (const match of path.matchAll(horizontalEdgeRegex)) {
      const z1 = Number(match[2]);
      const z2 = Number(match[4]);
      // Horizontal edges share Y on canvas (Z in our worldToCanvas mapping).
      if (Math.abs(z1 - z2) < 1e-6) {
        horizontalEdgeKRows.add(z1.toFixed(3));
      }
    }
    expect(horizontalEdgeKRows.size).toBeLessThanOrEqual(2);
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
