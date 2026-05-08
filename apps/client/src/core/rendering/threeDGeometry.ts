import type { Structure, Volume } from '@webtps/shared-types';

export interface MaskVolume {
  dimensions: [number, number, number];
  spacing: [number, number, number];
  origin: [number, number, number];
  directionCosines: number[];
  scalars: Uint8Array;
  filledVoxelCount: number;
}

type Vec3 = [number, number, number];

const DEFAULT_DIRECTION: [number, number, number, number, number, number, number, number, number] = [
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
];

export function hasRenderableContours(structure: Structure): boolean {
  return structure.contours.some((contour) => contour.isClosed && contour.points.length >= 9);
}

export function buildStructureMaskVolume(structure: Structure, volume: Volume): MaskVolume | null {
  if (!hasRenderableContours(structure)) return null;

  const bounds = computeStructureBounds(structure, volume);
  if (!bounds) return null;

  const [minI, maxI, minJ, maxJ, minK, maxK] = bounds;
  const width = maxI - minI + 1;
  const height = maxJ - minJ + 1;
  const depth = maxK - minK + 1;
  const scalars = new Uint8Array(width * height * depth);

  let filledVoxelCount = 0;
  for (const contour of structure.contours) {
    if (!contour.isClosed || contour.points.length < 9) continue;

    const contourPoints = toContinuousVoxelPoints(contour.points, volume);
    if (contourPoints.length < 3) continue;

    const avgK =
      contourPoints.reduce((sum, point) => sum + point[2], 0) / contourPoints.length;
    const k = clamp(Math.round(avgK), minK, maxK);
    const localK = k - minK;

    const polygon = contourPoints.map(([i, j]) => [i - minI, j - minJ] as [number, number]);
    const polyBounds = getPolygonBounds(polygon, width, height);
    if (!polyBounds) continue;

    const [startX, endX, startY, endY] = polyBounds;
    for (let y = startY; y <= endY; y += 1) {
      for (let x = startX; x <= endX; x += 1) {
        if (!isPointInPolygon(x + 0.5, y + 0.5, polygon)) continue;
        const offset = localK * width * height + y * width + x;
        if (scalars[offset] === 0) {
          scalars[offset] = 1;
          filledVoxelCount += 1;
        }
      }
    }
  }

  if (filledVoxelCount === 0) return null;

  return {
    dimensions: [width, height, depth],
    spacing: volume.spacing,
    origin: voxelToWorld([minI, minJ, minK], volume),
    directionCosines: volume.directionCosines.length === 9 ? volume.directionCosines : DEFAULT_DIRECTION,
    scalars,
    filledVoxelCount,
  };
}

export function downsampleVolume(volume: Volume, stride = 2): Volume {
  const safeStride = Math.max(1, Math.floor(stride));
  if (safeStride === 1) return volume;

  const [dimX, dimY, dimZ] = volume.dimensions;
  const nextDimensions: [number, number, number] = [
    Math.max(1, Math.ceil(dimX / safeStride)),
    Math.max(1, Math.ceil(dimY / safeStride)),
    Math.max(1, Math.ceil(dimZ / safeStride)),
  ];

  const pixelData = volume.pixelData;
  const ScalarCtor = getScalarConstructor(pixelData);
  const downsampled = new ScalarCtor(nextDimensions[0] * nextDimensions[1] * nextDimensions[2]);

  for (let k = 0; k < nextDimensions[2]; k += 1) {
    for (let j = 0; j < nextDimensions[1]; j += 1) {
      for (let i = 0; i < nextDimensions[0]; i += 1) {
        const srcI = Math.min(dimX - 1, i * safeStride);
        const srcJ = Math.min(dimY - 1, j * safeStride);
        const srcK = Math.min(dimZ - 1, k * safeStride);
        const srcOffset = srcK * dimX * dimY + srcJ * dimX + srcI;
        const dstOffset = k * nextDimensions[0] * nextDimensions[1] + j * nextDimensions[0] + i;
        downsampled[dstOffset] = pixelData[srcOffset];
      }
    }
  }

  return {
    ...volume,
    dimensions: nextDimensions,
    spacing: [
      volume.spacing[0] * safeStride,
      volume.spacing[1] * safeStride,
      volume.spacing[2] * safeStride,
    ],
    pixelData: downsampled,
  };
}

export function voxelToWorld(index: Vec3, volume: Pick<Volume, 'origin' | 'spacing' | 'directionCosines'>): Vec3 {
  const direction = getDirectionMatrix(volume.directionCosines);
  const scaled: Vec3 = [
    index[0] * volume.spacing[0],
    index[1] * volume.spacing[1],
    index[2] * volume.spacing[2],
  ];

  const rotated = multiplyMat3Vec3(direction, scaled);
  return [
    volume.origin[0] + rotated[0],
    volume.origin[1] + rotated[1],
    volume.origin[2] + rotated[2],
  ];
}

