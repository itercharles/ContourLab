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
