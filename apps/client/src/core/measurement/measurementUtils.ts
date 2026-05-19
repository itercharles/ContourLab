import type { Volume } from '@contourlab/shared-types';

export type WorldPoint = [number, number, number];

export function calculateDistanceMm(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

export function calculateAngleDeg(a: WorldPoint, vertex: WorldPoint, c: WorldPoint): number {
  const ab: WorldPoint = [a[0] - vertex[0], a[1] - vertex[1], a[2] - vertex[2]];
  const cb: WorldPoint = [c[0] - vertex[0], c[1] - vertex[1], c[2] - vertex[2]];
  const abLength = Math.hypot(ab[0], ab[1], ab[2]);
  const cbLength = Math.hypot(cb[0], cb[1], cb[2]);
  if (abLength === 0 || cbLength === 0) return 0;

  const dot = ab[0] * cb[0] + ab[1] * cb[1] + ab[2] * cb[2];
  const cosine = Math.max(-1, Math.min(1, dot / (abLength * cbLength)));
  return Math.acos(cosine) * (180 / Math.PI);
}

export function calculatePolygonAreaMm2(points: WorldPoint[]): number {
  if (points.length < 3) return 0;

  let areaVector: WorldPoint = [0, 0, 0];
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    areaVector = [
      areaVector[0] + current[1] * next[2] - current[2] * next[1],
      areaVector[1] + current[2] * next[0] - current[0] * next[2],
      areaVector[2] + current[0] * next[1] - current[1] * next[0],
    ];
  }

  return Math.hypot(areaVector[0], areaVector[1], areaVector[2]) / 2;
}

export function sampleNearestVoxelValue(volume: Volume, worldPoint: WorldPoint): number | null {
  const [dimX, dimY, dimZ] = volume.dimensions;
  const [spacingX, spacingY, spacingZ] = volume.spacing;
  if (dimX <= 0 || dimY <= 0 || dimZ <= 0 || spacingX === 0 || spacingY === 0 || spacingZ === 0) {
    return null;
  }

  const relative: WorldPoint = [
    worldPoint[0] - volume.origin[0],
    worldPoint[1] - volume.origin[1],
    worldPoint[2] - volume.origin[2],
  ];
  const direction = volume.directionCosines.length >= 9
    ? volume.directionCosines
    : [1, 0, 0, 0, 1, 0, 0, 0, 1];

  const voxelX = Math.round(
    (relative[0] * direction[0] + relative[1] * direction[1] + relative[2] * direction[2]) / spacingX
  );
  const voxelY = Math.round(
    (relative[0] * direction[3] + relative[1] * direction[4] + relative[2] * direction[5]) / spacingY
  );
  const voxelZ = Math.round(
    (relative[0] * direction[6] + relative[1] * direction[7] + relative[2] * direction[8]) / spacingZ
  );

  if (
    voxelX < 0 || voxelX >= dimX ||
    voxelY < 0 || voxelY >= dimY ||
    voxelZ < 0 || voxelZ >= dimZ
  ) {
    return null;
  }

  const index = voxelX + voxelY * dimX + voxelZ * dimX * dimY;
  const value = volume.pixelData[index];
  return Number.isFinite(value) ? Number(value) : null;
}
