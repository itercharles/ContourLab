import type { Structure, Volume } from '@contourlab/shared-types';
import { logClientDebug } from '../debug/clientDebugLog';

export interface MaskVolume {
  dimensions: [number, number, number];
  spacing: [number, number, number];
  origin: [number, number, number];
  directionCosines: number[];
  scalars: Uint8Array;
  filledVoxelCount: number;
}

type Vec3 = [number, number, number];
interface SlicePolygon {
  polygon: Array<[number, number]>;
  bounds: [number, number, number, number];
  area: number;
}

const DEFAULT_DIRECTION: [number, number, number, number, number, number, number, number, number] = [
  1, 0, 0,
  0, 1, 0,
  0, 0, 1,
];
const SLOW_MASK_BUILD_MS = 40;
const SLOW_DOWNSAMPLE_MS = 25;

export function hasRenderableContours(structure: Structure): boolean {
  return structure.contours.some((contour) => contour.isClosed && contour.points.length >= 9);
}

export function buildStructureMaskVolume(structure: Structure, volume: Volume): MaskVolume | null {
  const totalStart = performance.now();
  const pushDebug = (message: string) => {
    logClientDebug('ThreeDGeometry', `structure=${structure.id} ${message}`);
  };
  if (!hasRenderableContours(structure)) return null;

  // Precompute world→voxel transform for all valid contours once (was computed twice before).
  const precomputeStart = performance.now();
  const validContours: Array<{ voxelPoints: Vec3[]; k: number }> = [];
  for (const contour of structure.contours) {
    if (!contour.isClosed || contour.points.length < 9) continue;
    const voxelPoints = toContinuousVoxelPoints(contour.points, volume);
    if (voxelPoints.length < 3) continue;
    const avgK = voxelPoints.reduce((sum, p) => sum + p[2], 0) / voxelPoints.length;
    validContours.push({ voxelPoints, k: avgK });
  }
  const precomputeMs = Math.round(performance.now() - precomputeStart);

  if (validContours.length === 0) {
    pushDebug('skip reason=no-valid-contours');
    return null;
  }

  // Compute bounds from precomputed points (no redundant transform).
  const [dimX, dimY, dimZ] = volume.dimensions;
  let minI = Number.POSITIVE_INFINITY, maxI = Number.NEGATIVE_INFINITY;
  let minJ = Number.POSITIVE_INFINITY, maxJ = Number.NEGATIVE_INFINITY;
  let minK = Number.POSITIVE_INFINITY, maxK = Number.NEGATIVE_INFINITY;

  for (const { voxelPoints } of validContours) {
    for (const [i, j, k] of voxelPoints) {
      if (i < minI) minI = i;
      if (i > maxI) maxI = i;
      if (j < minJ) minJ = j;
      if (j > maxJ) maxJ = j;
      if (k < minK) minK = k;
      if (k > maxK) maxK = k;
    }
  }

  if (!Number.isFinite(minI)) {
    pushDebug('skip reason=no-bounds');
    return null;
  }

  const boundsMinI = clamp(Math.floor(minI) - 1, 0, dimX - 1);
  const boundsMaxI = clamp(Math.ceil(maxI) + 1, 0, dimX - 1);
  const boundsMinJ = clamp(Math.floor(minJ) - 1, 0, dimY - 1);
  const boundsMaxJ = clamp(Math.ceil(maxJ) + 1, 0, dimY - 1);
  const boundsMinK = clamp(Math.floor(minK) - 1, 0, dimZ - 1);
  const boundsMaxK = clamp(Math.ceil(maxK) + 1, 0, dimZ - 1);

  const width = boundsMaxI - boundsMinI + 1;
  const height = boundsMaxJ - boundsMinJ + 1;
  const depth = boundsMaxK - boundsMinK + 1;
  const scalars = new Uint8Array(width * height * depth);

  // Group polygons by slice using the already-transformed voxel points.
  const slicePolygons = new Map<number, SlicePolygon[]>();
  for (const { voxelPoints, k: rawK } of validContours) {
    const k = clamp(Math.round(rawK), boundsMinK, boundsMaxK);
    const polygon = voxelPoints.map(([i, j]) => [i - boundsMinI, j - boundsMinJ] as [number, number]);
    const polyBounds = getPolygonBounds(polygon, width, height);
    if (!polyBounds) continue;
    const area = Math.abs(computeSignedPolygonArea(polygon));
    if (area < Number.EPSILON) continue;

    const localK = k - boundsMinK;
    const polygons = slicePolygons.get(localK) ?? [];
    polygons.push({ polygon, bounds: polyBounds, area });
    slicePolygons.set(localK, polygons);
  }

  // Rasterize with scanline fill — O(height × edges + filled_pixels) per polygon,
  // versus the previous O(width × height × edges) per-pixel point-in-polygon approach.
  const rasterizeStart = performance.now();
  for (const [localK, polygons] of slicePolygons.entries()) {
    const classifiedPolygons = classifySlicePolygons(polygons);
    for (const slicePolygon of classifiedPolygons) {
      scanlineFillPolygon(slicePolygon, localK, width, height, scalars);
    }
  }
  const rasterizeMs = Math.round(performance.now() - rasterizeStart);

  const filledVoxelCount = scalars.reduce((count, value) => count + (value > 0 ? 1 : 0), 0);

  if (filledVoxelCount === 0) return null;

  const totalMs = Math.round(performance.now() - totalStart);
  if (totalMs >= SLOW_MASK_BUILD_MS) {
    pushDebug(
      `mask slow ms=${totalMs} (precompute=${precomputeMs} rasterize=${rasterizeMs}) contours=${validContours.length} slices=${slicePolygons.size} dims=${width}x${height}x${depth} filled=${filledVoxelCount}`
    );
  }

  return {
    dimensions: [width, height, depth],
    spacing: volume.spacing,
    origin: voxelToWorld([boundsMinI, boundsMinJ, boundsMinK], volume),
    directionCosines: volume.directionCosines.length === 9 ? volume.directionCosines : DEFAULT_DIRECTION,
    scalars,
    filledVoxelCount,
  };
}

