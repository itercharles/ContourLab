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
  updateStructure: vi.fn(),
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

  it('selects the first structure in the matching structure set', () => {
    mockStore.structureSets = [
      makeStructureSet('ss-1', 'series-a', [makeStructure('heart'), makeStructure('lung')]),
    ];

    StructureSetManager.syncSelectionToSeries('series-a');

    expect(mockStore.setActiveStructureSet).toHaveBeenCalledWith('ss-1');
    expect(mockStore.setActiveStructure).toHaveBeenCalledWith('heart');
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
});