export function worldToContinuousVoxel(world: Vec3, volume: Pick<Volume, 'origin' | 'spacing' | 'directionCosines'>): Vec3 {
  const direction = getDirectionMatrix(volume.directionCosines);
  const inverse = invertMat3(direction);
  const translated: Vec3 = [
    world[0] - volume.origin[0],
    world[1] - volume.origin[1],
    world[2] - volume.origin[2],
  ];
  const rotated = multiplyMat3Vec3(inverse, translated);
  return [
    rotated[0] / volume.spacing[0],
    rotated[1] / volume.spacing[1],
    rotated[2] / volume.spacing[2],
  ];
}

function computeStructureBounds(structure: Structure, volume: Volume): [number, number, number, number, number, number] | null {
  const [dimX, dimY, dimZ] = volume.dimensions;
  let minI = Number.POSITIVE_INFINITY;
  let maxI = Number.NEGATIVE_INFINITY;
  let minJ = Number.POSITIVE_INFINITY;
  let maxJ = Number.NEGATIVE_INFINITY;
  let minK = Number.POSITIVE_INFINITY;
  let maxK = Number.NEGATIVE_INFINITY;

  for (const contour of structure.contours) {
    if (!contour.isClosed || contour.points.length < 9) continue;
    const points = toContinuousVoxelPoints(contour.points, volume);
    for (const [i, j, k] of points) {
      minI = Math.min(minI, i);
      maxI = Math.max(maxI, i);
      minJ = Math.min(minJ, j);
      maxJ = Math.max(maxJ, j);
      minK = Math.min(minK, k);
      maxK = Math.max(maxK, k);
    }
  }

  if (!Number.isFinite(minI) || !Number.isFinite(minJ) || !Number.isFinite(minK)) {
    return null;
  }

  return [
    clamp(Math.floor(minI) - 1, 0, dimX - 1),
    clamp(Math.ceil(maxI) + 1, 0, dimX - 1),
    clamp(Math.floor(minJ) - 1, 0, dimY - 1),
    clamp(Math.ceil(maxJ) + 1, 0, dimY - 1),
    clamp(Math.floor(minK) - 1, 0, dimZ - 1),
    clamp(Math.ceil(maxK) + 1, 0, dimZ - 1),
  ];
}

function toContinuousVoxelPoints(points: Float32Array, volume: Volume): Vec3[] {
  const result: Vec3[] = [];
  for (let index = 0; index < points.length; index += 3) {
    result.push(
      worldToContinuousVoxel(
        [points[index], points[index + 1], points[index + 2]],
        volume
      )
    );
  }
  return result;
}

function getPolygonBounds(
  polygon: Array<[number, number]>,
  width: number,
  height: number
): [number, number, number, number] | null {
  if (polygon.length < 3) return null;
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const [x, y] of polygon) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return null;

  return [
    clamp(Math.floor(minX), 0, width - 1),
    clamp(Math.ceil(maxX), 0, width - 1),
    clamp(Math.floor(minY), 0, height - 1),
    clamp(Math.ceil(maxY), 0, height - 1),
  ];
}

function isPointInPolygon(x: number, y: number, polygon: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const intersects =
      yi > y !== yj > y &&
      x < ((xj - xi) * (y - yi)) / ((yj - yi) || Number.EPSILON) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function getScalarConstructor(
  pixelData: Volume['pixelData']
): Float32ArrayConstructor | Int16ArrayConstructor | Uint16ArrayConstructor | Uint8ArrayConstructor {
  if (pixelData instanceof Int16Array) return Int16Array;
  if (pixelData instanceof Uint16Array) return Uint16Array;
  if (pixelData instanceof Uint8Array) return Uint8Array;
  return Float32Array;
}

function getDirectionMatrix(directionCosines: number[]): [number, number, number, number, number, number, number, number, number] {
  if (directionCosines.length === 9) {
    return [
      directionCosines[0], directionCosines[1], directionCosines[2],
      directionCosines[3], directionCosines[4], directionCosines[5],
      directionCosines[6], directionCosines[7], directionCosines[8],
    ];
  }
  return DEFAULT_DIRECTION;
}

function invertMat3(matrix: [number, number, number, number, number, number, number, number, number]) {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H = -(a * f - c * d);
  const I = a * e - b * d;
  const det = a * A + b * B + c * C;

  if (Math.abs(det) < Number.EPSILON) return DEFAULT_DIRECTION;

  return [
    A / det, D / det, G / det,
    B / det, E / det, H / det,
    C / det, F / det, I / det,
  ] as [number, number, number, number, number, number, number, number, number];
}

function multiplyMat3Vec3(
  matrix: [number, number, number, number, number, number, number, number, number],
  vector: Vec3
): Vec3 {
  return [
    matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2],
    matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2],
    matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2],
  ];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
