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

describe('compareStructureSets @links:SRS-015,SYS-008,CRS-007', () => {
  it('summarizes added, removed, and changed structures', () => {
    const previous = structureSet('previous', [
      {
        id: 'heart',
        name: 'Heart',
        type: 'OAR',
        color: [255, 0, 0],
        volume_cc: 10,
        contours: [{
          referencedSOPInstanceUID: 'sop-0',
          slicePosition: 0,
          points: new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0]),
          isClosed: true,
        }],
      },
      {
        id: 'lung',
        name: 'Lung_L',
        type: 'OAR',
        color: [0, 255, 0],
        volume_cc: 50,
        contours: [{
          referencedSOPInstanceUID: 'sop-5',
          slicePosition: 5,
          points: new Float32Array([0, 0, 5, 10, 0, 5, 10, 10, 5, 0, 10, 5]),
          isClosed: true,
        }],
      },
    ]);
    const current = structureSet('current', [
      {
        id: 'heart',
        name: 'Heart',
        type: 'OAR',
        color: [255, 0, 0],
        volume_cc: 12,
        contours: [{
          referencedSOPInstanceUID: 'sop-0',
          slicePosition: 0,
          points: new Float32Array([0, 0, 0, 12, 0, 0, 12, 12, 0, 0, 12, 0]),
          isClosed: true,
        }],
      },
      {
        id: 'ptv',
        name: 'PTV',
        type: 'PTV',
        color: [0, 0, 255],
        volume_cc: 22,
        contours: [{
          referencedSOPInstanceUID: 'sop-10',
          slicePosition: 10,
          points: new Float32Array([0, 0, 10, 15, 0, 10, 15, 15, 10, 0, 15, 10]),
          isClosed: true,
        }],
      },
    ]);

    const comparison = compareStructureSets(previous, current);

    expect(comparison.addedCount).toBe(1);
    expect(comparison.removedCount).toBe(1);
    expect(comparison.changedCount).toBe(1);
    expect(comparison.rows.find((row) => row.name === 'Heart')?.volumeDeltaCc).toBe(2);
    expect(comparison.rows.find((row) => row.name === 'Heart')).toEqual(expect.objectContaining({
      currentStructureId: 'heart',
      previousStructureId: 'heart',
      targetSlicePosition: 0,
    }));
    expect(comparison.rows.find((row) => row.name === 'PTV')).toEqual(expect.objectContaining({
      currentStructureId: 'ptv',
      targetSlicePosition: 10,
    }));
  });
});