// Cheap "metadata only" downsample for code paths that only need the volume
// geometry (dimensions / spacing / origin / direction) and do not touch the
// pixel data. buildStructureMaskVolume falls into this category — handing it a
// stride-N grid lets us produce a mask at 1/N^3 the voxel count without
// paying the O(dim^3) cost of copying the CT scalars.
export function deriveStrideVolume(volume: Volume, stride: number): Volume {
  const safeStride = Math.max(1, Math.floor(stride));
  if (safeStride === 1) return volume;
  return {
    ...volume,
    dimensions: [
      Math.max(1, Math.ceil(volume.dimensions[0] / safeStride)),
      Math.max(1, Math.ceil(volume.dimensions[1] / safeStride)),
      Math.max(1, Math.ceil(volume.dimensions[2] / safeStride)),
    ],
    spacing: [
      volume.spacing[0] * safeStride,
      volume.spacing[1] * safeStride,
      volume.spacing[2] * safeStride,
    ],
  };
}

// Approximate the voxel count a structure's mask would occupy on the supplied
// volume grid. Computed straight from the contours' world-space bounding box
// to avoid the cost of running each contour point through worldToContinuousVoxel
// just to decide a stride. Good enough for axis-aligned (diagonal direction)
// volumes — the rendering path already assumes that.
export function estimateStructureVoxelExtent(structure: Structure, volume: Volume): number {
  let minX = Number.POSITIVE_INFINITY, maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY, maxY = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY, maxZ = Number.NEGATIVE_INFINITY;
  for (const contour of structure.contours) {
    if (!contour.isClosed || contour.points.length < 9) continue;
    const points = contour.points;
    for (let index = 0; index < points.length; index += 3) {
      const x = points[index];
      const y = points[index + 1];
      const z = points[index + 2];
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (z < minZ) minZ = z;
      if (z > maxZ) maxZ = z;
    }
  }
  if (!Number.isFinite(minX)) return 0;
  const dx = (maxX - minX) / Math.max(1e-6, Math.abs(volume.spacing[0]));
  const dy = (maxY - minY) / Math.max(1e-6, Math.abs(volume.spacing[1]));
  const dz = (maxZ - minZ) / Math.max(1e-6, Math.abs(volume.spacing[2]));
  return Math.max(0, dx) * Math.max(0, dy) * Math.max(0, dz);
}

