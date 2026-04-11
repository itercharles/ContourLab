import { beforeEach, describe, expect, it } from 'vitest';
import { useStructureStore } from './structureStore';
import type { StructureSet } from '@webtps/shared-types';

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
  });
});

describe('structureStore dirty tracking', () => {
  it('marks a series dirty when a structure set is added', () => {
    useStructureStore.getState().addStructureSet(makeStructureSet());

    expect(useStructureStore.getState().dirtySeriesUIDs).toEqual(['series-1']);
  });

  it('clears dirty state for a specific series', () => {
    const store = useStructureStore.getState();
    store.addStructureSet(makeStructureSet('series-1'));
    store.addStructureSet(makeStructureSet('series-2'));

    store.markSeriesClean('series-1');

    expect(useStructureStore.getState().dirtySeriesUIDs).toEqual(['series-2']);
  });
});
