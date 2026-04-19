import { describe, expect, it } from 'vitest';
import type { StructureSet } from '@webtps/shared-types';
import { compareStructureSets } from '../structureSetCompare';

function structureSet(label: string, structures: StructureSet['structures']): StructureSet {
  return {
    id: label,
    label,
    referencedSeriesUID: 'series-1',
    version: 1,
    structures,
  };
}

describe('compareStructureSets', () => {
  it('summarizes added, removed, and changed structures', () => {
    const previous = structureSet('previous', [
      {
        id: 'heart',
        name: 'Heart',
        type: 'OAR',
        color: [255, 0, 0],
        volume_cc: 10,
        contours: [],
      },
      {
        id: 'lung',
        name: 'Lung_L',
        type: 'OAR',
        color: [0, 255, 0],
        volume_cc: 50,
        contours: [],
      },
    ]);
    const current = structureSet('current', [
      {
        id: 'heart',
        name: 'Heart',
        type: 'OAR',
        color: [255, 0, 0],
        volume_cc: 12,
        contours: [],
      },
      {
        id: 'ptv',
        name: 'PTV',
        type: 'PTV',
        color: [0, 0, 255],
        volume_cc: 22,
        contours: [],
      },
    ]);

    const comparison = compareStructureSets(previous, current);

    expect(comparison.addedCount).toBe(1);
    expect(comparison.removedCount).toBe(1);
    expect(comparison.changedCount).toBe(1);
    expect(comparison.rows.find((row) => row.name === 'Heart')?.volumeDeltaCc).toBe(2);
  });
});
