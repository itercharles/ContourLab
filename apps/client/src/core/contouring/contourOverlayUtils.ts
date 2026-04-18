import type { ContourSlice } from '@webtps/shared-types';

export type WorldPoint = [number, number, number];

export interface ContourViewportTransformLike {
  getCamera?: () => {
    focalPoint?: [number, number, number];
    position?: [number, number, number];
    parallelScale?: number;
  };
  getZoom?: () => number;
  worldToCanvas?: (point: WorldPoint) => [number, number];
}

export function flattenWorldPoints(points: WorldPoint[]): Float32Array {
  return new Float32Array(points.flatMap(([x, y, z]) => [x, y, z]));
}

function formatSignatureNumber(value: number | undefined): string {
  return Number.isFinite(value) ? value!.toFixed(3) : 'n/a';
}

export function getViewportTransformSignature(
  viewport: ContourViewportTransformLike | undefined,
  canvasRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'> | undefined
): string {
  const camera = viewport?.getCamera?.();
  const focalPoint = camera?.focalPoint ?? [undefined, undefined, undefined];
  const position = camera?.position ?? [undefined, undefined, undefined];
  const focalWorldPoint: WorldPoint = [
    focalPoint[0] ?? 0,
    focalPoint[1] ?? 0,
    focalPoint[2] ?? 0,
  ];
  let focalCanvasPoint: [number | undefined, number | undefined] = [undefined, undefined];
  let horizontalProbeCanvasPoint: [number | undefined, number | undefined] = [undefined, undefined];

  try {
    focalCanvasPoint = viewport?.worldToCanvas?.(focalWorldPoint) ?? focalCanvasPoint;
    horizontalProbeCanvasPoint = viewport?.worldToCanvas?.([
      focalWorldPoint[0] + 10,
      focalWorldPoint[1],
      focalWorldPoint[2],
    ]) ?? horizontalProbeCanvasPoint;
  } catch {
    focalCanvasPoint = [undefined, undefined];
    horizontalProbeCanvasPoint = [undefined, undefined];
  }

  return [
    ...focalPoint.map(formatSignatureNumber),
    ...position.map(formatSignatureNumber),
    formatSignatureNumber(camera?.parallelScale),
    formatSignatureNumber(viewport?.getZoom?.()),
    ...focalCanvasPoint.map(formatSignatureNumber),
    ...horizontalProbeCanvasPoint.map(formatSignatureNumber),
    formatSignatureNumber(canvasRect?.left),
    formatSignatureNumber(canvasRect?.top),
    formatSignatureNumber(canvasRect?.width),
    formatSignatureNumber(canvasRect?.height),
  ].join('|');
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
