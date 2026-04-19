import type { StructureSet } from '@webtps/shared-types';
import { getReviewSlices } from './contourReview';

export interface StructureComparisonRow {
  name: string;
  status: 'added' | 'removed' | 'changed' | 'unchanged';
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
