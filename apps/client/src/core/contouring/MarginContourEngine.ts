import type { ContourSlice, Volume } from '@contourlab/shared-types';
import type { InterpolationFrame } from './InterpolationEngine';

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

function computeFilledBounds(mask: Uint8Array, width: number, height: number): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} | null {
  let minX = width;
  let maxX = -1;
  let minY = height;
  let maxY = -1;

  for (let yIndex = 0; yIndex < height; yIndex += 1) {
    for (let xIndex = 0; xIndex < width; xIndex += 1) {
      if (mask[yIndex * width + xIndex] !== 1) continue;
      minX = Math.min(minX, xIndex);
      maxX = Math.max(maxX, xIndex);
      minY = Math.min(minY, yIndex);
      maxY = Math.max(maxY, yIndex);
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  return { minX, maxX, minY, maxY };
}

function buildKernel(volume: Volume, marginMm: number): Array<[number, number]> {
  const radius = Math.abs(marginMm);
  if (radius <= 0) return [[0, 0]];

  const maxDx = Math.ceil(radius / volume.spacing[0]);
  const maxDy = Math.ceil(radius / volume.spacing[1]);
  const kernel: Array<[number, number]> = [];

  for (let dy = -maxDy; dy <= maxDy; dy += 1) {
    for (let dx = -maxDx; dx <= maxDx; dx += 1) {
      const distanceMm = Math.hypot(dx * volume.spacing[0], dy * volume.spacing[1]);
      if (distanceMm <= radius + 1e-6) {
        kernel.push([dx, dy]);
      }
    }
  }

  return kernel;
}

function applyMaskMargin(mask: Uint8Array, volume: Volume, marginMm: number): Uint8Array {
  if (marginMm === 0) return new Uint8Array(mask);

  const width = volume.dimensions[0];
  const height = volume.dimensions[1];
  const result = new Uint8Array(width * height);
  const bounds = computeFilledBounds(mask, width, height);
  if (!bounds) return result;

  const kernel = buildKernel(volume, marginMm);
  const expand = marginMm > 0;
  const rangeX = Math.ceil(Math.abs(marginMm) / volume.spacing[0]);
  const rangeY = Math.ceil(Math.abs(marginMm) / volume.spacing[1]);
  const startX = Math.max(0, bounds.minX - rangeX);
  const endX = Math.min(width - 1, bounds.maxX + rangeX);
  const startY = Math.max(0, bounds.minY - rangeY);
  const endY = Math.min(height - 1, bounds.maxY + rangeY);

  for (let yIndex = startY; yIndex <= endY; yIndex += 1) {
    for (let xIndex = startX; xIndex <= endX; xIndex += 1) {
      const sourceFilled = mask[yIndex * width + xIndex] === 1;
      if (!expand && !sourceFilled) continue;

      if (expand) {
        let hit = false;
        for (const [dx, dy] of kernel) {
          const nx = xIndex + dx;
          const ny = yIndex + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          if (mask[ny * width + nx] === 1) {
            hit = true;
            break;
          }
        }
        result[yIndex * width + xIndex] = Number(hit);
      } else {
        let preserved = true;
        for (const [dx, dy] of kernel) {
          const nx = xIndex + dx;
          const ny = yIndex + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height || mask[ny * width + nx] !== 1) {
            preserved = false;
            break;
          }
        }
        result[yIndex * width + xIndex] = Number(preserved);
      }
    }
  }

  return result;
}

export function computeMarginContoursForStructure(
  contours: ContourSlice[],
  frames: InterpolationFrame[],
  volume: Volume,
  marginMm: number
): ContourSlice[] {
  const tolerance = Math.max(volume.spacing[2] / 2, 0.01);
  const candidateFrames = frames.filter((frame) =>
    sliceContoursAtPosition(contours, frame.sliceLocation, tolerance).length > 0
  );

  return candidateFrames
    .map((frame) => {
      const sourceMask = rasterizeContoursToMask(
        sliceContoursAtPosition(contours, frame.sliceLocation, tolerance),
        volume
      );
      const marginMask = applyMaskMargin(sourceMask, volume, marginMm);
      return maskToContourSlice(marginMask, volume, frame.sliceLocation, frame.sopInstanceUID);
    })
    .filter((contour): contour is ContourSlice => contour !== null)
    .sort((a, b) => a.slicePosition - b.slicePosition);
}