// Pick a mask grid stride for the structure. Capped at 4 — past that the
// marching-cubes surface gets blocky enough to read as deliberate
// low-res, and even on integrated GPUs stride 4 fits comfortably under
// the slow-render threshold.
export function chooseStructureMaskStride(structure: Structure, volume: Volume): number {
  const estimatedVoxels = estimateStructureVoxelExtent(structure, volume);
  // Sub-1 M-voxel structures (PTV, single OARs, vessels) keep full
  // resolution. The body / skin / external typically lands in the tens of
  // millions, where a stride of 2-4 turns a 9 MV mask into a 1 MV one and
  // GPU upload drops from seconds to fractions of a second.
  const fullResBudget = 1_000_000;
  if (estimatedVoxels <= fullResBudget) return 1;
  const ratio = estimatedVoxels / fullResBudget;
  const stride = Math.ceil(Math.cbrt(ratio));
  return Math.min(4, Math.max(1, stride));
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

  const startedAt = performance.now();
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

  const elapsedMs = Math.round(performance.now() - startedAt);
  if (elapsedMs >= SLOW_DOWNSAMPLE_MS) {
    logClientDebug(
      'ThreeDGeometry',
      `downsample slow ms=${elapsedMs} stride=${safeStride} src=${volume.dimensions.join('x')} dst=${nextDimensions.join('x')} scalars=${downsampled.length}`
    );
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

// Scanline polygon fill: O(height × edges + filled_pixels) per polygon.
// xStart/xEnd derived so pixel centers (x+0.5, y+0.5) fall strictly inside the span.
function scanlineFillPolygon(
  classified: SlicePolygon & { fillValue: 0 | 1 },
  localK: number,
  width: number,
  height: number,
  scalars: Uint8Array
): void {
  const [startX, endX, startY, endY] = classified.bounds;
  const { polygon, fillValue } = classified;

  for (let y = startY; y <= endY; y += 1) {
    const scanY = y + 0.5;
    const xCrossings: number[] = [];

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      if ((yi > scanY) !== (yj > scanY)) {
        xCrossings.push(((xj - xi) * (scanY - yi)) / ((yj - yi) || Number.EPSILON) + xi);
      }
    }

    xCrossings.sort((a, b) => a - b);

    for (let p = 0; p + 1 < xCrossings.length; p += 2) {
      // Smallest x where pixel center x+0.5 > xCrossings[p].
      const xStart = Math.max(startX, Math.round(xCrossings[p]));
      // Largest x where pixel center x+0.5 < xCrossings[p+1].
      const xEnd = Math.min(endX, Math.ceil(xCrossings[p + 1] - 0.5) - 1);
      for (let x = xStart; x <= xEnd; x += 1) {
        scalars[localK * width * height + y * width + x] = fillValue;
      }
    }
  }
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

function classifySlicePolygons(
  polygons: SlicePolygon[]
): Array<SlicePolygon & { fillValue: 0 | 1 }> {
  const sorted = [...polygons].sort((left, right) => right.area - left.area);

  return sorted.map((polygon, index) => {
    // Use centroid as probe point; vertex 0 may lie on a parent boundary,
    // causing isPointInPolygon to return an undefined result.
    const probeX = polygon.polygon.reduce((s, p) => s + p[0], 0) / polygon.polygon.length;
    const probeY = polygon.polygon.reduce((s, p) => s + p[1], 0) / polygon.polygon.length;
    let depth = 0;

    for (let parentIndex = 0; parentIndex < index; parentIndex += 1) {
      const parent = sorted[parentIndex];
      if (isPointInPolygon(probeX, probeY, parent.polygon)) {
        depth += 1;
      }
    }

    return {
      ...polygon,
      fillValue: (depth % 2 === 0 ? 1 : 0) as 0 | 1,
    };
  });
}

function computeSignedPolygonArea(polygon: Array<[number, number]>): number {
  let total = 0;
  for (let index = 0; index < polygon.length; index += 1) {
    const [x1, y1] = polygon[index];
    const [x2, y2] = polygon[(index + 1) % polygon.length];
    total += x1 * y2 - x2 * y1;
  }
  return total / 2;
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
