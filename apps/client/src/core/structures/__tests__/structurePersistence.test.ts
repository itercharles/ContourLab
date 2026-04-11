import { describe, expect, it } from 'vitest';
import type { StructureSet } from '@webtps/shared-types';
import { exportStructureSets, importStructureSets } from '../structurePersistence';

function makeStructureSet(): StructureSet {
  return {
    id: 'ss-1',
    label: 'Imported Set',
    referencedSeriesUID: 'series-1',
    version: 1,
    structures: [
      {
        id: 'structure-1',
        name: 'PTV',
        type: 'PTV',
        color: [0, 0, 255],
        isLocked: false,
        isVisible: true,
        volume_cc: 12.5,
        contours: [
          {
            referencedSOPInstanceUID: '1.2.3',
            slicePosition: -42.5,
            points: new Float32Array([1, 2, 3, 4, 5, 6]),
            isClosed: true,
          },
        ],
      },
    ],
  };
}

describe('structurePersistence', () => {
  it('round-trips structure sets through JSON-safe payloads', () => {
    const payload = exportStructureSets([makeStructureSet()], 'ss-1', 'structure-1');
    const imported = importStructureSets(JSON.stringify(payload));

    expect(imported.activeStructureSetId).toBe('ss-1');
    expect(imported.activeStructureId).toBe('structure-1');
    expect(imported.structureSets).toHaveLength(1);
    expect(imported.structureSets[0].structures[0].contours[0].points).toBeInstanceOf(Float32Array);
    expect(Array.from(imported.structureSets[0].structures[0].contours[0].points)).toEqual([
      1, 2, 3, 4, 5, 6,
    ]);
  });

  it('rejects unsupported payload versions', () => {
    expect(() =>
      importStructureSets(JSON.stringify({ version: 999, structureSets: [] }))
    ).toThrow('Unsupported structure JSON version');
  });
});
