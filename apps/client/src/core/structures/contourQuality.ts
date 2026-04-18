import type { ContourSlice, Structure } from '@webtps/shared-types';

export type ContourQualityIssueType =
  | 'empty'
  | 'open-contour'
  | 'degenerate-contour'
  | 'slice-gap'
  | 'area-jump';

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

const MIN_VALID_AREA_MM2 = 0.01;
const AREA_JUMP_RATIO = 3;
const MIN_AREA_JUMP_MM2 = 50;

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

export function analyzeContourQuality(
  structure: Structure,
  sliceSpacingMm = 1
): ContourQualitySummary {
  const issues: ContourQualityIssue[] = [];

  if (structure.contours.length === 0) {
    issues.push({
      type: 'empty',
      severity: 'info',
      message: 'No contours in this structure.',
    });
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
    if (!contour.isClosed) {
      issues.push({
        type: 'open-contour',
        severity: 'warning',
        slicePosition: contour.slicePosition,
        message: `Open contour at z=${contour.slicePosition.toFixed(1)} mm.`,
      });
    }
    if (area <= MIN_VALID_AREA_MM2) {
      issues.push({
        type: 'degenerate-contour',
        severity: 'warning',
        slicePosition: contour.slicePosition,
        message: `Degenerate contour at z=${contour.slicePosition.toFixed(1)} mm.`,
      });
    }
  });

  for (let index = 1; index < contoursBySlice.length; index += 1) {
    const previous = contoursBySlice[index - 1];
    const current = contoursBySlice[index];
    const gap = current.slicePosition - previous.slicePosition;
    if (gap > expectedSpacingMm * 1.5) {
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
  }

  return {
    issueCount: issues.length,
    warningCount: issues.filter((issue) => issue.severity === 'warning').length,
    issues,
  };
}
