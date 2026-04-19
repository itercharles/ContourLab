import { describe, expect, it } from 'vitest';
import type { ContourSlice } from '@webtps/shared-types';
import { findInterpolationBounds, interpolateContourForSlice } from '../InterpolationEngine';

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
});
