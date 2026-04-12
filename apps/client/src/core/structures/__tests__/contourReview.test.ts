import { describe, expect, it } from 'vitest';
import type { ContourSlice } from '@webtps/shared-types';
import { findAdjacentReviewSlice, getReviewSlices } from '../contourReview';

function makeContour(slicePosition: number, sopInstanceUID = `sop-${slicePosition}`): ContourSlice {
  return {
    referencedSOPInstanceUID: sopInstanceUID,
    slicePosition,
    points: new Float32Array([0, 0, slicePosition, 1, 0, slicePosition, 1, 1, slicePosition]),
    isClosed: true,
  };
}

describe('contour review navigation', () => {
  it('returns unique review slices sorted by slice position', () => {
    expect(getReviewSlices([
      makeContour(10),
      makeContour(0),
      makeContour(10),
    ])).toEqual([
      { referencedSOPInstanceUID: 'sop-0', slicePosition: 0 },
      { referencedSOPInstanceUID: 'sop-10', slicePosition: 10 },
    ]);
  });

  it('finds the next contour slice and wraps around', () => {
    const contours = [makeContour(0), makeContour(10), makeContour(20)];

    expect(findAdjacentReviewSlice(contours, 9, 'next')?.slicePosition).toBe(10);
    expect(findAdjacentReviewSlice(contours, 20, 'next')?.slicePosition).toBe(0);
  });

  it('finds the previous contour slice and wraps around', () => {
    const contours = [makeContour(0), makeContour(10), makeContour(20)];

    expect(findAdjacentReviewSlice(contours, 11, 'previous')?.slicePosition).toBe(10);
    expect(findAdjacentReviewSlice(contours, 0, 'previous')?.slicePosition).toBe(20);
  });
});
