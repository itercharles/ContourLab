import type { ContourSlice, Volume } from '@webtps/shared-types';
import { voxelToWorld, worldToContinuousVoxel } from '../rendering/threeDGeometry';
import type { WorldPoint } from './contourOverlayUtils';

type MprOrientation = 'SAGITTAL' | 'CORONAL';

// Voxel axes used for the 2-D mask grid that this reslice rasterizes into.
// The "fixed" voxel axis is the one perpendicular to the MPR plane (e.g. the I
// axis for SAGITTAL on an axial scan). The remaining two axes form the (h, v)
// grid of the rasterized mask: v is always the slice (K) axis since contours
// come from axial slices, and h is the in-plane axis that varies along the
// horizontal of the MPR display.
//
// IMPORTANT: For non-axis-aligned (oblique) volumes, the world plane
// `worldAxis = planePosition` does not correspond to a single voxel column.
// This function handles the common axial case where the volume's direction is
// diagonal (each voxel basis vector is parallel to a world axis, possibly
// flipped). Picking `fixedVoxelAxis = worldAxis` is exact in that case.
interface VoxelAxes {
  fixedVoxelAxis: 0 | 1 | 2;
  horizontalVoxelAxis: 0 | 1 | 2;
  verticalVoxelAxis: 0 | 1 | 2;
}

function getVoxelAxes(orientation: MprOrientation): VoxelAxes {
  if (orientation === 'SAGITTAL') {
    return { fixedVoxelAxis: 0, horizontalVoxelAxis: 1, verticalVoxelAxis: 2 };
  }
  return { fixedVoxelAxis: 1, horizontalVoxelAxis: 0, verticalVoxelAxis: 2 };
}

type Vec3 = [number, number, number];

function pointsToVoxel(points: Float32Array, volume: Volume): Vec3[] {
  const voxels: Vec3[] = [];
  for (let index = 0; index < points.length; index += 3) {
    voxels.push(
      worldToContinuousVoxel(
        [points[index], points[index + 1], points[index + 2]],
        volume
      )
    );
  }
  return voxels;
}

function getVoxelBounds(voxelPoints: Vec3[], axis: 0 | 1 | 2): [number, number] {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const point of voxelPoints) {
    const value = point[axis];
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return [min, max];
}

// Average voxel-axis value across a polygon's voxel points. Used to assign each
// axial contour to a single slice index (K) on the mask grid — voxel-space
// rasterization replaces the previous direct world-Z math, which assumed the
// K basis points in +Z and silently dropped contours on HFP / FFS scans.
function getAverageVoxelAxis(voxelPoints: Vec3[], axis: 0 | 1 | 2): number {
  let total = 0;
  for (const point of voxelPoints) total += point[axis];
  return total / voxelPoints.length;
}

