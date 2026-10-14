import type { Structure } from '@contourlab/shared-types';
import { useStructureStore } from '../store/structureStore';
import { useVolumeStore, type LoadedSeries } from '../store/volumeStore';
import { slicePositionZ } from '../dicom/slicePosition';
import { computeVolume } from './VolumeCalculator';

const SAME_VOLUME_CC = 1e-9;

/** Volume of a structure in cm³ on the image set it was drawn on, with a per-slice thickness. */
export function structureVolumeOn(structure: Structure, series: LoadedSeries, fallbackThickness_mm?: number): number {
  const positions = series.series.instances.flatMap((instance) => {
    const z = slicePositionZ(instance);
    return z === undefined ? [] : [z];
  });
  return computeVolume(structure, fallbackThickness_mm ?? (series.volume.spacing[2] || 1), positions);
}

/**
 * Keeps every structure's volume in step with its contours. A volume computed only where one
 * editor happened to call for it went stale after boolean, margin and interpolation operations,
 * undo and redo, imports and auto-contouring; this follows the contours themselves, whichever
 * way they changed. It writes through setStructureVolume, which is not an edit, so restoring a
 * draft or loading a structure set does not mark the series unsaved. Call once at startup.
 */
export function installVolumeRefresh(): () => void {
  return useStructureStore.subscribe((state, previous) => {
    if (state.structureSets === previous.structureSets) return;

    const loaded = useVolumeStore.getState().loadedSeries;
    for (const structureSet of state.structureSets) {
      const series = loaded.find((candidate) => candidate.seriesUID === structureSet.referencedSeriesUID);
      if (!series) continue;
      const before = previous.structureSets.find((candidate) => candidate.id === structureSet.id);

      for (const structure of structureSet.structures) {
        const unchanged = before?.structures.find((candidate) => candidate.id === structure.id)?.contours === structure.contours;
        if (unchanged) continue;

        const volume_cc = structureVolumeOn(structure, series);
        if (Math.abs(volume_cc - (structure.volume_cc ?? 0)) > SAME_VOLUME_CC) {
          state.setStructureVolume(structureSet.id, structure.id, volume_cc);
        }
      }
    }
  });
}
