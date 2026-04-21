import type { ContourSlice, Volume } from '@webtps/shared-types';
import type { InterpolationFrame } from './InterpolationEngine';

export type BooleanOperation = 'union' | 'intersect' | 'subtract';

function isInsidePolygonXY(points: Float32Array, x: number, y: number): boolean {
  let inside = false;
  const pointCount = Math.floor(points.length / 3);
  if (pointCount < 3) return false;

  for (let index = 0, previousIndex = pointCount - 1; index < pointCount; previousIndex = index, index += 1) {
    const xi = points[index * 3];
    const yi = points[index * 3 + 1];
    const xj = points[previousIndex * 3];
    const yj = points[previousIndex * 3 + 1];

    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

function sliceContoursAtPosition(
  contours: ContourSlice[],
  slicePosition: number,
  tolerance: number
): ContourSlice[] {
  return contours.filter(
    (contour) =>
      contour.isClosed &&
      contour.points.length >= 9 &&
      Math.abs(contour.slicePosition - slicePosition) <= tolerance
  );
}

function rasterizeContoursToMask(
  contours: ContourSlice[],
  volume: Volume
): Uint8Array {
  const width = volume.dimensions[0];
  const height = volume.dimensions[1];
  const mask = new Uint8Array(width * height);
  if (width <= 0 || height <= 0 || contours.length === 0) return mask;

  for (const contour of contours) {
    let minX = Number.POSITIVE_INFINITY;
    let maxX = Number.NEGATIVE_INFINITY;
    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (let index = 0; index < contour.points.length; index += 3) {
      minX = Math.min(minX, contour.points[index]);
      maxX = Math.max(maxX, contour.points[index]);
      minY = Math.min(minY, contour.points[index + 1]);
      maxY = Math.max(maxY, contour.points[index + 1]);
    }

    const startX = Math.max(0, Math.floor((minX - volume.origin[0]) / volume.spacing[0]));
    const endX = Math.min(width - 1, Math.ceil((maxX - volume.origin[0]) / volume.spacing[0]));
    const startY = Math.max(0, Math.floor((minY - volume.origin[1]) / volume.spacing[1]));
    const endY = Math.min(height - 1, Math.ceil((maxY - volume.origin[1]) / volume.spacing[1]));

    for (let yIndex = startY; yIndex <= endY; yIndex += 1) {
      const y = volume.origin[1] + yIndex * volume.spacing[1];
      for (let xIndex = startX; xIndex <= endX; xIndex += 1) {
        const x = volume.origin[0] + xIndex * volume.spacing[0];
        if (isInsidePolygonXY(contour.points, x, y)) {
          mask[yIndex * width + xIndex] = 1;
        }
      }
    }
  }

  return mask;
}

function combineMasks(
  sourceMask: Uint8Array,
  targetMask: Uint8Array,
  operation: BooleanOperation
): Uint8Array {
  const next = new Uint8Array(sourceMask.length);
  for (let index = 0; index < sourceMask.length; index += 1) {
    const source = sourceMask[index] === 1;
    const target = targetMask[index] === 1;
    next[index] = operation === 'union'
      ? Number(source || target)
      : operation === 'intersect'
        ? Number(source && target)
        : Number(source && !target);
  }
  return next;
}

type Edge = { start: [number, number]; end: [number, number] };

function keyForPoint([x, y]: [number, number]): string {
  return `${x.toFixed(5)},${y.toFixed(5)}`;
}

function buildBoundaryEdges(mask: Uint8Array, volume: Volume): Edge[] {
  const width = volume.dimensions[0];
  const height = volume.dimensions[1];
  const edges: Edge[] = [];
  const isFilled = (x: number, y: number) =>
    x >= 0 && x < width && y >= 0 && y < height && mask[y * width + x] === 1;

  for (let yIndex = 0; yIndex < height; yIndex += 1) {
    for (let xIndex = 0; xIndex < width; xIndex += 1) {
      if (!isFilled(xIndex, yIndex)) continue;

      const x0 = volume.origin[0] + (xIndex - 0.5) * volume.spacing[0];
      const x1 = volume.origin[0] + (xIndex + 0.5) * volume.spacing[0];
      const y0 = volume.origin[1] + (yIndex - 0.5) * volume.spacing[1];
      const y1 = volume.origin[1] + (yIndex + 0.5) * volume.spacing[1];

      if (!isFilled(xIndex, yIndex - 1)) edges.push({ start: [x0, y0], end: [x1, y0] });
      if (!isFilled(xIndex + 1, yIndex)) edges.push({ start: [x1, y0], end: [x1, y1] });
      if (!isFilled(xIndex, yIndex + 1)) edges.push({ start: [x1, y1], end: [x0, y1] });
      if (!isFilled(xIndex - 1, yIndex)) edges.push({ start: [x0, y1], end: [x0, y0] });
    }
  }

  return edges;
}

function traceLoops(edges: Edge[]): Array<Array<[number, number]>> {
  const adjacency = new Map<string, Edge[]>();
  for (const edge of edges) {
    const key = keyForPoint(edge.start);
    adjacency.set(key, [...(adjacency.get(key) ?? []), edge]);
  }

  const visited = new Set<Edge>();
  const loops: Array<Array<[number, number]>> = [];

  for (const edge of edges) {
    if (visited.has(edge)) continue;

    const loop: Array<[number, number]> = [edge.start];
    let current = edge;
    visited.add(current);

    while (true) {
      loop.push(current.end);
      const nextKey = keyForPoint(current.end);
      const nextEdge = (adjacency.get(nextKey) ?? []).find((candidate) => !visited.has(candidate));
      if (!nextEdge) break;
      current = nextEdge;
      visited.add(current);
      if (keyForPoint(current.start) === keyForPoint(loop[0])) {
        continue;
      }
    }

    if (loop.length >= 4 && keyForPoint(loop[0]) === keyForPoint(loop.at(-1)!)) {
      loops.push(loop.slice(0, -1));
    }
  }

  return loops;
}

function removeCollinearPoints(points: Array<[number, number]>): Array<[number, number]> {
  if (points.length < 4) return points;

  const reduced: Array<[number, number]> = [];
  for (let index = 0; index < points.length; index += 1) {
    const previous = points[(index - 1 + points.length) % points.length];
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross =
      (current[0] - previous[0]) * (next[1] - current[1]) -
      (current[1] - previous[1]) * (next[0] - current[0]);
    if (Math.abs(cross) > 1e-5) {
      reduced.push(current);
    }
  }
  return reduced;
}

function polygonArea(points: Array<[number, number]>): number {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function maskToContourSlice(
  mask: Uint8Array,
  volume: Volume,
  slicePosition: number,
  referencedSOPInstanceUID: string
): ContourSlice | null {
  const edges = buildBoundaryEdges(mask, volume);
  if (edges.length === 0) return null;

  const loops = traceLoops(edges)
    .map(removeCollinearPoints)
    .filter((loop) => loop.length >= 3);
  if (loops.length === 0) return null;

  const largestLoop = loops.sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)))[0];
  const points = new Float32Array(largestLoop.length * 3);
  largestLoop.forEach(([x, y], index) => {
    points[index * 3] = x;
    points[index * 3 + 1] = y;
    points[index * 3 + 2] = slicePosition;
  });

  return {
    referencedSOPInstanceUID,
    slicePosition,
    points,
    isClosed: true,
  };
}

