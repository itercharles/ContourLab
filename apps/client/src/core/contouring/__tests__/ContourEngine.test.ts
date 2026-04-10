import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ContourSlice, Structure, StructureSet } from '@webtps/shared-types';
import type { ContourCommand } from '../UndoRedoManager';

// ---------------------------------------------------------------------------
// Mocks — declared before any imports that use them
// ---------------------------------------------------------------------------

const capturedCommands: ContourCommand[] = [];

vi.mock('../UndoRedoManager', () => ({
  UndoRedoManager: {
    push: vi.fn((cmd: ContourCommand) => {
      capturedCommands.push(cmd);
      cmd.execute();
    }),
  },
}));

// Store mock state — shared between the mock factory and the tests
const mockStore = {
  structureSets: [] as StructureSet[],
  addContourSlice: vi.fn(),
  updateContourSlice: vi.fn(),
  updateStructure: vi.fn(),
};

vi.mock('../../../core/store/structureStore', () => ({
  useStructureStore: {
    getState: vi.fn(() => mockStore),
  },
}));

// Import *after* mocks are registered
import { ContourEngine } from '../ContourEngine';
import { UndoRedoManager } from '../UndoRedoManager';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStructure(contours: ContourSlice[] = []): Structure {
  return {
    id: 'struct-1',
    name: 'PTV',
    type: 'PTV',
    color: [0, 0, 255],
    contours,
    isVisible: true,
    isLocked: false,
    volume_cc: 0,
  };
}

function makeStructureSet(structures: Structure[]): StructureSet {
  return {
    id: 'ss-1',
    label: 'RT Structure Set',
    referencedSeriesUID: '1.2.3',
    structures,
    version: 1,
  };
}

// ---------------------------------------------------------------------------
// Reset between tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  capturedCommands.length = 0;
  vi.clearAllMocks();
  mockStore.structureSets = [];
});

// ---------------------------------------------------------------------------
// addContour
// ---------------------------------------------------------------------------

