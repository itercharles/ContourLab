import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  uiStore: {
    setActiveTool: vi.fn(),
    setRightSidebarOpen: vi.fn(),
    setActiveViewport: vi.fn(),
  },
  volumeStore: {
    activeSeriesUID: null as string | null,
  },
  structureStore: {
    structureSets: [] as Array<{
      id: string;
      referencedSeriesUID: string;
      structures: Array<{ id: string; isLocked?: boolean }>;
    }>,
    activeStructureSetId: null as string | null,
    activeStructureId: null as string | null,
  },
  setActiveToolSpy: vi.fn(),
  logClientDebugSpy: vi.fn(),
}));

vi.mock('../store/uiStore', () => ({
  useUIStore: {
    getState: vi.fn(() => mocks.uiStore),
  },
}));

vi.mock('../store/volumeStore', () => ({
  useVolumeStore: {
    getState: vi.fn(() => mocks.volumeStore),
  },
}));

vi.mock('../store/structureStore', () => ({
  useStructureStore: {
    getState: vi.fn(() => mocks.structureStore),
  },
}));

vi.mock('../rendering/MPRController', () => ({
  MPRController: {
    setActiveTool: mocks.setActiveToolSpy,
  },
}));

vi.mock('../debug/clientDebugLog', () => ({
  logClientDebug: mocks.logClientDebugSpy,
}));

import { installViewerShortcutHandler } from './viewerShortcuts';

describe('installViewerShortcutHandler', () => {
  beforeEach(() => {
    mocks.volumeStore.activeSeriesUID = null;
    mocks.structureStore.structureSets = [];
    mocks.structureStore.activeStructureSetId = null;
    mocks.structureStore.activeStructureId = null;
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('blocks contour tool shortcuts when no drawable structure is selected', () => {
    const cleanup = installViewerShortcutHandler();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }));

    expect(mocks.uiStore.setActiveTool).not.toHaveBeenCalled();
    expect(mocks.uiStore.setRightSidebarOpen).toHaveBeenCalledWith(true);
    expect(mocks.uiStore.setActiveViewport).toHaveBeenCalledWith('AXIAL');
    expect(mocks.setActiveToolSpy).not.toHaveBeenCalled();
    expect(mocks.logClientDebugSpy).toHaveBeenCalledWith(
      'ViewerShortcut',
      expect.stringContaining('freehand:blocked')
    );

    cleanup();
  });

  it('activates contour tool shortcuts when a drawable structure is selected', () => {
    mocks.volumeStore.activeSeriesUID = 'series-1';
    mocks.structureStore.structureSets = [
      {
        id: 'ss-1',
        referencedSeriesUID: 'series-1',
        structures: [{ id: 'structure-1', isLocked: false }],
      },
    ];
    mocks.structureStore.activeStructureSetId = 'ss-1';
    mocks.structureStore.activeStructureId = 'structure-1';

    const cleanup = installViewerShortcutHandler();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }));

    expect(mocks.uiStore.setActiveViewport).toHaveBeenCalledWith('AXIAL');
    expect(mocks.uiStore.setActiveTool).toHaveBeenCalledWith('freehand');
    expect(mocks.uiStore.setActiveTool).toHaveBeenCalledWith('edit');
    expect(mocks.uiStore.setActiveTool).toHaveBeenCalledWith('polygon');
    expect(mocks.uiStore.setActiveTool).toHaveBeenCalledWith('brush');
    expect(mocks.uiStore.setActiveTool).toHaveBeenCalledWith('eraser');
    expect(mocks.setActiveToolSpy).not.toHaveBeenCalled();

    cleanup();
  });

  it('activates matching Cornerstone tools for view shortcuts', async () => {
    const cleanup = installViewerShortcutHandler();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'p' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 's' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));

    await vi.waitFor(() => {
      expect(mocks.setActiveToolSpy).toHaveBeenCalledWith('Zoom');
      expect(mocks.setActiveToolSpy).toHaveBeenCalledWith('Pan');
      expect(mocks.setActiveToolSpy).toHaveBeenCalledWith('StackScroll');
      expect(mocks.setActiveToolSpy).toHaveBeenCalledWith('WindowLevel');
    });

    cleanup();
  });

  it('activates measurement shortcuts without Cornerstone tool binding', async () => {
    const cleanup = installViewerShortcutHandler();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'r' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'h' }));

    expect(mocks.uiStore.setActiveTool).toHaveBeenCalledWith('measureDistance');
    expect(mocks.uiStore.setActiveTool).toHaveBeenCalledWith('measureAngle');
    expect(mocks.uiStore.setActiveTool).toHaveBeenCalledWith('measureArea');
    expect(mocks.uiStore.setActiveTool).toHaveBeenCalledWith('huProbe');
    expect(mocks.setActiveToolSpy).not.toHaveBeenCalled();

    cleanup();
  });

  it('does not activate freehand from a selected structure set that belongs to another series', () => {
    mocks.volumeStore.activeSeriesUID = 'series-2';
    mocks.structureStore.structureSets = [
      {
        id: 'ss-1',
        referencedSeriesUID: 'series-1',
        structures: [{ id: 'structure-1', isLocked: false }],
      },
    ];
    mocks.structureStore.activeStructureSetId = 'ss-1';
    mocks.structureStore.activeStructureId = 'structure-1';

    const cleanup = installViewerShortcutHandler();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f' }));

    expect(mocks.uiStore.setActiveTool).not.toHaveBeenCalled();
    expect(mocks.uiStore.setRightSidebarOpen).toHaveBeenCalledWith(true);
    expect(mocks.uiStore.setActiveViewport).toHaveBeenCalledWith('AXIAL');

    cleanup();
  });
});
