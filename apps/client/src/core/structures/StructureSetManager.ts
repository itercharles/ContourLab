import { v4 as uuidv4 } from 'uuid';
import type { Structure, StructureSet, StructureType } from '@webtps/shared-types';
import {
  DEFAULT_COLORS_BY_TYPE,
  getSequentialColor,
  inferTypeFromName,
} from './NamingConventions';
import { computeVolume } from './VolumeCalculator';
import { useStructureStore } from '../store/structureStore';

export const StructureSetManager = {
  createStructureSet(referencedSeriesUID: string): StructureSet {
    const ss: StructureSet = {
      id: uuidv4(),
      label: 'Structure Set',
      referencedSeriesUID,
      structures: [],
      version: 1,
    };
    useStructureStore.getState().addStructureSet(ss);
    return ss;
  },

  syncSelectionToSeries(referencedSeriesUID: string | null): void {
    const store = useStructureStore.getState();

    if (!referencedSeriesUID) {
      store.setActiveStructureSet(null);
      store.setActiveStructure(null);
      return;
    }

    const targetSet = store.structureSets.find(
      (structureSet) => structureSet.referencedSeriesUID === referencedSeriesUID
    );

    if (!targetSet) {
      store.setActiveStructureSet(null);
      store.setActiveStructure(null);
      return;
    }

    const activeStructureStillValid =
      store.activeStructureSetId === targetSet.id &&
      !!targetSet.structures.find((structure) => structure.id === store.activeStructureId);

    store.setActiveStructureSet(targetSet.id);
    if (activeStructureStillValid) {
      return;
    }

    store.setActiveStructure(targetSet.structures[0]?.id ?? null);
  },

  createStructure(
    setId: string,
    name: string,
    type?: StructureType,
    color?: [number, number, number]
  ): Structure {
    const store = useStructureStore.getState();
    const ss = store.structureSets.find((s) => s.id === setId);
    const index = ss?.structures.length ?? 0;

    const resolvedType = type ?? inferTypeFromName(name);
    const resolvedColor =
      color ?? DEFAULT_COLORS_BY_TYPE[resolvedType] ?? getSequentialColor(index);

    const structure: Structure = {
      id: uuidv4(),
      name,
      type: resolvedType,
      color: resolvedColor,
      contours: [],
      isVisible: true,
      isLocked: false,
      volume_cc: 0,
    };

    store.addStructure(setId, structure);
    store.setActiveStructure(structure.id);
    return structure;
  },

  refreshVolume(
    setId: string,
    structureId: string,
    sliceThickness_mm: number
  ): void {
    const store = useStructureStore.getState();
    const ss = store.structureSets.find((s) => s.id === setId);
    const structure = ss?.structures.find((s) => s.id === structureId);
    if (!structure) return;

    const volume_cc = computeVolume(structure, sliceThickness_mm);
    store.updateStructure(setId, structureId, { volume_cc });
  },
};
