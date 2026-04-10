import type { Structure } from '@webtps/shared-types';

/**
 * Compute the volume of a structure in cm³ from its contour slices.
 * Uses the shoelace formula for polygon area per slice × slice thickness.
 */
export function computeVolume(
  structure: Structure,
  sliceThickness_mm: number
): number {
  let totalVolume_mm3 = 0;

  for (const contour of structure.contours) {
    const points = contour.points;
    const n = points.length / 3; // points are [x,y,z, x,y,z, ...]
    if (n < 3) continue;

    // Shoelace formula for 2D polygon area using x,y coordinates
    let area = 0;
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      const xi = points[i * 3];
      const yi = points[i * 3 + 1];
      const xj = points[j * 3];
      const yj = points[j * 3 + 1];
      area += xi * yj - xj * yi;
    }
    area = Math.abs(area) / 2; // mm²

    totalVolume_mm3 += area * sliceThickness_mm;
  }

  return totalVolume_mm3 / 1000; // mm³ → cm³
}
