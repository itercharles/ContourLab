import type { ContourSlice, Volume } from '@webtps/shared-types';
import type { WorldPoint } from './contourOverlayUtils';

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

function isInsidePolygon2D(
  points: Float32Array,
  horizontalAxis: 0 | 1,
  verticalAxis: 0 | 1,
  horizontal: number,
  vertical: number
): boolean {
  let inside = false;
  const pointCount = Math.floor(points.length / 3);
  if (pointCount < 3) return false;

  for (let index = 0, previousIndex = pointCount - 1; index < pointCount; previousIndex = index, index += 1) {
    const xi = points[index * 3 + horizontalAxis];
    const yi = points[index * 3 + verticalAxis];
    const xj = points[previousIndex * 3 + horizontalAxis];
    const yj = points[previousIndex * 3 + verticalAxis];

    const intersects =
      yi > vertical !== yj > vertical &&
      horizontal < ((xj - xi) * (vertical - yi)) / (yj - yi || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }

  return inside;
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

    const horizontalBounds = getContourBounds(contour.points, horizontalAxis);
    const start = Math.max(
      0,
      Math.floor((horizontalBounds[0] - volume.origin[horizontalAxis]) / volume.spacing[horizontalAxis])
    );
    const end = Math.min(
      horizontalSize - 1,
      Math.ceil((horizontalBounds[1] - volume.origin[horizontalAxis]) / volume.spacing[horizontalAxis])
    );

    for (let horizontalIndex = start; horizontalIndex <= end; horizontalIndex += 1) {
      const horizontalPosition = getVoxelCenter(
        horizontalIndex,
        volume.origin[horizontalAxis],
        volume.spacing[horizontalAxis]
      );
      if (
        isInsidePolygon2D(
          contour.points,
          fixedAxis,
          horizontalAxis,
          planePosition,
          horizontalPosition
        )
      ) {
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

  const paths: string[] = [];
  for (let zIndex = 0; zIndex < zSize; zIndex += 1) {
    for (let horizontalIndex = 0; horizontalIndex < horizontalSize; horizontalIndex += 1) {
      if (!isFilled(horizontalIndex, zIndex)) continue;

      const h0 = getVoxelBoundary(horizontalIndex, volume.origin[horizontalAxis], volume.spacing[horizontalAxis]);
      const h1 = getVoxelBoundary(horizontalIndex + 1, volume.origin[horizontalAxis], volume.spacing[horizontalAxis]);
      const z0 = getVoxelBoundary(zIndex, volume.origin[2], volume.spacing[2]);
      const z1 = getVoxelBoundary(zIndex + 1, volume.origin[2], volume.spacing[2]);

      if (!isFilled(horizontalIndex, zIndex - 1)) {
        paths.push(projectBoundaryEdge(orientation, planePosition, h0, z0, h1, z0, worldToCanvas));
      }
      if (!isFilled(horizontalIndex + 1, zIndex)) {
        paths.push(projectBoundaryEdge(orientation, planePosition, h1, z0, h1, z1, worldToCanvas));
      }
      if (!isFilled(horizontalIndex, zIndex + 1)) {
        paths.push(projectBoundaryEdge(orientation, planePosition, h1, z1, h0, z1, worldToCanvas));
      }
      if (!isFilled(horizontalIndex - 1, zIndex)) {
        paths.push(projectBoundaryEdge(orientation, planePosition, h0, z1, h0, z0, worldToCanvas));
      }
    }
  }

  return paths.join(' ');
}