function isInsideVoxelPolygon(
  voxelPoints: Vec3[],
  fixedAxis: 0 | 1 | 2,
  horizontalAxis: 0 | 1 | 2,
  fixedPosition: number,
  horizontalPosition: number
): boolean {
  let inside = false;
  const count = voxelPoints.length;
  if (count < 3) return false;

  for (let index = 0, previousIndex = count - 1; index < count; previousIndex = index, index += 1) {
    const xi = voxelPoints[index][fixedAxis];
    const yi = voxelPoints[index][horizontalAxis];
    const xj = voxelPoints[previousIndex][fixedAxis];
    const yj = voxelPoints[previousIndex][horizontalAxis];

    const intersects =
      yi > horizontalPosition !== yj > horizontalPosition &&
      fixedPosition <
        ((xj - xi) * (horizontalPosition - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
}

function makeBoundaryWorldPoint(
  axes: VoxelAxes,
  fixedVoxel: number,
  horizontalVoxel: number,
  verticalVoxel: number,
  volume: Volume
): WorldPoint {
  const voxel: Vec3 = [0, 0, 0];
  voxel[axes.fixedVoxelAxis] = fixedVoxel;
  voxel[axes.horizontalVoxelAxis] = horizontalVoxel;
  voxel[axes.verticalVoxelAxis] = verticalVoxel;
  return voxelToWorld(voxel, volume);
}

function projectBoundaryEdge(
  axes: VoxelAxes,
  fixedVoxel: number,
  hStart: number,
  vStart: number,
  hEnd: number,
  vEnd: number,
  volume: Volume,
  worldToCanvas: (point: WorldPoint) => [number, number]
): string {
  const a = makeBoundaryWorldPoint(axes, fixedVoxel, hStart, vStart, volume);
  const b = makeBoundaryWorldPoint(axes, fixedVoxel, hEnd, vEnd, volume);
  const [x1, y1] = worldToCanvas(a);
  const [x2, y2] = worldToCanvas(b);
  return `M ${x1} ${y1} L ${x2} ${y2}`;
}

export function buildMprMaskBoundaryPath(
  volume: Volume,
  contours: ContourSlice[],
  orientation: MprOrientation,
  planePosition: number,
  worldToCanvas: (point: WorldPoint) => [number, number]
): string {
  const axes = getVoxelAxes(orientation);
  // World axis whose value is held constant by the MPR plane (X for SAGITTAL,
  // Y for CORONAL). For diagonal-direction volumes this maps onto a single
  // voxel column at axes.fixedVoxelAxis.
  const planeWorldAxis = orientation === 'SAGITTAL' ? 0 : 1;
  const horizontalSize = volume.dimensions[axes.horizontalVoxelAxis];
  const verticalSize = volume.dimensions[axes.verticalVoxelAxis];
  if (horizontalSize <= 0 || verticalSize <= 0) return '';

  // Project (planePosition along the world axis, origin elsewhere) into voxel
  // space and read out the fixed voxel axis. For diagonal direction this is
  // exact; for non-diagonal direction it assumes the other world axes coincide
  // with the volume origin's plane, which is sufficient for axis-aligned axial
  // CT data.
  const planeProbe: Vec3 = [volume.origin[0], volume.origin[1], volume.origin[2]];
  planeProbe[planeWorldAxis] = planePosition;
  const fixedVoxel = worldToContinuousVoxel(planeProbe, volume)[axes.fixedVoxelAxis];

  const mask = new Uint8Array(horizontalSize * verticalSize);

  for (const contour of contours) {
    if (contour.points.length < 9) continue;
    const voxelPoints = pointsToVoxel(contour.points, volume);
    if (voxelPoints.length < 3) continue;

    const fixedBounds = getVoxelBounds(voxelPoints, axes.fixedVoxelAxis);
    if (fixedVoxel < fixedBounds[0] || fixedVoxel > fixedBounds[1]) continue;

    // Each axial contour rasterizes onto exactly one K row of the (h, v) mask.
    // Use the average K of the contour's voxel points so the assignment is
    // robust to floating-point noise across the polygon vertices.
    const verticalCenter = getAverageVoxelAxis(voxelPoints, axes.verticalVoxelAxis);
    const verticalIndex = Math.round(verticalCenter);
    if (verticalIndex < 0 || verticalIndex >= verticalSize) continue;

    const horizontalBounds = getVoxelBounds(voxelPoints, axes.horizontalVoxelAxis);
    const start = Math.max(0, Math.floor(horizontalBounds[0]));
    const end = Math.min(horizontalSize - 1, Math.ceil(horizontalBounds[1]));

    for (let horizontalIndex = start; horizontalIndex <= end; horizontalIndex += 1) {
      // Pixel-center sampling — the rendered mask is interpreted as voxel
      // centres so the boundary edges land on voxel boundaries (±0.5).
      const horizontalPosition = horizontalIndex;
      if (
        isInsideVoxelPolygon(
          voxelPoints,
          axes.fixedVoxelAxis,
          axes.horizontalVoxelAxis,
          fixedVoxel,
          horizontalPosition
        )
      ) {
        mask[verticalIndex * horizontalSize + horizontalIndex] = 1;
      }
    }
  }

  const isFilled = (horizontalIndex: number, verticalIndex: number) => {
    if (
      horizontalIndex < 0 ||
      horizontalIndex >= horizontalSize ||
      verticalIndex < 0 ||
      verticalIndex >= verticalSize
    ) {
      return false;
    }
    return mask[verticalIndex * horizontalSize + horizontalIndex] === 1;
  };

  // Voxel boundaries (h ± 0.5, v ± 0.5) get converted back to world coords via
  // voxelToWorld so the SVG path is in world space, then projected through the
  // viewport. Going via voxelToWorld means any direction matrix the volume
  // carries (sign flips, oblique rotation) is honoured automatically.
  const paths: string[] = [];
  for (let verticalIndex = 0; verticalIndex < verticalSize; verticalIndex += 1) {
    for (let horizontalIndex = 0; horizontalIndex < horizontalSize; horizontalIndex += 1) {
      if (!isFilled(horizontalIndex, verticalIndex)) continue;

      const h0 = horizontalIndex - 0.5;
      const h1 = horizontalIndex + 0.5;
      const v0 = verticalIndex - 0.5;
      const v1 = verticalIndex + 0.5;

      if (!isFilled(horizontalIndex, verticalIndex - 1)) {
        paths.push(projectBoundaryEdge(axes, fixedVoxel, h0, v0, h1, v0, volume, worldToCanvas));
      }
      if (!isFilled(horizontalIndex + 1, verticalIndex)) {
        paths.push(projectBoundaryEdge(axes, fixedVoxel, h1, v0, h1, v1, volume, worldToCanvas));
      }
      if (!isFilled(horizontalIndex, verticalIndex + 1)) {
        paths.push(projectBoundaryEdge(axes, fixedVoxel, h1, v1, h0, v1, volume, worldToCanvas));
      }
      if (!isFilled(horizontalIndex - 1, verticalIndex)) {
        paths.push(projectBoundaryEdge(axes, fixedVoxel, h0, v1, h0, v0, volume, worldToCanvas));
      }
    }
  }

  return paths.join(' ');
}
