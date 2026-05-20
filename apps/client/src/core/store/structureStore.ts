import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Structure, StructureSet, ContourSlice } from '@contourlab/shared-types';

interface StructureState {
  structureSets: StructureSet[];
  activeStructureSetId: string | null;
  activeStructureId: string | null;
  dirtySeriesUIDs: string[];
  repositoryDirtySeriesUIDs: string[];
  addStructureSet: (ss: StructureSet) => void;
  replaceStructureSets: (structureSets: StructureSet[]) => void;
  replaceStructureSetForSeries: (structureSet: StructureSet) => void;
  setActiveStructureSet: (id: string | null) => void;
  setActiveStructure: (id: string | null) => void;
  markSeriesDirty: (seriesUID: string) => void;
  markSeriesDraftDirty: (seriesUID: string) => void;
  markSeriesClean: (seriesUID: string) => void;
  markSeriesRepositoryClean: (seriesUID: string) => void;
  addStructure: (setId: string, s: Structure) => void;
  updateStructure: (setId: string, structureId: string, patch: Partial<Structure>) => void;
  deleteStructure: (setId: string, structureId: string) => void;
  addContourSlice: (setId: string, structureId: string, slice: ContourSlice) => void;
  updateContourSlice: (
    setId: string,
    structureId: string,
    slicePos: number,
    slice: ContourSlice
  ) => void;
}

function findStructure(state: StructureState, setId: string, structureId: string) {
  const ss = state.structureSets.find((s) => s.id === setId);
  if (!ss) return null;
  return ss.structures.find((s) => s.id === structureId) ?? null;
}

function markSeriesDirty(state: StructureState, seriesUID: string) {
  if (!state.dirtySeriesUIDs.includes(seriesUID)) {
    state.dirtySeriesUIDs.push(seriesUID);
  }
  if (!state.repositoryDirtySeriesUIDs.includes(seriesUID)) {
    state.repositoryDirtySeriesUIDs.push(seriesUID);
  }
}

function markSeriesDraftDirty(state: StructureState, seriesUID: string) {
  if (!state.dirtySeriesUIDs.includes(seriesUID)) {
    state.dirtySeriesUIDs.push(seriesUID);
  }
}

export const useStructureStore = create<StructureState>()(
  immer((set) => ({
    structureSets: [],
    activeStructureSetId: null,
    activeStructureId: null,
    dirtySeriesUIDs: [],
    repositoryDirtySeriesUIDs: [],

    addStructureSet: (ss) =>
      set((state) => {
        state.structureSets.push(ss);
        if (state.activeStructureSetId === null) state.activeStructureSetId = ss.id;
        markSeriesDirty(state, ss.referencedSeriesUID);
      }),

    replaceStructureSets: (structureSets) =>
      set((state) => {
        state.structureSets = structureSets;
      }),

    replaceStructureSetForSeries: (structureSet) =>
      set((state) => {
        state.structureSets = [
          ...state.structureSets.filter(
            (existing) => existing.referencedSeriesUID !== structureSet.referencedSeriesUID
          ),
          structureSet,
        ];
        state.activeStructureSetId = structureSet.id;
        state.activeStructureId = structureSet.structures[0]?.id ?? null;
        markSeriesDirty(state, structureSet.referencedSeriesUID);
      }),

    setActiveStructureSet: (id) =>
      set((state) => {
        state.activeStructureSetId = id;
      }),

    setActiveStructure: (id) =>
      set((state) => {
        state.activeStructureId = id;
      }),

    markSeriesDirty: (seriesUID) =>
      set((state) => {
        markSeriesDirty(state, seriesUID);
      }),

    markSeriesDraftDirty: (seriesUID) =>
      set((state) => {
        markSeriesDraftDirty(state, seriesUID);
      }),

    markSeriesClean: (seriesUID) =>
      set((state) => {
        state.dirtySeriesUIDs = state.dirtySeriesUIDs.filter((uid) => uid !== seriesUID);
      }),

    markSeriesRepositoryClean: (seriesUID) =>
      set((state) => {
        state.repositoryDirtySeriesUIDs = state.repositoryDirtySeriesUIDs.filter((uid) => uid !== seriesUID);
      }),

    addStructure: (setId, s) =>
      set((state) => {
        const ss = state.structureSets.find((x) => x.id === setId);
        if (!ss) return;
        ss.structures.push(s);
        markSeriesDirty(state, ss.referencedSeriesUID);
      }),

    updateStructure: (setId, structureId, patch) =>
      set((state) => {
        const ss = state.structureSets.find((x) => x.id === setId);
        if (!ss) return;
        const idx = ss.structures.findIndex((s) => s.id === structureId);
        if (idx !== -1) {
          Object.assign(ss.structures[idx], patch);
          markSeriesDirty(state, ss.referencedSeriesUID);
        }
      }),

    deleteStructure: (setId, structureId) =>
      set((state) => {
        const ss = state.structureSets.find((x) => x.id === setId);
        if (!ss) return;
        ss.structures = ss.structures.filter((s) => s.id !== structureId);
        if (state.activeStructureId === structureId) state.activeStructureId = null;
        markSeriesDirty(state, ss.referencedSeriesUID);
      }),

    addContourSlice: (setId, structureId, slice) =>
      set((state) => {
        const ss = state.structureSets.find((x) => x.id === setId);
        if (!ss) return;
        const structure = ss.structures.find((s) => s.id === structureId);
        if (structure) {
          structure.contours.push(slice);
          markSeriesDirty(state, ss.referencedSeriesUID);
        }
      }),

    updateContourSlice: (setId, structureId, slicePos, slice) =>
      set((state) => {
        const ss = state.structureSets.find((x) => x.id === setId);
        if (!ss) return;
        const structure = ss.structures.find((s) => s.id === structureId);
        if (!structure) return;
        const idx = structure.contours.findIndex((c) => c.slicePosition === slicePos);
        if (idx !== -1) {
          // Replace entirely — do not mutate Float32Array in place through Immer
          structure.contours[idx] = slice;
        } else {
          structure.contours.push(slice);
        }
        markSeriesDirty(state, ss.referencedSeriesUID);
      }),
  }))
);

// Suppress unused warning for findStructure — it may be used by ContourEngine directly
void findStructure;
