import type { ContourSlice, Volume } from '@contourlab/shared-types';
import type { InterpolationFrame } from './InterpolationEngine';
import {
  contoursWithoutFrame,
  maskToContourSlices,
  rasterizeContoursToMask,
  sliceContoursAtPosition,
  sliceTolerance,
} from './sliceMask';

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

// The structure's new contours: the grown or shrunk result on every slice that has an image frame
// and a contour (every outline and hole of it), plus the contours on slices that match no frame,
// which are kept as they are rather than deleted.
export function computeMarginContoursForStructure(
  contours: ContourSlice[],
  frames: InterpolationFrame[],
  volume: Volume,
  marginMm: number
): ContourSlice[] {
  const tolerance = sliceTolerance(volume);

  const computed = frames.flatMap((frame) => {
    const onSlice = sliceContoursAtPosition(contours, frame.sliceLocation, tolerance);
    if (onSlice.length === 0) return [];

    const marginMask = applyMaskMargin(rasterizeContoursToMask(onSlice, volume), volume, marginMm);
    return maskToContourSlices(marginMask, volume, frame.sliceLocation, frame.sopInstanceUID);
  });

  const unmatched = contoursWithoutFrame(
    contours,
    frames.map((frame) => frame.sliceLocation),
    tolerance
  );

  return [...computed, ...unmatched].sort((a, b) => a.slicePosition - b.slicePosition);
}
