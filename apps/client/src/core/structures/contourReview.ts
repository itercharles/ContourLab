import type { ContourSlice } from '@webtps/shared-types';

export type ContourReviewDirection = 'previous' | 'next';

export interface ReviewSlice {
  slicePosition: number;
  referencedSOPInstanceUID: string;
}

export function getReviewSlices(contours: ContourSlice[]): ReviewSlice[] {
  const bySlice = new Map<string, ReviewSlice>();

  for (const contour of contours) {
    const key = `${contour.referencedSOPInstanceUID || 'z'}:${contour.slicePosition}`;
    if (!bySlice.has(key)) {
      bySlice.set(key, {
        slicePosition: contour.slicePosition,
        referencedSOPInstanceUID: contour.referencedSOPInstanceUID,
      });
    }
  }

  return Array.from(bySlice.values()).sort((a, b) => a.slicePosition - b.slicePosition);
}

export function findAdjacentReviewSlice(
  contours: ContourSlice[],
  currentSlicePosition: number,
  direction: ContourReviewDirection
): ReviewSlice | null {
  const slices = getReviewSlices(contours);
  if (slices.length === 0) return null;

  if (direction === 'next') {
    return slices.find((slice) => slice.slicePosition > currentSlicePosition) ?? slices[0];
  }

  return [...slices].reverse().find((slice) => slice.slicePosition < currentSlicePosition) ?? slices[slices.length - 1];
}
