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

export function intersectContourWithPlane(
  points: Float32Array,
  axis: 0 | 1,
  planePosition: number,
  tolerance = 0.01
): WorldPoint[] {
  const intersections: WorldPoint[] = [];
  const pointCount = Math.floor(points.length / 3);
  if (pointCount < 2) return intersections;

  const addPoint = (point: WorldPoint) => {
    const previous = intersections.at(-1);
    if (
      previous &&
      Math.abs(previous[0] - point[0]) <= tolerance &&
      Math.abs(previous[1] - point[1]) <= tolerance &&
      Math.abs(previous[2] - point[2]) <= tolerance
    ) {
      return;
    }
    intersections.push(point);
  };

  for (let index = 0; index < pointCount; index += 1) {
    const nextIndex = (index + 1) % pointCount;
    const a: WorldPoint = [
      points[index * 3],
      points[index * 3 + 1],
      points[index * 3 + 2],
    ];
    const b: WorldPoint = [
      points[nextIndex * 3],
      points[nextIndex * 3 + 1],
      points[nextIndex * 3 + 2],
    ];
    const av = a[axis];
    const bv = b[axis];
    const da = av - planePosition;
    const db = bv - planePosition;

    if (Math.abs(da) <= tolerance && Math.abs(db) <= tolerance) {
      addPoint(a);
      addPoint(b);
      continue;
    }

    if (Math.abs(da) <= tolerance) {
      addPoint(a);
      continue;
    }

    if (da * db > 0 || av === bv) {
      continue;
    }

    const t = (planePosition - av) / (bv - av);
    if (t < 0 || t > 1) continue;
    addPoint([
      a[0] + (b[0] - a[0]) * t,
      a[1] + (b[1] - a[1]) * t,
      a[2] + (b[2] - a[2]) * t,
    ]);
  }

  return intersections;
}

export function projectPolylineToCanvasPath(
  points: WorldPoint[],
  worldToCanvas: (point: WorldPoint) => [number, number]
): string {
  return points
    .map((point, index) => {
      const [x, y] = worldToCanvas(point);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');
}

export function buildCrossPlaneBoundaryPath(
  contourPointSets: Float32Array[],
  axis: 0 | 1,
  planePosition: number,
  worldToCanvas: (point: WorldPoint) => [number, number]
): string {
  const inPlaneAxis = axis === 0 ? 1 : 0;
  const zTolerance = 0.01;
  const segments = contourPointSets
    .flatMap((points) => {
      const intersections = intersectContourWithPlane(points, axis, planePosition);
      if (intersections.length < 2) return [];

      const sorted = [...intersections].sort((a, b) => a[inPlaneAxis] - b[inPlaneAxis]);
      const pairedSegments = [];
      for (let index = 0; index + 1 < sorted.length; index += 2) {
        const low = sorted[index];
        const high = sorted[index + 1];
        pairedSegments.push({ z: (low[2] + high[2]) / 2, low, high });
      }
      return pairedSegments;
    })
    .sort((a, b) => a.z - b.z);

  if (segments.length === 0) return '';

  const sliceGroups = segments.reduce<Array<typeof segments>>((groups, segment) => {
    const current = groups.at(-1);
    if (current && Math.abs(current[0].z - segment.z) <= zTolerance) {
      current.push(segment);
    } else {
      groups.push([segment]);
    }
    return groups;
  }, []);

  const paths: string[] = [];
  let lowBoundary: WorldPoint[] = [];
  let highBoundary: WorldPoint[] = [];

  const flushBoundary = () => {
    if (lowBoundary.length === 1 && highBoundary.length === 1) {
      paths.push(projectPolylineToCanvasPath([lowBoundary[0], highBoundary[0]], worldToCanvas));
    } else {
      if (lowBoundary.length >= 2) {
        paths.push(projectPolylineToCanvasPath(lowBoundary, worldToCanvas));
      }
      if (highBoundary.length >= 2) {
        paths.push(projectPolylineToCanvasPath(highBoundary, worldToCanvas));
      }
    }
    lowBoundary = [];
    highBoundary = [];
  };

  for (const group of sliceGroups) {
    const representativeSegment = group.reduce((longest, segment) => {
      const currentLength = Math.abs(segment.high[inPlaneAxis] - segment.low[inPlaneAxis]);
      const longestLength = Math.abs(longest.high[inPlaneAxis] - longest.low[inPlaneAxis]);
      return currentLength > longestLength ? segment : longest;
    });
    lowBoundary.push(representativeSegment.low);
    highBoundary.push(representativeSegment.high);
  }

  flushBoundary();
  return paths.join(' ');
}
