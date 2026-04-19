import type { ContourSlice } from '@webtps/shared-types';
import { UndoRedoManager } from './UndoRedoManager';
import { useStructureStore } from '../store/structureStore';

export interface FreehandContourData {
  points: Float32Array;  // [x,y,z, ...] in mm
  slicePosition: number;
  sopInstanceUID: string;
}

export const ContourEngine = {
  /**
   * Add a completed freehand or polygon contour to the active structure.
   */
  addContour(
    structureSetId: string,
    structureId: string,
    data: FreehandContourData
  ): boolean {
    const store = useStructureStore.getState();
    const ss = store.structureSets.find((s) => s.id === structureSetId);
    const structure = ss?.structures.find((s) => s.id === structureId);
    if (!structure || (structure.isLocked ?? false)) return false;

    const existing = structure.contours.find((c) => c.slicePosition === data.slicePosition);

    const newSlice: ContourSlice = {
      referencedSOPInstanceUID: data.sopInstanceUID,
      slicePosition: data.slicePosition,
      points: data.points,
      isClosed: true,
    };

    if (existing) {
      // Replace — wrap in undo/redo command
      const oldSlice = { ...existing, points: new Float32Array(existing.points) };
      UndoRedoManager.push({
        description: `Edit contour at z=${data.slicePosition.toFixed(1)}`,
        execute: () =>
          store.updateContourSlice(structureSetId, structureId, data.slicePosition, newSlice),
        undo: () =>
          store.updateContourSlice(structureSetId, structureId, data.slicePosition, oldSlice),
      });
    } else {
      UndoRedoManager.push({
        description: `Add contour at z=${data.slicePosition.toFixed(1)}`,
        execute: () =>
          store.addContourSlice(structureSetId, structureId, newSlice),
        undo: () =>
          store.updateStructure(structureSetId, structureId, {
            contours: ss!.structures
              .find((s) => s.id === structureId)!
              .contours.filter((c) => c.slicePosition !== data.slicePosition),
          }),
      });
    }

    return true;
  },

  addContours(
    structureSetId: string,
    structureId: string,
    slices: ContourSlice[],
    description = 'Add contours'
  ): boolean {
    if (slices.length === 0) return false;

    const store = useStructureStore.getState();
    const ss = store.structureSets.find((s) => s.id === structureSetId);
    const structure = ss?.structures.find((s) => s.id === structureId);
    if (!structure || (structure.isLocked ?? false)) return false;

    const oldContours = structure.contours.map((contour) => ({
      ...contour,
      points: new Float32Array(contour.points),
    }));
    const nextContours = [
      ...oldContours.filter(
        (contour) => !slices.some((slice) => slice.slicePosition === contour.slicePosition)
      ),
      ...slices.map((slice) => ({ ...slice, points: new Float32Array(slice.points) })),
    ].sort((a, b) => a.slicePosition - b.slicePosition);

    UndoRedoManager.push({
      description,
      execute: () =>
        store.updateStructure(structureSetId, structureId, {
          contours: nextContours,
        }),
      undo: () =>
        store.updateStructure(structureSetId, structureId, {
          contours: oldContours,
        }),
    });

    return true;
  },

  /**
   * Delete all contours for a structure on a given slice.
   */
  deleteContourOnSlice(
    structureSetId: string,
    structureId: string,
    slicePosition: number
  ): boolean {
    const store = useStructureStore.getState();
    const ss = store.structureSets.find((s) => s.id === structureSetId);
    const structure = ss?.structures.find((s) => s.id === structureId);
    if (!structure || (structure.isLocked ?? false)) return false;

    const removed = structure.contours.filter((c) => c.slicePosition === slicePosition);
    if (removed.length === 0) return false;

    UndoRedoManager.push({
      description: `Delete contour at z=${slicePosition.toFixed(1)}`,
      execute: () =>
        store.updateStructure(structureSetId, structureId, {
          contours: structure.contours.filter((c) => c.slicePosition !== slicePosition),
        }),
      undo: () => {
        for (const slice of removed) {
          store.addContourSlice(structureSetId, structureId, slice);
        }
      },
    });

    return true;
  },
};
