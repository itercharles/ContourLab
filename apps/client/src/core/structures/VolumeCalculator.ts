import type { ContourSlice, Structure } from '@contourlab/shared-types';

const SAME_SLICE_MM = 0.01;

function polygonArea(points: Float32Array): number {
  const n = points.length / 3; // points are [x,y,z, x,y,z, ...]
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i * 3] * points[j * 3 + 1] - points[j * 3] * points[i * 3 + 1];
  }
  return Math.abs(area) / 2; // shoelace, mm²
}

function contains(outer: Float32Array, x: number, y: number): boolean {
  const n = outer.length / 3;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i, i += 1) {
    const xi = outer[i * 3];
    const yi = outer[i * 3 + 1];
    const xj = outer[j * 3];
    const yj = outer[j * 3 + 1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || Number.EPSILON) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Area of the contours drawn on one slice, mm². Contours nested inside one another alternate
 * between filled and hole (even-odd), as in the 3D mask and in the boolean and margin operations,
 * so a ring is its outer area minus the hole instead of the sum of the two.
 */
function sliceArea(contours: ContourSlice[]): number {
  const usable = contours.filter((contour) => contour.points.length >= 9);
  let total = 0;
  for (const [index, contour] of usable.entries()) {
    const x = contour.points[0];
    const y = contour.points[1];
    const depth = usable.filter((other, otherIndex) => otherIndex !== index && contains(other.points, x, y)).length;
    total += (depth % 2 === 0 ? 1 : -1) * polygonArea(contour.points);
  }
  return Math.max(total, 0);
}

/**
 * The thickness a slice stands for: half the distance to each neighbour, so slices of a series
 * whose spacing changes (2.5 mm in one region, 5 mm in another) each count for their own slab.
 * Falls back to the average thickness when the positions are not known or do not include the slice.
 */
function slabThickness(position: number, positions: number[], fallback: number): number {
  if (positions.length < 2) return fallback;
  let nearest = 0;
  for (let i = 1; i < positions.length; i += 1) {
    if (Math.abs(positions[i] - position) < Math.abs(positions[nearest] - position)) nearest = i;
  }
  const below = nearest > 0 ? positions[nearest] - positions[nearest - 1] : undefined;
  const above = nearest < positions.length - 1 ? positions[nearest + 1] - positions[nearest] : undefined;
  if (Math.abs(positions[nearest] - position) > Math.max(below ?? 0, above ?? 0) / 2) return fallback;
  if (below !== undefined && above !== undefined) return (below + above) / 2;
  return below ?? above ?? fallback;
}

/**
 * Compute the volume of a structure in cm³ from its contour slices: the area of each slice (shoelace
 * formula, holes subtracted) times the thickness that slice stands for.
 *
 * @param slicePositions z positions of the image slices, when known, for a per-slice thickness;
 *   without them every slice counts for `sliceThickness_mm`.
 */
export function computeVolume(
  structure: Structure,
  sliceThickness_mm: number,
  slicePositions: number[] = []
): number {
  const positions = [...slicePositions].sort((a, b) => a - b);

  const slices = new Map<number, ContourSlice[]>();
  for (const contour of structure.contours) {
    const key = Math.round(contour.slicePosition / SAME_SLICE_MM);
    slices.set(key, [...(slices.get(key) ?? []), contour]);
  }

  let totalVolume_mm3 = 0;
  for (const contours of slices.values()) {
    const position = contours[0].slicePosition;
    totalVolume_mm3 += sliceArea(contours) * slabThickness(position, positions, sliceThickness_mm);
  }

  return totalVolume_mm3 / 1000; // mm³ → cm³
}
