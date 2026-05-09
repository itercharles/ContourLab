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

    expect(path).toContain('M 1.5 0.5');
    expect(path).toContain('L 7.5 2.5');
    expect(path).toContain('Z');
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

  it('keeps multiple disjoint contours on the same slice as separate closed boundaries', () => {
    const leftSquare: ContourSlice = {
      referencedSOPInstanceUID: 'sop-left',
      slicePosition: 1,
      isClosed: true,
      points: new Float32Array([
        1, 2, 1,
        4, 2, 1,
        4, 5, 1,
        1, 5, 1,
      ]),
    };
    const rightSquare: ContourSlice = {
      referencedSOPInstanceUID: 'sop-right',
      slicePosition: 1,
      isClosed: true,
      points: new Float32Array([
        7, 2, 1,
        10, 2, 1,
        10, 5, 1,
        7, 5, 1,
      ]),
    };

    const path = buildMprMaskBoundaryPath(
      volume,
      [leftSquare, rightSquare],
      'CORONAL',
      3,
      ([x, , z]) => [x, z]
    );

    expect(path).toContain('M 0.5 0.5');
    expect(path).toContain('L 4.5 1.5');
    expect(path).toContain('M 6.5 0.5');
    expect(path).toContain('L 10.5 1.5');
    expect(path.match(/ Z\b/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });
});
