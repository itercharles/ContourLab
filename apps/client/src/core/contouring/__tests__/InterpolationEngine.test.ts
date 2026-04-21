import { describe, expect, it } from 'vitest';
import type { ContourSlice } from '@webtps/shared-types';
import {
  findInterpolationBounds,
  interpolateContourForSlice,
  interpolateMissingContoursForFrames,
} from '../InterpolationEngine';

function squareContour(z: number, size: number): ContourSlice {
  return {
    referencedSOPInstanceUID: `sop-${z}`,
    slicePosition: z,
    points: new Float32Array([
      0, 0, z,
      size, 0, z,
      size, size, z,
      0, size, z,
    ]),
    isClosed: true,
  };
}

describe('InterpolationEngine', () => {
  it('finds bracketing contours around a target slice', () => {
    const bounds = findInterpolationBounds([
      squareContour(0, 10),
      squareContour(10, 20),
    ], 5);

    expect(bounds?.lower.slicePosition).toBe(0);
    expect(bounds?.upper.slicePosition).toBe(10);
  });

  it('creates an interpolated closed contour at the target slice', () => {
    const contour = interpolateContourForSlice([
      squareContour(0, 10),
      squareContour(10, 20),
    ], 5, 'sop-5', 8);

    expect(contour?.referencedSOPInstanceUID).toBe('sop-5');
    expect(contour?.slicePosition).toBe(5);
    expect(contour?.isClosed).toBe(true);
    expect(contour?.points).toHaveLength(24);
    expect(Array.from(contour!.points).every((_, index) => index % 3 !== 2 || contour!.points[index] === 5)).toBe(true);
  });

  it('creates contours for missing image frames between drawn slices', () => {
    const contours = [
      squareContour(0, 10),
      squareContour(30, 20),
    ];
    const interpolated = interpolateMissingContoursForFrames(contours, [
      { sopInstanceUID: 'sop-0', sliceLocation: 0 },
      { sopInstanceUID: 'sop-10', sliceLocation: 10 },
      { sopInstanceUID: 'sop-20', sliceLocation: 20 },
      { sopInstanceUID: 'sop-30', sliceLocation: 30 },
    ], 8);

    expect(interpolated.map((contour) => contour.slicePosition)).toEqual([10, 20]);
    expect(interpolated.map((contour) => contour.referencedSOPInstanceUID)).toEqual(['sop-10', 'sop-20']);
  });

  it('skips interpolation when the contour gap exceeds the configured maximum', () => {
    const contours = [
      squareContour(0, 10),
      squareContour(40, 20),
    ];
    const interpolated = interpolateMissingContoursForFrames(contours, [
      { sopInstanceUID: 'sop-0', sliceLocation: 0 },
      { sopInstanceUID: 'sop-10', sliceLocation: 10 },
      { sopInstanceUID: 'sop-20', sliceLocation: 20 },
      { sopInstanceUID: 'sop-30', sliceLocation: 30 },
      { sopInstanceUID: 'sop-40', sliceLocation: 40 },
    ], 8, 2);

    expect(interpolated).toHaveLength(0);
  });
});
