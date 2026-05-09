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

    const activeSet = store.structureSets.find(
      (structureSet) =>
        structureSet.id === store.activeStructureSetId &&
        structureSet.referencedSeriesUID === referencedSeriesUID
    );

    const fallbackSet = store.structureSets.find(
      (structureSet) => structureSet.referencedSeriesUID === referencedSeriesUID
    );

    const resolvedSet = activeSet ?? fallbackSet;

    if (!resolvedSet) {
      store.setActiveStructureSet(null);
      store.setActiveStructure(null);
      return;
    }

    const activeStructureStillValid =
      !!resolvedSet.structures.find((structure) => structure.id === store.activeStructureId);

    store.setActiveStructureSet(resolvedSet.id);
    if (activeStructureStillValid) {
      return;
    }

    store.setActiveStructure(resolvedSet.structures[0]?.id ?? null);
  },

  createStructure(
    setId: string,
    name: string,
    type?: StructureType,
    color?: [number, number, number]
  ): Structure {
    const store = useStructureStore.getState();
    const ss = store.structureSets.find((s) => s.id === setId);
    if (!ss) {
      throw new Error('Structure set not found.');
    }
    if (!isUniqueStructureName(ss, name)) {
      throw new Error(`Structure "${name.trim()}" already exists in this structure set.`);
    }
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

  renameStructure(setId: string, structureId: string, name: string): void {
    const normalizedName = name.trim();
    if (!normalizedName) {
      throw new Error('Structure name is required.');
    }

    const store = useStructureStore.getState();
    const ss = store.structureSets.find((s) => s.id === setId);
    if (!ss) {
      throw new Error('Structure set not found.');
    }

    if (!isUniqueStructureName(ss, normalizedName, structureId)) {
      throw new Error(`Structure "${normalizedName}" already exists in this structure set.`);
    }

    const resolvedType = inferTypeFromName(normalizedName);
    store.updateStructure(setId, structureId, {
      name: normalizedName,
      type: resolvedType,
    });
    store.setActiveStructure(structureId);
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

function isUniqueStructureName(
  structureSet: StructureSet,
  name: string,
  exceptStructureId?: string
): boolean {
  const normalized = normalizeStructureName(name);
  return !structureSet.structures.some(
    (structure) =>
      structure.id !== exceptStructureId &&
      normalizeStructureName(structure.name) === normalized
  );
}

function normalizeStructureName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toUpperCase();
}
