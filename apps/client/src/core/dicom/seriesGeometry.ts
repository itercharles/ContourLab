// Checks that an image series can be shown and contoured without distorting it. A volume built
// from slices that disagree about orientation, position or size looks plausible on screen and puts
// contours in the wrong place, so a series that fails here is refused with a reason the user can
// read, instead of being loaded with silent defaults.

export interface SliceGeometry {
  imageOrientationPatient: number[];
  imagePositionPatient: number[];
  rowPixelSpacing: number;
  columnPixelSpacing: number;
  rows: number;
  columns: number;
  frameOfReferenceUID: string;
  /** Geometry tags the instance did not carry (the parsers fill in defaults for them). */
  missingGeometryTags?: string[];
}

export interface SeriesGeometryReport {
  /** The series must not be loaded. */
  errors: string[];
  /** The series can be loaded, but the user should know. */
  warnings: string[];
}

const ORIENTATION_TOLERANCE = 1e-3;
const POSITION_TOLERANCE_MM = 0.01;
// Slice spacing may differ from the first gap by this much before it counts as uneven.
const SPACING_TOLERANCE_MM = 0.1;

type Vec3 = [number, number, number];

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function dot(a: number[], b: number[]): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function rowColumn(slice: SliceGeometry): { row: Vec3; column: Vec3 } {
  const iop = slice.imageOrientationPatient;
  return { row: [iop[0], iop[1], iop[2]], column: [iop[3], iop[4], iop[5]] };
}

function isAxial(slice: SliceGeometry): boolean {
  if (slice.imageOrientationPatient.length < 6) return false;
  const { row, column } = rowColumn(slice);
  const normal = cross(row, column);
  const alongAxis = (v: number[]) => v.some((c) => Math.abs(Math.abs(c) - 1) < ORIENTATION_TOLERANCE);
  // Rows and columns each along a patient axis, and the slices stacked along z: axial, possibly flipped.
  return alongAxis(row) && alongAxis(column) && Math.abs(Math.abs(normal[2]) - 1) < ORIENTATION_TOLERANCE;
}

function sameOrientation(a: number[], b: number[]): boolean {
  return a.length >= 6 && b.length >= 6 && a.slice(0, 6).every((value, index) => Math.abs(value - b[index]) < ORIENTATION_TOLERANCE);
}

function listed(tags: string[]): string {
  return [...new Set(tags)].join(', ');
}

export function validateSeriesGeometry(slices: SliceGeometry[]): SeriesGeometryReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (slices.length === 0) return { errors: ['The series has no image slices.'], warnings };

  const missing = slices.filter((slice) => (slice.missingGeometryTags?.length ?? 0) > 0);
  if (missing.length > 0) {
    errors.push(
      `${missing.length} of ${slices.length} slices do not carry ${listed(missing.flatMap((slice) => slice.missingGeometryTags ?? []))}, ` +
        'so their position cannot be trusted.'
    );
    return { errors, warnings }; // the checks below would only be reading defaults
  }

  const first = slices[0];

  if (slices.some((slice) => !sameOrientation(slice.imageOrientationPatient, first.imageOrientationPatient))) {
    errors.push('The slices do not share one image orientation, so they cannot be stacked into a volume.');
  } else if (!isAxial(first)) {
    errors.push(
      'The series is not an axial acquisition with its slices stacked along the patient z axis (it is oblique or ' +
        'gantry-tilted), which this software does not support.'
    );
  }

  const frames = new Set(slices.map((slice) => slice.frameOfReferenceUID).filter(Boolean));
  if (frames.size > 1) {
    errors.push(`The slices belong to ${frames.size} different frames of reference and are not one scan.`);
  }

  if (slices.some((slice) => slice.rows !== first.rows || slice.columns !== first.columns)) {
    errors.push('The slices do not all have the same number of rows and columns.');
  }
  if (
    slices.some(
      (slice) =>
        Math.abs(slice.rowPixelSpacing - first.rowPixelSpacing) > 1e-4 ||
        Math.abs(slice.columnPixelSpacing - first.columnPixelSpacing) > 1e-4
    )
  ) {
    errors.push('The slices do not all have the same pixel spacing.');
  }

  if (errors.length > 0) return { errors, warnings };

  // Slice positions along the stacking direction.
  const { row, column } = rowColumn(first);
  const normal = cross(row, column);
  const positions = slices.map((slice) => dot(slice.imagePositionPatient, normal)).sort((a, b) => a - b);

  const gaps = positions.slice(1).map((position, index) => position - positions[index]);
  if (gaps.some((gap) => gap < POSITION_TOLERANCE_MM)) {
    errors.push('Two or more slices are at the same position (duplicate instances or overlapping acquisitions).');
    return { errors, warnings };
  }

  if (gaps.length > 0) {
    const reference = gaps[0];
    const smallest = Math.min(...gaps);
    const largest = Math.max(...gaps);
    if (gaps.some((gap) => Math.abs(gap - reference) > SPACING_TOLERANCE_MM)) {
      warnings.push(
        `The slices are not evenly spaced (${smallest.toFixed(2)} to ${largest.toFixed(2)} mm). The image is shown ` +
          'on a uniform grid, so slice positions, contours and volumes can be off by up to ' +
          `${(largest - smallest).toFixed(2)} mm. Check them against the source images.`
      );
    }
  }

  return { errors, warnings };
}

export class SeriesGeometryError extends Error {
  constructor(public readonly seriesDescription: string, public readonly reasons: string[]) {
    super(`Series ${seriesDescription ? `"${seriesDescription}" ` : ''}was not loaded. ${reasons.join(' ')}`);
    this.name = 'SeriesGeometryError';
  }
}