describe('ContourEngine.addContour', () => {
  it('calls addContourSlice when no existing contour at that slicePosition', () => {
    const structure = makeStructure([]); // no existing contours
    const ss = makeStructureSet([structure]);
    mockStore.structureSets = [ss];

    const points = new Float32Array([0,0,5, 1,0,5, 1,1,5, 0,1,5]);
    ContourEngine.addContour('ss-1', 'struct-1', {
      points,
      slicePosition: 5,
      sopInstanceUID: '1.2.3.4',
    });

    expect(mockStore.addContourSlice).toHaveBeenCalledOnce();
    const [calledSetId, calledStructId, calledSlice] = mockStore.addContourSlice.mock.calls[0] as [
      string, string, ContourSlice
    ];
    expect(calledSetId).toBe('ss-1');
    expect(calledStructId).toBe('struct-1');
    expect(calledSlice.slicePosition).toBe(5);
    expect(calledSlice.points).toEqual(points);
    expect(calledSlice.isClosed).toBe(true);
    expect(mockStore.updateContourSlice).not.toHaveBeenCalled();
  });

  it('calls updateContourSlice when a contour already exists at that slicePosition', () => {
    const existingSlice: ContourSlice = {
      referencedSOPInstanceUID: '9.9.9',
      slicePosition: 5,
      points: new Float32Array([0,0,5, 2,0,5, 2,2,5]),
      isClosed: true,
    };
    const structure = makeStructure([existingSlice]);
    const ss = makeStructureSet([structure]);
    mockStore.structureSets = [ss];

    const newPoints = new Float32Array([0,0,5, 3,0,5, 3,3,5, 0,3,5]);
    ContourEngine.addContour('ss-1', 'struct-1', {
      points: newPoints,
      slicePosition: 5,
      sopInstanceUID: '1.2.3.4',
    });

    expect(mockStore.updateContourSlice).toHaveBeenCalledOnce();
    const [calledSetId, calledStructId, calledPos, calledSlice] = mockStore.updateContourSlice.mock.calls[0] as [
      string, string, number, ContourSlice
    ];
    expect(calledSetId).toBe('ss-1');
    expect(calledStructId).toBe('struct-1');
    expect(calledPos).toBe(5);
    expect(calledSlice.points).toEqual(newPoints);
    expect(mockStore.addContourSlice).not.toHaveBeenCalled();
  });

  it('undo of add-new-slice calls updateStructure to filter out the slice', () => {
    const structure = makeStructure([]); // no existing contours
    const ss = makeStructureSet([structure]);
    mockStore.structureSets = [ss];

    ContourEngine.addContour('ss-1', 'struct-1', {
      points: new Float32Array([0,0,5, 1,0,5, 1,1,5]),
      slicePosition: 5,
      sopInstanceUID: '1.2.3.4',
    });

    expect(capturedCommands).toHaveLength(1);

    // Execute undo — note: at undo-time the ss/structure state is re-read from
    // the closure captured at call-time, so we need the structure to still be
    // in mockStore.structureSets for the filter to work.
    capturedCommands[0].undo();

    expect(mockStore.updateStructure).toHaveBeenCalledOnce();
    const [calledSetId, calledStructId, patch] = mockStore.updateStructure.mock.calls[0] as [
      string, string, Partial<Structure>
    ];
    expect(calledSetId).toBe('ss-1');
    expect(calledStructId).toBe('struct-1');
    // The patch must contain a contours array with slicePosition 5 filtered out
    expect(patch.contours).toBeDefined();
    expect(patch.contours!.every((c) => c.slicePosition !== 5)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// deleteContourOnSlice
// ---------------------------------------------------------------------------

describe('ContourEngine.deleteContourOnSlice', () => {
  it('returns early without pushing to UndoRedoManager when no contour exists', () => {
    const structure = makeStructure([]); // no contours at all
    const ss = makeStructureSet([structure]);
    mockStore.structureSets = [ss];

    ContourEngine.deleteContourOnSlice('ss-1', 'struct-1', 10);

    expect(UndoRedoManager.push).not.toHaveBeenCalled();
    expect(capturedCommands).toHaveLength(0);
  });

  it('pushes a command that calls updateStructure on execute', () => {
    const existingSlice: ContourSlice = {
      referencedSOPInstanceUID: '9.9.9',
      slicePosition: 10,
      points: new Float32Array([0,0,10, 1,0,10, 1,1,10]),
      isClosed: true,
    };
    const structure = makeStructure([existingSlice]);
    const ss = makeStructureSet([structure]);
    mockStore.structureSets = [ss];

    ContourEngine.deleteContourOnSlice('ss-1', 'struct-1', 10);

    expect(capturedCommands).toHaveLength(1);
    // execute() was already called by our mock push; verify updateStructure was called
    expect(mockStore.updateStructure).toHaveBeenCalledOnce();
    const [calledSetId, calledStructId, patch] = mockStore.updateStructure.mock.calls[0] as [
      string, string, Partial<Structure>
    ];
    expect(calledSetId).toBe('ss-1');
    expect(calledStructId).toBe('struct-1');
    // The filtered contours should exclude slicePosition=10
    expect(patch.contours!.every((c) => c.slicePosition !== 10)).toBe(true);
  });

  it("undo of deleteContourOnSlice calls addContourSlice for the removed slice", () => {
    const existingSlice: ContourSlice = {
      referencedSOPInstanceUID: '9.9.9',
      slicePosition: 10,
      points: new Float32Array([0,0,10, 1,0,10, 1,1,10]),
      isClosed: true,
    };
    const structure = makeStructure([existingSlice]);
    const ss = makeStructureSet([structure]);
    mockStore.structureSets = [ss];

    ContourEngine.deleteContourOnSlice('ss-1', 'struct-1', 10);

    expect(capturedCommands).toHaveLength(1);

    // Clear the call record so we can isolate the undo call
    mockStore.addContourSlice.mockClear();

    capturedCommands[0].undo();

    expect(mockStore.addContourSlice).toHaveBeenCalledOnce();
    const [calledSetId, calledStructId, restoredSlice] = mockStore.addContourSlice.mock.calls[0] as [
      string, string, ContourSlice
    ];
    expect(calledSetId).toBe('ss-1');
    expect(calledStructId).toBe('struct-1');
    expect(restoredSlice.slicePosition).toBe(10);
  });
});
