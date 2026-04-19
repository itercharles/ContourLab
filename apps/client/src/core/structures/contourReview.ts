import type { ContourSlice } from '@webtps/shared-types';

export type ContourReviewDirection = 'previous' | 'next';

export interface ReviewSlice {
  slicePosition: number;
  referencedSOPInstanceUID: string;
}

export interface ReviewImageFrame {
  index: number;
  sliceLocation: number;
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

export function resolveContourReviewScrollDelta(
  contours: ContourSlice[],
  frames: ReviewImageFrame[],
  currentSlicePosition: number,
  direction: ContourReviewDirection
): { targetSlice: ReviewSlice; scrollDelta: number } | null {
  const targetSlice = findAdjacentReviewSlice(contours, currentSlicePosition, direction);
  if (!targetSlice || frames.length === 0) return null;

  return {
    targetSlice,
    scrollDelta: resolveScrollDeltaToSlice(frames, currentSlicePosition, targetSlice.slicePosition),
  };
}

export function resolveScrollDeltaToSlice(
  frames: ReviewImageFrame[],
  currentSlicePosition: number,
  targetSlicePosition: number
): number {
  const closestFrameIndexTo = (slicePosition: number) =>
    frames.reduce((closest, frame) => {
      const closestDistance = Math.abs(closest.sliceLocation - slicePosition);
      const frameDistance = Math.abs(frame.sliceLocation - slicePosition);
      return frameDistance < closestDistance ? frame : closest;
    }).index;

  return closestFrameIndexTo(targetSlicePosition) - closestFrameIndexTo(currentSlicePosition);
}
