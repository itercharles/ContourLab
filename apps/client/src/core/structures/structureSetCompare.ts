import type { ContourSlice, StructureSet } from '@contourlab/shared-types';
import { getReviewSlices } from './contourReview';

export interface StructureComparisonRow {
  name: string;
  status: 'added' | 'removed' | 'changed' | 'unchanged';
  currentStructureId?: string;
  previousStructureId?: string;
  targetSlicePosition?: number;
  volumeDeltaCc: number;
  sliceDelta: number;
  previousVolumeCc: number;
  currentVolumeCc: number;
  previousSliceCount: number;
  currentSliceCount: number;
}

export interface StructureSetComparison {
  addedCount: number;
  removedCount: number;
  changedCount: number;
  rows: StructureComparisonRow[];
}

function normalizeName(name: string): string {
  return name.trim().toUpperCase();
}

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

function findTargetSlicePosition(
  previousContours: ContourSlice[] | undefined,
  currentContours: ContourSlice[] | undefined,
  status: StructureComparisonRow['status']
): number | undefined {
  const previousSlices = getReviewSlices(previousContours ?? []).map((slice) => slice.slicePosition);
  const currentSlices = getReviewSlices(currentContours ?? []).map((slice) => slice.slicePosition);

  if (status === 'added') return currentSlices[0];
  if (status === 'removed') return previousSlices[0];

  const previousSet = new Set(previousSlices);
  const currentSet = new Set(currentSlices);
  const addedSlices = currentSlices.filter((slice) => !previousSet.has(slice));
  if (addedSlices.length > 0) return addedSlices[0];

  const removedSlices = previousSlices.filter((slice) => !currentSet.has(slice));
  if (removedSlices.length > 0) {
    return currentSlices[0] ?? removedSlices[0];
  }

  const previousBySlice = new Map(
    (previousContours ?? []).map((contour) => [contour.slicePosition, contour] as const)
  );
  const currentBySlice = new Map(
    (currentContours ?? []).map((contour) => [contour.slicePosition, contour] as const)
  );
  const commonSlices = currentSlices.filter((slice) => previousBySlice.has(slice));
  let largestAreaDelta = 0;
  let targetSlicePosition: number | undefined;

  for (const slicePosition of commonSlices) {
    const previousContour = previousBySlice.get(slicePosition);
    const currentContour = currentBySlice.get(slicePosition);
    if (!previousContour || !currentContour) continue;

    const areaDelta = Math.abs(
      getContourAreaMm2(currentContour) - getContourAreaMm2(previousContour)
    );
    if (areaDelta > largestAreaDelta) {
      largestAreaDelta = areaDelta;
      targetSlicePosition = slicePosition;
    }
  }

  return targetSlicePosition ?? currentSlices[0] ?? previousSlices[0];
}

export function compareStructureSets(
  previous: StructureSet,
  current: StructureSet
): StructureSetComparison {
  const previousByName = new Map(previous.structures.map((structure) => [normalizeName(structure.name), structure]));
  const currentByName = new Map(current.structures.map((structure) => [normalizeName(structure.name), structure]));
  const names = Array.from(new Set([...previousByName.keys(), ...currentByName.keys()])).sort();

  const rows = names.map((normalizedName) => {
    const previousStructure = previousByName.get(normalizedName);
    const currentStructure = currentByName.get(normalizedName);
    const name = currentStructure?.name ?? previousStructure?.name ?? normalizedName;
    const previousVolumeCc = previousStructure?.volume_cc ?? 0;
    const currentVolumeCc = currentStructure?.volume_cc ?? 0;
    const previousSliceCount = previousStructure ? getReviewSlices(previousStructure.contours).length : 0;
    const currentSliceCount = currentStructure ? getReviewSlices(currentStructure.contours).length : 0;
    const volumeDeltaCc = currentVolumeCc - previousVolumeCc;
    const sliceDelta = currentSliceCount - previousSliceCount;

    let status: StructureComparisonRow['status'] = 'unchanged';
    if (!previousStructure && currentStructure) {
      status = 'added';
    } else if (previousStructure && !currentStructure) {
      status = 'removed';
    } else if (Math.abs(volumeDeltaCc) >= 0.1 || sliceDelta !== 0 || previousStructure?.type !== currentStructure?.type) {
      status = 'changed';
    }

    return {
      name,
      status,
      currentStructureId: currentStructure?.id,
      previousStructureId: previousStructure?.id,
      targetSlicePosition: findTargetSlicePosition(
        previousStructure?.contours,
        currentStructure?.contours,
        status
      ),
      volumeDeltaCc,
      sliceDelta,
      previousVolumeCc,
      currentVolumeCc,
      previousSliceCount,
      currentSliceCount,
    };
  });

  return {
    addedCount: rows.filter((row) => row.status === 'added').length,
    removedCount: rows.filter((row) => row.status === 'removed').length,
    changedCount: rows.filter((row) => row.status === 'changed').length,
    rows,
  };
}