export function computeBooleanContoursForStructure(
  sourceContours: ContourSlice[],
  targetContours: ContourSlice[],
  frames: InterpolationFrame[],
  volume: Volume,
  operation: BooleanOperation
): ContourSlice[] {
  const tolerance = Math.max(volume.spacing[2] / 2, 0.01);
  const candidateFrames = frames.filter((frame) => {
    const hasSource = sliceContoursAtPosition(sourceContours, frame.sliceLocation, tolerance).length > 0;
    const hasTarget = sliceContoursAtPosition(targetContours, frame.sliceLocation, tolerance).length > 0;
    return hasSource || hasTarget;
  });

  return candidateFrames
    .map((frame) => {
      const sourceMask = rasterizeContoursToMask(
        sliceContoursAtPosition(sourceContours, frame.sliceLocation, tolerance),
        volume
      );
      const targetMask = rasterizeContoursToMask(
        sliceContoursAtPosition(targetContours, frame.sliceLocation, tolerance),
        volume
      );
      const combinedMask = combineMasks(sourceMask, targetMask, operation);
      return maskToContourSlice(combinedMask, volume, frame.sliceLocation, frame.sopInstanceUID);
    })
    .filter((contour): contour is ContourSlice => contour !== null)
    .sort((a, b) => a.slicePosition - b.slicePosition);
}
