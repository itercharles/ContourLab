import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Structure, StructureSet } from '@webtps/shared-types';

const mockStore = {
  structureSets: [] as StructureSet[],
  activeStructureSetId: null as string | null,
  activeStructureId: null as string | null,
  addStructureSet: vi.fn(),
  setActiveStructureSet: vi.fn((id: string | null) => {
    mockStore.activeStructureSetId = id;
  }),
  setActiveStructure: vi.fn((id: string | null) => {
    mockStore.activeStructureId = id;
  }),
  addStructure: vi.fn(),
  updateStructure: vi.fn((setId: string, structureId: string, patch: Partial<Structure>) => {
    const ss = mockStore.structureSets.find((structureSet) => structureSet.id === setId);
    const structure = ss?.structures.find((item) => item.id === structureId);
    if (structure) {
      Object.assign(structure, patch);
    }
  }),
};

vi.mock('../../store/structureStore', () => ({
  useStructureStore: {
    getState: vi.fn(() => mockStore),
  },
}));

import { StructureSetManager } from '../StructureSetManager';

function makeStructure(id: string): Structure {
  return {
    id,
    name: id,
    type: 'OAR',
    color: [255, 0, 0],
    contours: [],
    isVisible: true,
    isLocked: false,
    volume_cc: 0,
  };
}

function makeStructureSet(
  id: string,
  referencedSeriesUID: string,
  structures: Structure[]
): StructureSet {
  return {
    id,
    label: id,
    referencedSeriesUID,
    structures,
    version: 1,
  };
}

beforeEach(() => {
  mockStore.structureSets = [];
  mockStore.activeStructureSetId = null;
  mockStore.activeStructureId = null;
  vi.clearAllMocks();
});

describe('StructureSetManager.syncSelectionToSeries', () => {
  it('clears active selection when no series is active', () => {
    StructureSetManager.syncSelectionToSeries(null);

    expect(mockStore.setActiveStructureSet).toHaveBeenCalledWith(null);
    expect(mockStore.setActiveStructure).toHaveBeenCalledWith(null);
  });

  it('does not implicitly activate the first matching structure set', () => {
    mockStore.structureSets = [
      makeStructureSet('ss-1', 'series-a', [makeStructure('heart'), makeStructure('lung')]),
    ];

    StructureSetManager.syncSelectionToSeries('series-a');

    expect(mockStore.setActiveStructureSet).toHaveBeenCalledWith(null);
    expect(mockStore.setActiveStructure).toHaveBeenCalledWith(null);
  });

  it('preserves the active structure when it still belongs to the active series', () => {
    mockStore.structureSets = [
      makeStructureSet('ss-1', 'series-a', [makeStructure('heart'), makeStructure('lung')]),
    ];
    mockStore.activeStructureSetId = 'ss-1';
    mockStore.activeStructureId = 'lung';

    StructureSetManager.syncSelectionToSeries('series-a');

    expect(mockStore.setActiveStructureSet).toHaveBeenCalledWith('ss-1');
    expect(mockStore.setActiveStructure).not.toHaveBeenCalled();
  });

  it('preserves the active structure set when multiple sets belong to the active series', () => {
    mockStore.structureSets = [
      makeStructureSet('ss-original', 'series-a', [makeStructure('heart')]),
      makeStructureSet('ss-imported', 'series-a', [makeStructure('brainstem')]),
    ];
    mockStore.activeStructureSetId = 'ss-imported';
    mockStore.activeStructureId = 'brainstem';

    StructureSetManager.syncSelectionToSeries('series-a');

    expect(mockStore.setActiveStructureSet).toHaveBeenCalledWith('ss-imported');
    expect(mockStore.setActiveStructure).not.toHaveBeenCalled();
  });

  it('clears active selection when the series has no structure set', () => {
    mockStore.structureSets = [
      makeStructureSet('ss-1', 'series-a', [makeStructure('heart')]),
    ];
    mockStore.activeStructureSetId = 'ss-1';
    mockStore.activeStructureId = 'heart';

    StructureSetManager.syncSelectionToSeries('series-b');

    expect(mockStore.setActiveStructureSet).toHaveBeenCalledWith(null);
    expect(mockStore.setActiveStructure).toHaveBeenCalledWith(null);
  });

  it('clears active selection when a different image series becomes active', () => {
    mockStore.structureSets = [
      makeStructureSet('ss-a', 'series-a', [makeStructure('heart')]),
      makeStructureSet('ss-b', 'series-b', [makeStructure('brain')]),
    ];
    mockStore.activeStructureSetId = 'ss-a';
    mockStore.activeStructureId = 'heart';

    StructureSetManager.syncSelectionToSeries('series-b');

    expect(mockStore.setActiveStructureSet).toHaveBeenCalledWith(null);
    expect(mockStore.setActiveStructure).toHaveBeenCalledWith(null);
  });
});

describe('StructureSetManager structure naming', () => {
  it('rejects duplicate structure names in a structure set', () => {
    mockStore.structureSets = [
      makeStructureSet('ss-1', 'series-a', [
        {
          ...makeStructure('ptv-1'),
          name: 'PTV',
        },
      ]),
    ];

    expect(() => StructureSetManager.createStructure('ss-1', 'ptv')).toThrow(
      'already exists'
    );
  });

  it('renames a structure when the new name is unique', () => {
    mockStore.structureSets = [
      makeStructureSet('ss-1', 'series-a', [
        {
          ...makeStructure('ptv-1'),
          name: 'PTV',
        },
      ]),
    ];

    StructureSetManager.renameStructure('ss-1', 'ptv-1', 'CTV');

    expect(mockStore.updateStructure).toHaveBeenCalledWith('ss-1', 'ptv-1', {
      name: 'CTV',
      type: 'CTV',
    });
  });

  it('rejects duplicate names during rename', () => {
    mockStore.structureSets = [
      makeStructureSet('ss-1', 'series-a', [
        {
          ...makeStructure('ptv-1'),
          name: 'PTV',
        },
        {
          ...makeStructure('ctv-1'),
          name: 'CTV',
        },
      ]),
    ];

    expect(() => StructureSetManager.renameStructure('ss-1', 'ctv-1', 'ptv')).toThrow(
      'already exists'
    );
  });
});
