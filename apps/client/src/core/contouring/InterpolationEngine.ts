import type { ContourSlice, Volume } from '@contourlab/shared-types';
import {
  maskToContourSlices,
  rasterizeContoursToMask,
  sliceTolerance,
} from './sliceMask';

// Shape-based interpolation. The contours on each of the two drawn slices are rasterised on the
// volume's grid and turned into signed distance fields (negative inside, positive outside); the field
// of an in-between slice is the linear blend of the two, and its zero line is the interpolated shape.
//
// Unlike blending the vertices of one outline with another, this needs no matching of start points or
// winding direction, so it cannot twist an outline into a figure of eight; it handles several pieces
// and holes on a slice, and a piece that splits, merges, appears or vanishes between the slices. The
// result is a contour at the resolution of the image grid, like the boolean and margin operations.

export interface InterpolationFrame {
  sopInstanceUID: string;
  sliceLocation: number;
}

/** The closed contours drawn on one slice, all of them. */
export interface DrawnSlice {
  position: number;
  contours: ContourSlice[];
}

const FAR = 1e20;

// Squared distance from each element to the nearest element where `seed` is true, along one line, by the
// lower envelope of parabolas (Felzenszwalb and Huttenlocher). `step` is the spacing between elements.
function distanceTransform1D(values: Float64Array, length: number, step: number, out: Float64Array): void {
  const v = new Int32Array(length);
  const z = new Float64Array(length + 1);
  let k = 0;
  v[0] = 0;
  z[0] = -FAR;
  z[1] = FAR;
  for (let q = 1; q < length; q += 1) {
    let s: number;
    do {
      const p = v[k];
      s = (values[q] + (q * step) ** 2 - (values[p] + (p * step) ** 2)) / (2 * step * (q - p));
      if (s <= z[k]) k -= 1;
      else break;
    } while (k >= 0);
    k += 1;
    v[k] = q;
    z[k] = s;
    z[k + 1] = FAR;
  }
  k = 0;
  for (let q = 0; q < length; q += 1) {
    while (z[k + 1] < q * step) k += 1;
    out[q] = (q * step - v[k] * step) ** 2 + values[v[k]];
  }
}

// Distance in mm from every pixel to the nearest pixel where `foreground(mask value)` holds.
function distanceTo(mask: Uint8Array, width: number, height: number, spacing: [number, number], foreground: number): Float64Array {
  const squared = new Float64Array(width * height);
  for (let i = 0; i < squared.length; i += 1) squared[i] = mask[i] === foreground ? 0 : FAR;

  const column = new Float64Array(height);
  const columnOut = new Float64Array(height);
  for (let x = 0; x < width; x += 1) {
    for (let y = 0; y < height; y += 1) column[y] = squared[y * width + x];
    distanceTransform1D(column, height, spacing[1], columnOut);
    for (let y = 0; y < height; y += 1) squared[y * width + x] = columnOut[y];
  }

  const row = new Float64Array(width);
  const rowOut = new Float64Array(width);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) row[x] = squared[y * width + x];
    distanceTransform1D(row, width, spacing[0], rowOut);
    for (let x = 0; x < width; x += 1) squared[y * width + x] = Math.sqrt(rowOut[x]);
  }
  return squared;
}

// Negative inside the shape, positive outside, a pixel's distance to the other side either way, so the
// zero line lies between pixels and a shape blended with itself comes back unchanged.
function signedDistance(mask: Uint8Array, volume: Volume): Float64Array | null {
  const width = volume.dimensions[0];
  const height = volume.dimensions[1];
  if (!mask.some((value) => value === 1) || mask.every((value) => value === 1)) return null;

  const spacing: [number, number] = [volume.spacing[0], volume.spacing[1]];
  const toShape = distanceTo(mask, width, height, spacing, 1);
  const toOutside = distanceTo(mask, width, height, spacing, 0);
  const field = new Float64Array(width * height);
  for (let i = 0; i < field.length; i += 1) field[i] = toShape[i] - toOutside[i];
  return field;
}

