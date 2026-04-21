import type { ContourSlice, Structure } from '@webtps/shared-types';

export type ContourQualityIssueType =
  | 'empty'
  | 'open-contour'
  | 'degenerate-contour'
  | 'slice-gap'
  | 'area-jump'
  | 'centroid-jump'
  | 'out-of-bounds';

export type ContourQualitySeverity = 'info' | 'warning';

export interface ContourQualityIssue {
  type: ContourQualityIssueType;
  severity: ContourQualitySeverity;
  message: string;
  slicePosition?: number;
}

export interface ContourQualitySummary {
  issueCount: number;
  warningCount: number;
  issues: ContourQualityIssue[];
}

export interface ContourQualityContext {
  sliceSpacingMm?: number;
  imageBounds?: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
  enabledRules?: Partial<Record<ContourQualityIssueType, boolean>>;
}

const MIN_VALID_AREA_MM2 = 0.01;
const AREA_JUMP_RATIO = 3;
const MIN_AREA_JUMP_MM2 = 50;
const MIN_CENTROID_JUMP_MM = 20;

function getContourAreaMm2(contour: ContourSlice): number {
  const pointCount = contour.points.length / 3;
  if (pointCount < 3) return 0;

  let area = 0;
  for (let index = 0; index < pointCount; index += 1) {
    const nextIndex = (index + 1) % pointCount;
    const x = contour.points[index * 3];
    const y = contour.points[index * 3 + 1];
    const nextX = contour.points[nextIndex * 3];
    const nextY = contour.points[nextIndex * 3 + 1];
    area += x * nextY - nextX * y;
  }

  return Math.abs(area) / 2;
}

function inferExpectedSpacingMm(contours: ContourSlice[], fallbackSpacingMm: number): number {
  if (Number.isFinite(fallbackSpacingMm) && fallbackSpacingMm > 0) return fallbackSpacingMm;

  const slicePositions = Array.from(new Set(contours.map((contour) => contour.slicePosition)))
    .sort((a, b) => a - b);
  const deltas = slicePositions
    .slice(1)
    .map((position, index) => Math.abs(position - slicePositions[index]))
    .filter((delta) => delta > 0);

  return deltas.length > 0 ? Math.min(...deltas) : 1;
}

function getContourCentroidMm(contour: ContourSlice): { x: number; y: number } | null {
  const pointCount = contour.points.length / 3;
  if (pointCount < 3) return null;

  let signedArea = 0;
  let centroidX = 0;
  let centroidY = 0;
  for (let index = 0; index < pointCount; index += 1) {
    const nextIndex = (index + 1) % pointCount;
    const x1 = contour.points[index * 3];
    const y1 = contour.points[index * 3 + 1];
    const x2 = contour.points[nextIndex * 3];
    const y2 = contour.points[nextIndex * 3 + 1];
    const cross = x1 * y2 - x2 * y1;
    signedArea += cross;
    centroidX += (x1 + x2) * cross;
    centroidY += (y1 + y2) * cross;
  }

  if (Math.abs(signedArea) <= Number.EPSILON) return null;

  return {
    x: centroidX / (3 * signedArea),
    y: centroidY / (3 * signedArea),
  };
}

function contourExceedsBounds(
  contour: ContourSlice,
  bounds: NonNullable<ContourQualityContext['imageBounds']>
): boolean {
  for (let index = 0; index < contour.points.length; index += 3) {
    const x = contour.points[index];
    const y = contour.points[index + 1];
    if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) {
      return true;
    }
  }

  return false;
}

