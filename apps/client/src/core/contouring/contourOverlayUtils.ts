import type { ContourSlice } from '@webtps/shared-types';

export type WorldPoint = [number, number, number];

export function flattenWorldPoints(points: WorldPoint[]): Float32Array {
  return new Float32Array(points.flatMap(([x, y, z]) => [x, y, z]));
}

export function isContourOnSlice(
  contourSlicePosition: number,
  currentSlicePosition: number,
  tolerance: number
): boolean {
  return Math.abs(contourSlicePosition - currentSlicePosition) <= tolerance;
}

export function isContourOnFrame(
  contour: ContourSlice,
  currentSOPInstanceUID: string | undefined,
  currentSlicePosition: number,
  tolerance: number
): boolean {
  if (currentSOPInstanceUID && contour.referencedSOPInstanceUID) {
    return contour.referencedSOPInstanceUID === currentSOPInstanceUID;
  }

  return isContourOnSlice(contour.slicePosition, currentSlicePosition, tolerance);
}

export function findContourOnSlice(
  contours: ContourSlice[],
  currentSlicePosition: number,
  tolerance: number
): ContourSlice | undefined {
  return contours.reduce<ContourSlice | undefined>((closest, contour) => {
    if (!isContourOnSlice(contour.slicePosition, currentSlicePosition, tolerance)) {
      return closest;
    }

    if (!closest) return contour;

    return Math.abs(contour.slicePosition - currentSlicePosition) <
      Math.abs(closest.slicePosition - currentSlicePosition)
      ? contour
      : closest;
  }, undefined);
}

export function findContourOnFrame(
  contours: ContourSlice[],
  currentSOPInstanceUID: string | undefined,
  currentSlicePosition: number,
  tolerance: number
): ContourSlice | undefined {
  return contours.reduce<ContourSlice | undefined>((closest, contour) => {
    if (!isContourOnFrame(contour, currentSOPInstanceUID, currentSlicePosition, tolerance)) {
      return closest;
    }

    if (!closest) return contour;

    return Math.abs(contour.slicePosition - currentSlicePosition) <
      Math.abs(closest.slicePosition - currentSlicePosition)
      ? contour
      : closest;
  }, undefined);
}

export function projectContourToCanvasPath(
  points: Float32Array,
  worldToCanvas: (point: WorldPoint) => [number, number]
): string {
  const projected: string[] = [];

  for (let i = 0; i < points.length; i += 3) {
    const [x, y] = worldToCanvas([
      points[i],
      points[i + 1],
      points[i + 2],
    ]);
    projected.push(`${i === 0 ? 'M' : 'L'} ${x} ${y}`);
  }

  return projected.join(' ');
}
