import type { ContourSlice, Volume } from '@webtps/shared-types';
import { intersectContourWithPlane, type WorldPoint } from './contourOverlayUtils';

type MprOrientation = 'SAGITTAL' | 'CORONAL';

function getVoxelIndex(worldPosition: number, origin: number, spacing: number): number {
  return Math.round((worldPosition - origin) / spacing);
}

function getVoxelCenter(index: number, origin: number, spacing: number): number {
  return origin + index * spacing;
}

function getVoxelBoundary(index: number, origin: number, spacing: number): number {
  return origin + (index - 0.5) * spacing;
}

function getContourBounds(points: Float32Array, axis: 0 | 1): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (let index = axis; index < points.length; index += 3) {
    min = Math.min(min, points[index]);
    max = Math.max(max, points[index]);
  }
  return [min, max];
}

function makeWorldPoint(
  orientation: MprOrientation,
  planePosition: number,
  horizontalPosition: number,
  zPosition: number
): WorldPoint {
  return orientation === 'SAGITTAL'
    ? [planePosition, horizontalPosition, zPosition]
    : [horizontalPosition, planePosition, zPosition];
}

function projectBoundaryEdge(
  orientation: MprOrientation,
  planePosition: number,
  horizontalStart: number,
  zStart: number,
  horizontalEnd: number,
  zEnd: number,
  worldToCanvas: (point: WorldPoint) => [number, number]
): string {
  const [x1, y1] = worldToCanvas(makeWorldPoint(orientation, planePosition, horizontalStart, zStart));
  const [x2, y2] = worldToCanvas(makeWorldPoint(orientation, planePosition, horizontalEnd, zEnd));
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

interface BoundaryEdge2D {
  start: [number, number];
  end: [number, number];
}

function makePointKey([x, y]: [number, number]): string {
  return `${x.toFixed(4)}|${y.toFixed(4)}`;
}

function buildClosedBoundaryPaths(
  edges: BoundaryEdge2D[],
  orientation: MprOrientation,
  planePosition: number,
  worldToCanvas: (point: WorldPoint) => [number, number]
): string[] {
  const outgoing = new Map<string, number[]>();
  edges.forEach((edge, index) => {
    const key = makePointKey(edge.start);
    outgoing.set(key, [...(outgoing.get(key) ?? []), index]);
  });

  const visited = new Set<number>();
  const paths: string[] = [];

  for (let index = 0; index < edges.length; index += 1) {
    if (visited.has(index)) continue;

    const loop: Array<[number, number]> = [];
    let currentIndex = index;
    let guard = 0;

    while (!visited.has(currentIndex) && guard < edges.length + 1) {
      guard += 1;
      const edge = edges[currentIndex];
      visited.add(currentIndex);
      if (loop.length === 0) {
        loop.push(edge.start);
      }
      loop.push(edge.end);

      const nextCandidates = outgoing.get(makePointKey(edge.end)) ?? [];
      const nextIndex = nextCandidates.find((candidate) => !visited.has(candidate));
      if (nextIndex === undefined) {
        break;
      }
      currentIndex = nextIndex;
    }

    if (loop.length < 3) continue;
    const commands = loop.map((point, pointIndex) => {
      const [x, y] = worldToCanvas(makeWorldPoint(orientation, planePosition, point[0], point[1]));
      return `${pointIndex === 0 ? 'M' : 'L'} ${x} ${y}`;
    });
    paths.push(`${commands.join(' ')} Z`);
  }

  return paths;
}

export function buildMprMaskBoundaryPath(
  volume: Volume,
  contours: ContourSlice[],
  orientation: MprOrientation,
  planePosition: number,
  worldToCanvas: (point: WorldPoint) => [number, number]
): string {
  const fixedAxis = orientation === 'SAGITTAL' ? 0 : 1;
  const horizontalAxis = orientation === 'SAGITTAL' ? 1 : 0;
  const horizontalSize = volume.dimensions[horizontalAxis];
  const zSize = volume.dimensions[2];
  if (horizontalSize <= 0 || zSize <= 0) return '';

  const mask = new Uint8Array(horizontalSize * zSize);

  for (const contour of contours) {
    const fixedBounds = getContourBounds(contour.points, fixedAxis);
    if (planePosition < fixedBounds[0] || planePosition > fixedBounds[1]) continue;

    const zIndex = getVoxelIndex(contour.slicePosition, volume.origin[2], volume.spacing[2]);
    if (zIndex < 0 || zIndex >= zSize) continue;

    const intersections = intersectContourWithPlane(contour.points, fixedAxis, planePosition);
    if (intersections.length < 2) continue;

    const sorted = [...intersections].sort((a, b) => a[horizontalAxis] - b[horizontalAxis]);
    for (let index = 0; index + 1 < sorted.length; index += 2) {
      const start = Math.max(
        0,
        Math.round((sorted[index][horizontalAxis] - volume.origin[horizontalAxis]) / volume.spacing[horizontalAxis])
      );
      const end = Math.min(
        horizontalSize - 1,
        Math.round((sorted[index + 1][horizontalAxis] - volume.origin[horizontalAxis]) / volume.spacing[horizontalAxis])
      );

      for (let horizontalIndex = Math.min(start, end); horizontalIndex <= Math.max(start, end); horizontalIndex += 1) {
        mask[zIndex * horizontalSize + horizontalIndex] = 1;
      }
    }
  }

  const isFilled = (horizontalIndex: number, zIndex: number) => {
    if (horizontalIndex < 0 || horizontalIndex >= horizontalSize || zIndex < 0 || zIndex >= zSize) {
      return false;
    }
    return mask[zIndex * horizontalSize + horizontalIndex] === 1;
  };

  const boundaryEdges: BoundaryEdge2D[] = [];
  for (let zIndex = 0; zIndex < zSize; zIndex += 1) {
    for (let horizontalIndex = 0; horizontalIndex < horizontalSize; horizontalIndex += 1) {
      if (!isFilled(horizontalIndex, zIndex)) continue;

      const h0 = getVoxelBoundary(horizontalIndex, volume.origin[horizontalAxis], volume.spacing[horizontalAxis]);
      const h1 = getVoxelBoundary(horizontalIndex + 1, volume.origin[horizontalAxis], volume.spacing[horizontalAxis]);
      const z0 = getVoxelBoundary(zIndex, volume.origin[2], volume.spacing[2]);
      const z1 = getVoxelBoundary(zIndex + 1, volume.origin[2], volume.spacing[2]);

      if (!isFilled(horizontalIndex, zIndex - 1)) {
        boundaryEdges.push({ start: [h0, z0], end: [h1, z0] });
      }
      if (!isFilled(horizontalIndex + 1, zIndex)) {
        boundaryEdges.push({ start: [h1, z0], end: [h1, z1] });
      }
      if (!isFilled(horizontalIndex, zIndex + 1)) {
        boundaryEdges.push({ start: [h1, z1], end: [h0, z1] });
      }
      if (!isFilled(horizontalIndex - 1, zIndex)) {
        boundaryEdges.push({ start: [h0, z1], end: [h0, z0] });
      }
    }
  }

  return buildClosedBoundaryPaths(boundaryEdges, orientation, planePosition, worldToCanvas).join(' ');
}
