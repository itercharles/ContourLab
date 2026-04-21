import { describe, expect, it } from 'vitest';
import type { ContourSlice, Volume } from '@webtps/shared-types';
import { computeBooleanContoursForStructure } from '../BooleanContourEngine';

function makeVolume(): Volume {
  return {
    seriesUID: 'series-1',
    dimensions: [32, 32, 3],
    spacing: [1, 1, 10],
    origin: [0, 0, 0],
    directionCosines: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    pixelData: new Float32Array(32 * 32 * 3),
    windowCenter: 40,
    windowWidth: 400,
  };
}

function squareContour(z: number, min: number, max: number, sop = `sop-${z}`): ContourSlice {
  return {
    referencedSOPInstanceUID: sop,
    slicePosition: z,
    points: new Float32Array([
      min, min, z,
      max, min, z,
      max, max, z,
      min, max, z,
    ]),
    isClosed: true,
  };
}

describe('BooleanContourEngine', () => {
  it('builds union contours for overlapping slices', () => {
    const contours = computeBooleanContoursForStructure(
      [squareContour(0, 4, 12)],
      [squareContour(0, 10, 18)],
      [{ sopInstanceUID: 'sop-0', sliceLocation: 0 }],
      makeVolume(),
      'union'
    );

    expect(contours).toHaveLength(1);
    expect(contours[0].slicePosition).toBe(0);
    expect(contours[0].points.length).toBeGreaterThan(0);
  });

  it('removes non-overlapping slices for intersect', () => {
    const contours = computeBooleanContoursForStructure(
      [squareContour(0, 4, 12)],
      [squareContour(10, 10, 18)],
      [
        { sopInstanceUID: 'sop-0', sliceLocation: 0 },
        { sopInstanceUID: 'sop-10', sliceLocation: 10 },
      ],
      makeVolume(),
      'intersect'
    );

    expect(contours).toHaveLength(0);
  });

  it('keeps source-only area for subtract', () => {
    const contours = computeBooleanContoursForStructure(
      [squareContour(0, 4, 14)],
      [squareContour(0, 8, 12)],
      [{ sopInstanceUID: 'sop-0', sliceLocation: 0 }],
      makeVolume(),
      'subtract'
    );

    expect(contours).toHaveLength(1);
    expect(contours[0].slicePosition).toBe(0);
    expect(contours[0].points.length).toBeGreaterThan(0);
  });
});