export function analyzeContourQuality(
  structure: Structure,
  context: number | ContourQualityContext = 1
): ContourQualitySummary {
  const issues: ContourQualityIssue[] = [];
  const normalizedContext =
    typeof context === 'number' ? { sliceSpacingMm: context } : context;
  const sliceSpacingMm = normalizedContext.sliceSpacingMm ?? 1;
  const isRuleEnabled = (rule: ContourQualityIssueType) =>
    normalizedContext.enabledRules?.[rule] !== false;

  if (structure.contours.length === 0) {
    if (isRuleEnabled('empty')) {
      issues.push({
        type: 'empty',
        severity: 'info',
        message: 'No contours in this structure.',
      });
    }
    return {
      issueCount: issues.length,
      warningCount: 0,
      issues,
    };
  }

  const contoursBySlice = [...structure.contours].sort((a, b) => a.slicePosition - b.slicePosition);
  const expectedSpacingMm = inferExpectedSpacingMm(contoursBySlice, sliceSpacingMm);

  contoursBySlice.forEach((contour) => {
    const area = getContourAreaMm2(contour);
    if (isRuleEnabled('open-contour') && !contour.isClosed) {
      issues.push({
        type: 'open-contour',
        severity: 'warning',
        slicePosition: contour.slicePosition,
        message: `Open contour at z=${contour.slicePosition.toFixed(1)} mm.`,
      });
    }
    if (isRuleEnabled('degenerate-contour') && area <= MIN_VALID_AREA_MM2) {
      issues.push({
        type: 'degenerate-contour',
        severity: 'warning',
        slicePosition: contour.slicePosition,
        message: `Degenerate contour at z=${contour.slicePosition.toFixed(1)} mm.`,
      });
    }
    if (
      isRuleEnabled('out-of-bounds') &&
      normalizedContext.imageBounds &&
      contourExceedsBounds(contour, normalizedContext.imageBounds)
    ) {
      issues.push({
        type: 'out-of-bounds',
        severity: 'warning',
        slicePosition: contour.slicePosition,
        message: `Contour extends outside image bounds at z=${contour.slicePosition.toFixed(1)} mm.`,
      });
    }
  });

  for (let index = 1; index < contoursBySlice.length; index += 1) {
    const previous = contoursBySlice[index - 1];
    const current = contoursBySlice[index];
    const gap = current.slicePosition - previous.slicePosition;
    if (isRuleEnabled('slice-gap') && gap > expectedSpacingMm * 1.5) {
      issues.push({
        type: 'slice-gap',
        severity: 'warning',
        slicePosition: current.slicePosition,
        message: `Gap from z=${previous.slicePosition.toFixed(1)} to ${current.slicePosition.toFixed(1)} mm.`,
      });
    }

    const previousArea = getContourAreaMm2(previous);
    const currentArea = getContourAreaMm2(current);
    const smallerArea = Math.min(previousArea, currentArea);
    const largerArea = Math.max(previousArea, currentArea);
    if (
      isRuleEnabled('area-jump') &&
      smallerArea > MIN_VALID_AREA_MM2 &&
      largerArea - smallerArea >= MIN_AREA_JUMP_MM2 &&
      largerArea / smallerArea >= AREA_JUMP_RATIO
    ) {
      issues.push({
        type: 'area-jump',
        severity: 'warning',
        slicePosition: current.slicePosition,
        message: `Area jump near z=${current.slicePosition.toFixed(1)} mm.`,
      });
    }

    const previousCentroid = getContourCentroidMm(previous);
    const currentCentroid = getContourCentroidMm(current);
    if (previousCentroid && currentCentroid) {
      const centroidDistance = Math.hypot(
        currentCentroid.x - previousCentroid.x,
        currentCentroid.y - previousCentroid.y
      );
      if (isRuleEnabled('centroid-jump') && centroidDistance >= MIN_CENTROID_JUMP_MM) {
        issues.push({
          type: 'centroid-jump',
          severity: 'warning',
          slicePosition: current.slicePosition,
          message: `Centroid jump near z=${current.slicePosition.toFixed(1)} mm.`,
        });
      }
    }
  }

  return {
    issueCount: issues.length,
    warningCount: issues.filter((issue) => issue.severity === 'warning').length,
    issues,
  };
}
