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
});
