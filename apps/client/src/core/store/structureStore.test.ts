import { beforeEach, describe, expect, it } from 'vitest';
import { useStructureStore } from './structureStore';
import type { StructureSet } from '@contourlab/shared-types';

function makeStructureSet(seriesUID = 'series-1'): StructureSet {
  return {
    id: `ss-${seriesUID}`,
    label: seriesUID,
    referencedSeriesUID: seriesUID,
    version: 1,
    structures: [],
  };
}

beforeEach(() => {
  useStructureStore.setState({
    structureSets: [],
    activeStructureSetId: null,
    activeStructureId: null,
    dirtySeriesUIDs: [],
    repositoryDirtySeriesUIDs: [],
  });
});

describe('structureStore dirty tracking @links:SRS-010', () => {
  it('marks a series dirty when a structure set is added @testing:T5 @testing:T8', () => {
    useStructureStore.getState().addStructureSet(makeStructureSet());

    expect(useStructureStore.getState().dirtySeriesUIDs).toEqual(['series-1']);
    expect(useStructureStore.getState().repositoryDirtySeriesUIDs).toEqual(['series-1']);
  });

  it('clears draft dirty state for a specific series without clearing repository dirty state @testing:T6', () => {
    const store = useStructureStore.getState();
    store.addStructureSet(makeStructureSet('series-1'));
    store.addStructureSet(makeStructureSet('series-2'));

    store.markSeriesClean('series-1');

    expect(useStructureStore.getState().dirtySeriesUIDs).toEqual(['series-2']);
    expect(useStructureStore.getState().repositoryDirtySeriesUIDs).toEqual([
      'series-1',
      'series-2',
    ]);
  });

  it('clears repository dirty state for a specific series @testing:T7', () => {
    const store = useStructureStore.getState();
    store.addStructureSet(makeStructureSet('series-1'));
    store.addStructureSet(makeStructureSet('series-2'));

    store.markSeriesRepositoryClean('series-1');

    expect(useStructureStore.getState().repositoryDirtySeriesUIDs).toEqual(['series-2']);
  });

  it('can mark a draft dirty without enabling repository push state', () => {
    const store = useStructureStore.getState();

    store.markSeriesDraftDirty('series-1');

    expect(useStructureStore.getState().dirtySeriesUIDs).toEqual(['series-1']);
    expect(useStructureStore.getState().repositoryDirtySeriesUIDs).toEqual([]);
  });
});

describe('structureStore locked structures @links:SYS-003', () => {
  function setWithStructure(isLocked: boolean): StructureSet {
    return {
      ...makeStructureSet(),
      structures: [
        {
          id: 'structure-1',
          name: 'PTV',
          type: 'PTV',
          color: [0, 0, 255],
          contours: [],
          isVisible: true,
          isLocked,
          volume_cc: 0,
        },
      ],
    };
  }
  const structureOf = () => useStructureStore.getState().structureSets[0].structures[0];

  it('does not delete a locked structure @testing:T4', () => {
    useStructureStore.getState().addStructureSet(setWithStructure(true));
    useStructureStore.getState().deleteStructure('ss-series-1', 'structure-1');
    expect(useStructureStore.getState().structureSets[0].structures).toHaveLength(1);
  });

  it('does not change the type or contours of a locked structure, but still changes colour and name @testing:T4', () => {
    useStructureStore.getState().addStructureSet(setWithStructure(true));
    const slice = { referencedSOPInstanceUID: 'sop', slicePosition: 1, points: new Float32Array(9), isClosed: true };
    useStructureStore.getState().updateStructure('ss-series-1', 'structure-1', {
      type: 'OAR',
      contours: [slice],
      color: [1, 2, 3],
      name: 'Renamed',
    });

    expect(structureOf().type).toBe('PTV');
    expect(structureOf().contours).toHaveLength(0);
    expect(structureOf().color).toEqual([1, 2, 3]);
    expect(structureOf().name).toBe('Renamed');
  });

  it('allows the lock to be released, after which the structure can be edited and deleted @testing:T4', () => {
    useStructureStore.getState().addStructureSet(setWithStructure(true));
    useStructureStore.getState().updateStructure('ss-series-1', 'structure-1', { isLocked: false });
    useStructureStore.getState().updateStructure('ss-series-1', 'structure-1', { type: 'OAR' });
    expect(structureOf().type).toBe('OAR');

    useStructureStore.getState().deleteStructure('ss-series-1', 'structure-1');
    expect(useStructureStore.getState().structureSets[0].structures).toHaveLength(0);
  });
});
