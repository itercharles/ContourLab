import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import type { Structure, StructureSet, ContourSlice } from '@webtps/shared-types';

interface StructureState {
  structureSets: StructureSet[];
  activeStructureSetId: string | null;
  activeStructureId: string | null;
  addStructureSet: (ss: StructureSet) => void;
  replaceStructureSets: (structureSets: StructureSet[]) => void;
  setActiveStructureSet: (id: string | null) => void;
  setActiveStructure: (id: string | null) => void;
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

export const useStructureStore = create<StructureState>()(
  immer((set) => ({
    structureSets: [],
    activeStructureSetId: null,
    activeStructureId: null,

    addStructureSet: (ss) =>
      set((state) => {
        state.structureSets.push(ss);
        if (state.activeStructureSetId === null) state.activeStructureSetId = ss.id;
      }),

    replaceStructureSets: (structureSets) =>
      set((state) => {
        state.structureSets = structureSets;
      }),

    setActiveStructureSet: (id) =>
      set((state) => {
        state.activeStructureSetId = id;
      }),

    setActiveStructure: (id) =>
      set((state) => {
        state.activeStructureId = id;
      }),

    addStructure: (setId, s) =>
      set((state) => {
        const ss = state.structureSets.find((x) => x.id === setId);
        if (ss) ss.structures.push(s);
      }),

    updateStructure: (setId, structureId, patch) =>
      set((state) => {
        const ss = state.structureSets.find((x) => x.id === setId);
        if (!ss) return;
        const idx = ss.structures.findIndex((s) => s.id === structureId);
        if (idx !== -1) Object.assign(ss.structures[idx], patch);
      }),

    deleteStructure: (setId, structureId) =>
      set((state) => {
        const ss = state.structureSets.find((x) => x.id === setId);
        if (!ss) return;
        ss.structures = ss.structures.filter((s) => s.id !== structureId);
        if (state.activeStructureId === structureId) state.activeStructureId = null;
      }),

    addContourSlice: (setId, structureId, slice) =>
      set((state) => {
        const ss = state.structureSets.find((x) => x.id === setId);
        if (!ss) return;
        const structure = ss.structures.find((s) => s.id === structureId);
        if (structure) structure.contours.push(slice);
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
      }),
  }))
);

// Suppress unused warning for findStructure — it may be used by ContourEngine directly
void findStructure;