/** The closed contours of a structure, grouped by slice and ordered by position. */
export function groupDrawnSlices(contours: ContourSlice[], volume: Volume): DrawnSlice[] {
  const tolerance = sliceTolerance(volume);
  const slices: DrawnSlice[] = [];
  for (const contour of [...contours].sort((a, b) => a.slicePosition - b.slicePosition)) {
    if (!contour.isClosed || contour.points.length < 9) continue;
    const last = slices.at(-1);
    if (last && Math.abs(contour.slicePosition - last.position) <= tolerance) last.contours.push(contour);
    else slices.push({ position: contour.slicePosition, contours: [contour] });
  }
  return slices;
}

export function findInterpolationBounds(
  contours: ContourSlice[],
  targetSlicePosition: number,
  volume: Volume
): { lower: DrawnSlice; upper: DrawnSlice } | null {
  const tolerance = sliceTolerance(volume);
  const slices = groupDrawnSlices(contours, volume);
  const lower = [...slices].reverse().find((slice) => slice.position < targetSlicePosition - tolerance);
  const upper = slices.find((slice) => slice.position > targetSlicePosition + tolerance);
  return lower && upper ? { lower, upper } : null;
}

// One pair of drawn slices, with the field of each worked out once for all the slices between them.
function prepareBlend(lower: DrawnSlice, upper: DrawnSlice, volume: Volume) {
  const lowerField = signedDistance(rasterizeContoursToMask(lower.contours, volume), volume);
  const upperField = signedDistance(rasterizeContoursToMask(upper.contours, volume), volume);
  if (!lowerField || !upperField) return null;

  return (position: number, referencedSOPInstanceUID: string): ContourSlice[] => {
    const t = (position - lower.position) / (upper.position - lower.position);
    if (!(t > 0 && t < 1)) return [];
    const mask = new Uint8Array(lowerField.length);
    for (let i = 0; i < mask.length; i += 1) {
      mask[i] = (1 - t) * lowerField[i] + t * upperField[i] <= 0 ? 1 : 0;
    }
    return maskToContourSlices(mask, volume, position, referencedSOPInstanceUID);
  };
}

/** The contours of the slice at `position`, blended from the drawn slices on either side (possibly several). */
export function interpolateSlice(
  lower: DrawnSlice,
  upper: DrawnSlice,
  position: number,
  referencedSOPInstanceUID: string,
  volume: Volume
): ContourSlice[] {
  if (lower.position === upper.position) return [];
  return prepareBlend(lower, upper, volume)?.(position, referencedSOPInstanceUID) ?? [];
}

export function interpolateContourForSlice(
  contours: ContourSlice[],
  targetSlicePosition: number,
  referencedSOPInstanceUID: string,
  volume: Volume
): ContourSlice[] {
  const bounds = findInterpolationBounds(contours, targetSlicePosition, volume);
  if (!bounds) return [];
  return interpolateSlice(bounds.lower, bounds.upper, targetSlicePosition, referencedSOPInstanceUID, volume);
}

/**
 * Contours for every image frame that lies between two drawn slices and has none, as long as no more
 * than `maxMissingFrames` frames lie in the gap. A frame that already has contours is left alone.
 */
export function interpolateMissingContoursForFrames(
  contours: ContourSlice[],
  frames: InterpolationFrame[],
  volume: Volume,
  maxMissingFrames = Number.POSITIVE_INFINITY
): ContourSlice[] {
  const tolerance = sliceTolerance(volume);
  const sortedFrames = [...frames]
    .filter((frame) => Number.isFinite(frame.sliceLocation))
    .sort((a, b) => a.sliceLocation - b.sliceLocation);
  const drawn = groupDrawnSlices(contours, volume);
  const interpolated: ContourSlice[] = [];

  for (let index = 0; index < drawn.length - 1; index += 1) {
    const lower = drawn[index];
    const upper = drawn[index + 1];
    const gapFrames = sortedFrames.filter(
      (frame) => frame.sliceLocation > lower.position + tolerance && frame.sliceLocation < upper.position - tolerance
    );
    if (gapFrames.length === 0 || gapFrames.length > maxMissingFrames) continue;

    const blend = prepareBlend(lower, upper, volume);
    if (!blend) continue;
    for (const frame of gapFrames) {
      interpolated.push(...blend(frame.sliceLocation, frame.sopInstanceUID));
    }
  }

  return interpolated;
}
