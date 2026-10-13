import type { ContourSlice, Volume } from '@contourlab/shared-types';
import { voxelToWorld, worldToContinuousVoxel } from '../rendering/threeDGeometry';

// Shared by the boolean and margin engines. Everything is done on the volume's voxel grid, so the
// result is right for any axis-aligned direction matrix (HFS, HFP, FFS, FFP): world positions are
// converted through the direction cosines instead of assuming column i points along +x.

type Vec2 = [number, number];

export function sliceContoursAtPosition(
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

export function sliceTolerance(volume: Volume): number {
  return Math.max(volume.spacing[2] / 2, 0.01);
}

// Contours the engines cannot place on a slice frame. Dropping them silently would delete part of
// the structure, so the engines keep them as they are.
export function contoursWithoutFrame(
  contours: ContourSlice[],
  framePositions: number[],
  tolerance: number
): ContourSlice[] {
  return contours.filter(
    (contour) => !framePositions.some((position) => Math.abs(contour.slicePosition - position) <= tolerance)
  );
}

function toVoxelPolygon(points: Float32Array, volume: Volume): Vec2[] {
  const polygon: Vec2[] = [];
  for (let index = 0; index < points.length; index += 3) {
    const [i, j] = worldToContinuousVoxel([points[index], points[index + 1], points[index + 2]], volume);
    polygon.push([i, j]);
  }
  return polygon;
}

function isInsidePolygon(polygon: Vec2[], x: number, y: number): boolean {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const [xi, yi] = polygon[index];
    const [xj, yj] = polygon[previous];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// Even-odd fill across all contours on the slice: a contour inside another cuts a hole, which is how
// the rest of the application (3D mask, volume) reads nested contours.
export function rasterizeContoursToMask(contours: ContourSlice[], volume: Volume): Uint8Array {
  const width = volume.dimensions[0];
  const height = volume.dimensions[1];
  const mask = new Uint8Array(width * height);
  if (width <= 0 || height <= 0) return mask;

  for (const contour of contours) {
    const polygon = toVoxelPolygon(contour.points, volume);
    if (polygon.length < 3) continue;

    let minI = Number.POSITIVE_INFINITY;
    let maxI = Number.NEGATIVE_INFINITY;
    let minJ = Number.POSITIVE_INFINITY;
    let maxJ = Number.NEGATIVE_INFINITY;
    for (const [i, j] of polygon) {
      minI = Math.min(minI, i);
      maxI = Math.max(maxI, i);
      minJ = Math.min(minJ, j);
      maxJ = Math.max(maxJ, j);
    }

    const startI = Math.max(0, Math.floor(minI));
    const endI = Math.min(width - 1, Math.ceil(maxI));
    const startJ = Math.max(0, Math.floor(minJ));
    const endJ = Math.min(height - 1, Math.ceil(maxJ));

    for (let j = startJ; j <= endJ; j += 1) {
      for (let i = startI; i <= endI; i += 1) {
        if (isInsidePolygon(polygon, i, j)) mask[j * width + i] ^= 1;
      }
    }
  }

  return mask;
}

// Boundary edges between filled and empty pixels, on integer corner coordinates: pixel (i, j) covers
// corners [i, i + 1] x [j, j + 1]. Each edge is directed so the filled pixel is on its right.
interface Edge {
  from: number;
  to: number;
  dx: number;
  dy: number;
}

function buildEdges(mask: Uint8Array, width: number, height: number): Edge[] {
  const stride = width + 1;
  const corner = (x: number, y: number) => y * stride + x;
  const filled = (i: number, j: number) =>
    i >= 0 && i < width && j >= 0 && j < height && mask[j * width + i] === 1;
  const edges: Edge[] = [];

  for (let j = 0; j < height; j += 1) {
    for (let i = 0; i < width; i += 1) {
      if (!filled(i, j)) continue;
      if (!filled(i, j - 1)) edges.push({ from: corner(i, j), to: corner(i + 1, j), dx: 1, dy: 0 });
      if (!filled(i + 1, j)) edges.push({ from: corner(i + 1, j), to: corner(i + 1, j + 1), dx: 0, dy: 1 });
      if (!filled(i, j + 1)) edges.push({ from: corner(i + 1, j + 1), to: corner(i, j + 1), dx: -1, dy: 0 });
      if (!filled(i - 1, j)) edges.push({ from: corner(i, j + 1), to: corner(i, j), dx: 0, dy: -1 });
    }
  }

  return edges;
}

// At a vertex where two pieces touch only at a corner, prefer the right turn, then straight, then
// left: that keeps the two pieces as separate loops (4-connected) instead of joining them.
function turnRank(incoming: Edge, candidate: Edge): number {
  const cross = incoming.dx * candidate.dy - incoming.dy * candidate.dx;
  const dot = incoming.dx * candidate.dx + incoming.dy * candidate.dy;
  if (cross > 0) return 0;
  if (dot > 0) return 1;
  return 2;
}

function traceLoops(edges: Edge[], width: number): Vec2[][] {
  const stride = width + 1;
  const outgoing = new Map<number, Edge[]>();
  for (const edge of edges) {
    const list = outgoing.get(edge.from);
    if (list) list.push(edge);
    else outgoing.set(edge.from, [edge]);
  }

  const used = new Set<Edge>();
  const loops: Vec2[][] = [];

  for (const first of edges) {
    if (used.has(first)) continue;
    const loop: Vec2[] = [];
    let current: Edge | undefined = first;

    while (current && !used.has(current)) {
      used.add(current);
      loop.push([current.from % stride, Math.floor(current.from / stride)]);
      const incoming: Edge = current;
      current = (outgoing.get(incoming.to) ?? [])
        .filter((candidate) => !used.has(candidate))
        .sort((a, b) => turnRank(incoming, a) - turnRank(incoming, b))[0];
    }

    if (loop.length >= 4) loops.push(loop);
  }

  return loops;
}

function dropCollinear(loop: Vec2[]): Vec2[] {
  const reduced: Vec2[] = [];
  for (let index = 0; index < loop.length; index += 1) {
    const previous = loop[(index - 1 + loop.length) % loop.length];
    const current = loop[index];
    const next = loop[(index + 1) % loop.length];
    const cross =
      (current[0] - previous[0]) * (next[1] - current[1]) -
      (current[1] - previous[1]) * (next[0] - current[0]);
    if (cross !== 0) reduced.push(current);
  }
  return reduced;
}

// Every outline of the mask, outer boundaries and holes alike, as separate closed contours on the
// same slice. A pixel's centre is its integer voxel index, so a corner sits half a voxel off it.
export function maskToContourSlices(
  mask: Uint8Array,
  volume: Volume,
  slicePosition: number,
  referencedSOPInstanceUID: string
): ContourSlice[] {
  const width = volume.dimensions[0];
  const height = volume.dimensions[1];
  const edges = buildEdges(mask, width, height);
  if (edges.length === 0) return [];

  const sliceIndex = worldToContinuousVoxel(
    [volume.origin[0], volume.origin[1], slicePosition],
    volume
  )[2];

  return traceLoops(edges, width)
    .map(dropCollinear)
    .filter((loop) => loop.length >= 3)
    .map((loop) => {
      const points = new Float32Array(loop.length * 3);
      loop.forEach(([cx, cy], index) => {
        const [x, y] = voxelToWorld([cx - 0.5, cy - 0.5, sliceIndex], volume);
        points[index * 3] = x;
        points[index * 3 + 1] = y;
        points[index * 3 + 2] = slicePosition;
      });
      return { referencedSOPInstanceUID, slicePosition, points, isClosed: true };
    });
}
