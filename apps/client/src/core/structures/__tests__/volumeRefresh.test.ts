import { beforeEach, describe, expect, it } from 'vitest';
import type { ContourSlice, StructureSet } from '@contourlab/shared-types';
import { installVolumeRefresh, structureVolumeOn } from '../volumeRefresh';
import { StructureSetManager } from '../StructureSetManager';
import { useStructureStore } from '../../store/structureStore';
import { useVolumeStore, type LoadedSeries } from '../../store/volumeStore';

const square = (side: number, z = 0): ContourSlice => ({
  referencedSOPInstanceUID: 'sop',
  slicePosition: z,
  points: new Float32Array([0, 0, z, side, 0, z, side, side, z, 0, side, z]),
  isClosed: true,
});

function loadedSeries(positions: number[]): LoadedSeries {
  return {
    seriesUID: 'series-1',
    volume: { spacing: [1, 1, 3] },
    series: { instances: positions.map((z, index) => ({ sopInstanceUID: `sop-${index}`, instanceNumber: index + 1, imagePositionZ: z })) },
  } as unknown as LoadedSeries;
}

function structureSet(contours: ContourSlice[], volume_cc = 0): StructureSet {
  return {
    id: 'ss-1',
    label: 'Set',
    referencedSeriesUID: 'series-1',
    version: 1,
    structures: [
      { id: 'st-1', name: 'PTV', type: 'PTV', color: [255, 0, 0], contours, isVisible: true, isLocked: false, volume_cc },
      { id: 'st-2', name: 'Other', type: 'OAR', color: [0, 255, 0], contours: [square(10)], isVisible: true, isLocked: false, volume_cc: 99 },
    ],
  };
}

const volumeOf = (id = 'st-1') => useStructureStore.getState().structureSets[0].structures.find((s) => s.id === id)?.volume_cc;

let uninstall: () => void;

beforeEach(() => {
  uninstall?.();
  useVolumeStore.setState({ loadedSeries: [loadedSeries([0, 3, 6])], activeSeriesUID: 'series-1' });
  useStructureStore.setState({
    structureSets: [structureSet([square(10)])],
    activeStructureSetId: 'ss-1',
    activeStructureId: 'st-1',
    dirtySeriesUIDs: [],
    repositoryDirtySeriesUIDs: [],
  });
  uninstall = installVolumeRefresh();
});

describe('installVolumeRefresh @links:SRS-006', () => {
  it('recomputes a structure\'s volume when its contours change, whichever way they changed @testing:T8', () => {
    useStructureStore.getState().updateStructure('ss-1', 'st-1', { contours: [square(10, 3)] });
    // one 10 x 10 slice at 3 mm, with neighbours at 0 and 6: slab (3 + 3) / 2 = 3 mm.
    expect(volumeOf()).toBeCloseTo(0.3, 10);

    // What an undo does: put the earlier contours back.
    useStructureStore.getState().updateStructure('ss-1', 'st-1', { contours: [square(10, 3), square(10, 6)] });
    expect(volumeOf()).toBeCloseTo((100 * (3 + 3 / 1)) / 1000, 10);
    useStructureStore.getState().updateStructure('ss-1', 'st-1', { contours: [] });
    expect(volumeOf()).toBe(0);
  });

  it('leaves the other structures alone @testing:T8', () => {
    useStructureStore.getState().updateStructure('ss-1', 'st-1', { contours: [square(20, 3)] });
    expect(volumeOf('st-2')).toBe(99);
  });

  it('does not recompute for a change that is not to the contours @testing:T8', () => {
    useStructureStore.getState().updateStructure('ss-1', 'st-1', { volume_cc: 42 });
    useStructureStore.getState().updateStructure('ss-1', 'st-1', { name: 'Renamed' });
    expect(volumeOf()).toBe(42);
  });

  it('does not mark the series unsaved, because a derived volume is not an edit @testing:T8', () => {
    useStructureStore.getState().replaceStructureSets([structureSet([square(10, 3)])]);

    expect(volumeOf()).toBeCloseTo(0.3, 10);
    expect(useStructureStore.getState().dirtySeriesUIDs).toEqual([]);
    expect(useStructureStore.getState().repositoryDirtySeriesUIDs).toEqual([]);
  });

  it('skips a structure set whose image set is not loaded @testing:T8', () => {
    useVolumeStore.setState({ loadedSeries: [] });
    useStructureStore.getState().updateStructure('ss-1', 'st-1', { contours: [square(10, 3)] });
    expect(volumeOf()).toBe(0);
  });

  it('stops following the store once removed @testing:T8', () => {
    uninstall();
    useStructureStore.getState().updateStructure('ss-1', 'st-1', { contours: [square(10, 3)] });
    expect(volumeOf()).toBe(0);
  });
});

describe('volume on an image set @links:SRS-006', () => {
  it('uses the slice positions of the image set, not only the average spacing @testing:T7', () => {
    const series = loadedSeries([0, 2.5, 5, 10, 15]);
    const set = structureSet([square(10, 5)]);
    // Slice at 5 mm has neighbours at 2.5 and 10: slab (2.5 + 5) / 2 = 3.75 mm, not the 3 mm average.
    expect(structureVolumeOn(set.structures[0], series)).toBeCloseTo((100 * 3.75) / 1000, 10);
  });

  it('is what StructureSetManager.refreshVolume records, whatever thickness it is passed @testing:T8', () => {
    useVolumeStore.setState({ loadedSeries: [loadedSeries([0, 2.5, 5, 10, 15])] });
    useStructureStore.setState({ structureSets: [structureSet([square(10, 5)])] });

    StructureSetManager.refreshVolume('ss-1', 'st-1', 3);

    expect(volumeOf()).toBeCloseTo((100 * 3.75) / 1000, 10);
  });
});
