import type { ContourSlice } from '@contourlab/shared-types';

const DEFAULT_SAMPLE_COUNT = 64;

function contourToPoints(contour: ContourSlice): Array<[number, number, number]> {
  const points: Array<[number, number, number]> = [];
  for (let index = 0; index < contour.points.length; index += 3) {
    points.push([
      contour.points[index],
      contour.points[index + 1],
      contour.points[index + 2],
    ]);
  }
  return points;
}

function distance2D(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function resampleClosedContour(contour: ContourSlice, sampleCount = DEFAULT_SAMPLE_COUNT): Array<[number, number, number]> {
  const points = contourToPoints(contour);
  if (points.length < 3) return [];

  const segmentLengths = points.map((point, index) => distance2D(point, points[(index + 1) % points.length]));
  const perimeter = segmentLengths.reduce((sum, length) => sum + length, 0);
  if (perimeter <= 0) return [];

  const samples: Array<[number, number, number]> = [];
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex += 1) {
    const targetDistance = (sampleIndex / sampleCount) * perimeter;
    let accumulated = 0;
    let segmentIndex = 0;
    while (
      segmentIndex < segmentLengths.length - 1 &&
      accumulated + segmentLengths[segmentIndex] < targetDistance
    ) {
      accumulated += segmentLengths[segmentIndex];
      segmentIndex += 1;
    }

    const start = points[segmentIndex];
    const end = points[(segmentIndex + 1) % points.length];
    const segmentLength = segmentLengths[segmentIndex] || 1;
    const t = (targetDistance - accumulated) / segmentLength;
    samples.push([
      start[0] + (end[0] - start[0]) * t,
      start[1] + (end[1] - start[1]) * t,
      start[2] + (end[2] - start[2]) * t,
    ]);
  }

  return samples;
}

export function findInterpolationBounds(
  contours: ContourSlice[],
  targetSlicePosition: number
): { lower: ContourSlice; upper: ContourSlice } | null {
  const sorted = [...contours]
    .filter((contour) => contour.isClosed && contour.points.length >= 9)
    .sort((a, b) => a.slicePosition - b.slicePosition);

  const lower = [...sorted].reverse().find((contour) => contour.slicePosition < targetSlicePosition);
  const upper = sorted.find((contour) => contour.slicePosition > targetSlicePosition);

  return lower && upper ? { lower, upper } : null;
}

export function interpolateContourSlice(
  lower: ContourSlice,
  upper: ContourSlice,
  targetSlicePosition: number,
  referencedSOPInstanceUID: string,
  sampleCount = DEFAULT_SAMPLE_COUNT
): ContourSlice | null {
  if (lower.slicePosition === upper.slicePosition) return null;

  const lowerPoints = resampleClosedContour(lower, sampleCount);
  const upperPoints = resampleClosedContour(upper, sampleCount);
  if (lowerPoints.length !== sampleCount || upperPoints.length !== sampleCount) return null;

  const t = (targetSlicePosition - lower.slicePosition) / (upper.slicePosition - lower.slicePosition);
  if (t <= 0 || t >= 1) return null;

  const points = new Float32Array(sampleCount * 3);
  for (let index = 0; index < sampleCount; index += 1) {
    points[index * 3] = lowerPoints[index][0] + (upperPoints[index][0] - lowerPoints[index][0]) * t;
    points[index * 3 + 1] = lowerPoints[index][1] + (upperPoints[index][1] - lowerPoints[index][1]) * t;
    points[index * 3 + 2] = targetSlicePosition;
  }

  return {
    referencedSOPInstanceUID,
    slicePosition: targetSlicePosition,
    points,
    isClosed: true,
  };
}

export function interpolateContourForSlice(
  contours: ContourSlice[],
  targetSlicePosition: number,
  referencedSOPInstanceUID: string,
  sampleCount = DEFAULT_SAMPLE_COUNT
): ContourSlice | null {
  const bounds = findInterpolationBounds(contours, targetSlicePosition);
  if (!bounds) return null;

  return interpolateContourSlice(
    bounds.lower,
    bounds.upper,
    targetSlicePosition,
    referencedSOPInstanceUID,
    sampleCount
  );
}

export interface InterpolationFrame {
  sopInstanceUID: string;
  sliceLocation: number;
}

export function interpolateMissingContoursForFrames(
  contours: ContourSlice[],
  frames: InterpolationFrame[],
  sampleCount = DEFAULT_SAMPLE_COUNT,
  maxMissingFrames = Number.POSITIVE_INFINITY
): ContourSlice[] {
  const sortedFrames = [...frames]
    .filter((frame) => Number.isFinite(frame.sliceLocation))
    .sort((a, b) => a.sliceLocation - b.sliceLocation);
  const sortedContours = [...contours]
    .filter((contour) => contour.isClosed && contour.points.length >= 9)
    .sort((a, b) => a.slicePosition - b.slicePosition);
  const existingPositions = new Set(sortedContours.map((contour) => contour.slicePosition));
  const interpolated: ContourSlice[] = [];

  for (let index = 0; index < sortedContours.length - 1; index += 1) {
    const lower = sortedContours[index];
    const upper = sortedContours[index + 1];
    const gapFrames = sortedFrames.filter(
      (frame) =>
        frame.sliceLocation > lower.slicePosition &&
        frame.sliceLocation < upper.slicePosition &&
        !existingPositions.has(frame.sliceLocation)
    );
    if (gapFrames.length === 0 || gapFrames.length > maxMissingFrames) {
      continue;
    }

    for (const frame of gapFrames) {
      const contour = interpolateContourSlice(
        lower,
        upper,
        frame.sliceLocation,
        frame.sopInstanceUID,
        sampleCount
      );
      if (contour) {
        interpolated.push(contour);
        existingPositions.add(frame.sliceLocation);
      }
    }
  }

  return interpolated;
}
