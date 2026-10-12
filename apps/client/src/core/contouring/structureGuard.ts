import { useStructureStore } from '../store/structureStore';

// Why a structure cannot be edited right now, or null when it can. Used by undo and redo, which run
// long after the edit was first allowed: the structure may have been locked or deleted since.
export function structureEditBlock(structureSetId: string, structureId: string): string | null {
  const structureSet = useStructureStore.getState().structureSets.find((set) => set.id === structureSetId);
  const structure = structureSet?.structures.find((candidate) => candidate.id === structureId);
  if (!structure) return 'The structure no longer exists.';
  if (structure.isLocked ?? false) return `${structure.name} is locked.`;
  return null;
}

export function structureExists(structureSetId: string, structureId: string): boolean {
  return useStructureStore
    .getState()
    .structureSets.find((set) => set.id === structureSetId)
    ?.structures.some((structure) => structure.id === structureId) ?? false;
}
