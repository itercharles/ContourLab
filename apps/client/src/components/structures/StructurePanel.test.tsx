import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StructurePanel from './StructurePanel';
import { useStructureStore } from '../../core/store/structureStore';
import { useVolumeStore, type LoadedSeries } from '../../core/store/volumeStore';
import { useUIStore } from '../../core/store/uiStore';
import { resetQaRuleConfig } from '../../core/qa/qaRuleConfig';
import { UndoRedoManager } from '../../core/contouring/UndoRedoManager';
import type { StructureSet } from '@webtps/shared-types';

const mocks = vi.hoisted(() => ({
  loadStructureDraftForSeries: vi.fn(),
  saveStructureDraftForSeries: vi.fn(),
  scroll: vi.fn(),
  renderViewport: vi.fn(),
  getViewport: vi.fn(() => ({
    getCamera: () => ({ focalPoint: [0, 0, 10] as [number, number, number] }),
    scroll: vi.fn(),
    render: vi.fn(),
  })),
}));

vi.mock('../../core/structures/structureDraftStore', () => ({
  loadStructureDraftForSeries: mocks.loadStructureDraftForSeries,
  saveStructureDraftForSeries: mocks.saveStructureDraftForSeries,
}));

vi.mock('../../core/debug/clientDebugLog', () => ({
  logClientDebug: vi.fn(),
}));

vi.mock('../../core/rendering/ViewportManager', () => ({
  ViewportManager: {
    getRenderingEngine: vi.fn(() => ({
      getViewport: mocks.getViewport,
    })),
  },
}));

function makeLoadedSeries(): LoadedSeries {
  return {
    seriesUID: 'series-1',
    cornerstoneVolumeId: 'volume-1',
    volume: {
      seriesUID: 'series-1',
      dimensions: [1, 1, 1],
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
      directionCosines: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      pixelData: new Float32Array(0),
      windowCenter: 40,
      windowWidth: 400,
    },
    patient: {
      id: 'patient-1',
      mrn: '123',
      name: { given: 'Ada', family: 'Lovelace' },
      dateOfBirth: '1815-12-10',
      studies: [],
    },
    study: {
      studyInstanceUID: 'study-1',
      studyDate: '2026-04-11',
      series: [],
    },
    series: {
      seriesInstanceUID: 'series-1',
      seriesDescription: 'Thorax CT',
      modality: 'CT',
      instances: [],
    },
  };
}

function makeStructureSet(): StructureSet {
  return {
    id: 'ss-1',
    label: 'Test Set',
    referencedSeriesUID: 'series-1',
    version: 1,
    structures: [
      {
        id: 'structure-1',
        name: 'PTV',
        type: 'PTV',
        color: [0, 0, 255],
        contours: [],
        isVisible: true,
        isLocked: false,
        volume_cc: 1.2,
      },
    ],
  };
}

function makeOtherSeriesStructureSet(): StructureSet {
  return {
    id: 'ss-old',
    label: 'Old Study Set',
    referencedSeriesUID: 'series-old',
    version: 1,
    structures: [
      {
        id: 'old-ptv-1',
        name: 'ptv1',
        type: 'PTV',
        color: [255, 0, 0],
        contours: [],
        isVisible: true,
        isLocked: false,
        volume_cc: 2.1,
      },
      {
        id: 'old-ptv-2',
        name: 'ptv2',
        type: 'PTV',
        color: [255, 128, 0],
        contours: [],
        isVisible: true,
        isLocked: false,
        volume_cc: 3.2,
      },
      {
        id: 'old-oar-1',
        name: 'oar1',
        type: 'OAR',
        color: [0, 255, 0],
        contours: [],
        isVisible: true,
        isLocked: false,
        volume_cc: 4.3,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  UndoRedoManager.clear();
  resetQaRuleConfig();
  mocks.getViewport.mockReturnValue({
    getCamera: () => ({ focalPoint: [0, 0, 10] as [number, number, number] }),
    scroll: mocks.scroll,
    render: mocks.renderViewport,
  });
  mocks.loadStructureDraftForSeries.mockResolvedValue(null);
  mocks.saveStructureDraftForSeries.mockResolvedValue(undefined);
  useVolumeStore.setState({
    loadedSeries: [makeLoadedSeries()],
    activeSeriesUID: 'series-1',
    isLoading: false,
    loadError: null,
  });
  useUIStore.setState({
    activeTool: 'none',
    activeStructureOperationPanel: null,
    windowLevelPreset: 'softTissue',
    brushRadius: 10,
    rightSidebarOpen: true,
    leftSidebarOpen: false,
    crosshairsEnabled: true,
    activeViewport: null,
  });
  useStructureStore.setState({
    structureSets: [makeStructureSet()],
    activeStructureSetId: 'ss-1',
    activeStructureId: 'structure-1',
    dirtySeriesUIDs: [],
    repositoryDirtySeriesUIDs: [],
  });
});

describe('StructurePanel local draft and structure editing interactions', () => {
  it('auto-saves dirty structures to the local browser draft store @links:SRS-009', async () => {
    render(<StructurePanel />);

    await act(async () => {
      useStructureStore.getState().markSeriesDirty('series-1');
      await new Promise((resolve) => window.setTimeout(resolve, 700));
    });

    await waitFor(() => expect(mocks.saveStructureDraftForSeries).toHaveBeenCalledTimes(1));
    expect(mocks.saveStructureDraftForSeries).toHaveBeenCalledWith(
      'series-1',
      expect.any(Array),
      'ss-1',
      'structure-1'
    );
    expect(screen.queryByText('Local draft auto-saved in this browser.')).toBeNull();
  });

  it('renames a structure with inline editing on double-click', async () => {
    render(<StructurePanel />);

    fireEvent.doubleClick(screen.getByTitle('Double-click to rename'));
    const renameInput = screen
      .getAllByDisplayValue('PTV')
      .find((element) => element.tagName.toLowerCase() === 'input');
    expect(renameInput).toBeTruthy();

    fireEvent.change(renameInput!, {
      target: { value: 'CTV' },
    });
    fireEvent.keyDown(screen.getByDisplayValue('CTV'), { key: 'Enter' });

    await waitFor(() =>
      expect(
        useStructureStore
          .getState()
          .structureSets[0]
          .structures.some((structure) => structure.name === 'CTV')
      ).toBe(true)
    );
  });

  it('shows active structure details without a redundant structure-set header and edits its color @links:SRS-022', async () => {
    render(<StructurePanel />);

    expect(screen.queryByText('Structure Set')).toBeNull();
    expect(screen.getAllByText('PTV').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('Active structure color'), {
      target: { value: '#ff8800' },
    });

    await waitFor(() =>
      expect(useStructureStore.getState().structureSets[0].structures[0].color).toEqual([
        255,
        136,
        0,
      ])
    );
  });

  it('hides structure sets from non-active image series', () => {
    useStructureStore.setState({
      structureSets: [makeOtherSeriesStructureSet(), makeStructureSet()],
      activeStructureSetId: 'ss-1',
      activeStructureId: 'structure-1',
    });

    render(<StructurePanel />);

    expect(screen.queryByText('Test Set')).toBeNull();
    expect(screen.getAllByText('PTV').length).toBeGreaterThan(0);
    expect(screen.queryByText('Old Study Set')).toBeNull();
    expect(screen.queryByText('ptv1')).toBeNull();
    expect(screen.queryByText('ptv2')).toBeNull();
    expect(screen.queryByText('oar1')).toBeNull();
  });

  it('deactivates a stale structure set when the active image set changes', async () => {
    useVolumeStore.setState({
      loadedSeries: [makeLoadedSeries()],
      activeSeriesUID: 'series-1',
    });
    useStructureStore.setState({
      structureSets: [makeOtherSeriesStructureSet(), makeStructureSet()],
      activeStructureSetId: 'ss-old',
      activeStructureId: 'old-ptv-1',
    });

    render(<StructurePanel />);

    await waitFor(() => expect(useStructureStore.getState().activeStructureSetId).toBeNull());
    expect(useStructureStore.getState().activeStructureId).toBeNull();
    expect(screen.queryByLabelText('Active structure color')).toBeNull();
    expect(screen.getByText('No active structure set for this image set.')).toBeTruthy();
  });

  it('does not show a structure set header in the structure list', () => {
    render(<StructurePanel />);

    expect(screen.queryByRole('button', { name: 'Activate structure set Test Set' })).toBeNull();
    expect(screen.queryByText('Test Set')).toBeNull();
    expect(screen.queryByText('ACTIVE')).toBeNull();
  });

  it('adds new structures to the active image-set structure set', async () => {
    useStructureStore.setState({
      structureSets: [makeOtherSeriesStructureSet(), makeStructureSet()],
      activeStructureSetId: 'ss-1',
      activeStructureId: 'structure-1',
    });

    render(<StructurePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Add structure to Targets' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. PTV, Brainstem…'), {
      target: { value: 'Brainstem' },
    });
    fireEvent.click(screen.getByText('Add'));

    await waitFor(() =>
      expect(
        useStructureStore
          .getState()
          .structureSets
          .find((structureSet) => structureSet.id === 'ss-1')
          ?.structures
          .some((structure) => structure.name === 'Brainstem' && structure.type === 'PTV')
      ).toBe(true)
    );
    expect(
      useStructureStore
        .getState()
        .structureSets
        .find((structureSet) => structureSet.id === 'ss-old')
        ?.structures
        .some((structure) => structure.name === 'Brainstem')
    ).toBe(false);
  });

  it('adds structures with the type implied by the selected category', async () => {
    render(<StructurePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Add structure to Organs at Risk' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. PTV, Brainstem…'), {
      target: { value: 'Lung_L' },
    });
    fireEvent.click(screen.getByText('Add'));

    await waitFor(() =>
      expect(
        useStructureStore
          .getState()
          .structureSets[0]
          .structures
          .some((structure) => structure.name === 'Lung_L' && structure.type === 'OAR')
      ).toBe(true)
    );
  });

  it('does not repeat editability and sync state in the active structure footer', () => {
    const structureSet = makeStructureSet();
    structureSet.structures[0].isLocked = true;
    useStructureStore.setState({
      structureSets: [structureSet],
      activeStructureSetId: structureSet.id,
      activeStructureId: structureSet.structures[0].id,
      repositoryDirtySeriesUIDs: ['series-1'],
    });

    render(<StructurePanel />);

    expect(screen.queryByText('Locked')).toBeNull();
    expect(screen.queryByText('Unsynced')).toBeNull();
    expect(screen.getByRole('button', { name: 'Unlock PTV' })).toBeTruthy();
  });

  it('shows row lock controls and toggles structure locking inline', async () => {
    render(<StructurePanel />);

    expect(screen.getByRole('button', { name: 'Lock PTV' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Lock PTV' }));

    await waitFor(() =>
      expect(useStructureStore.getState().structureSets[0].structures[0].isLocked).toBe(true)
    );
    expect(screen.getByRole('button', { name: 'Unlock PTV' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Unlock PTV' }));
    await waitFor(() =>
      expect(useStructureStore.getState().structureSets[0].structures[0].isLocked).toBe(false)
    );
  });

  it('records structure row edits for toolbar undo and redo @links:SRS-007,SRS-023', async () => {
    render(<StructurePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Lock PTV' }));
    await waitFor(() =>
      expect(useStructureStore.getState().structureSets[0].structures[0].isLocked).toBe(true)
    );
    expect(UndoRedoManager.canUndo()).toBe(true);

    act(() => {
      UndoRedoManager.undo();
    });
    await waitFor(() =>
      expect(useStructureStore.getState().structureSets[0].structures[0].isLocked).toBe(false)
    );
    expect(UndoRedoManager.canRedo()).toBe(true);

    act(() => {
      UndoRedoManager.redo();
    });
    await waitFor(() =>
      expect(useStructureStore.getState().structureSets[0].structures[0].isLocked).toBe(true)
    );
  });

  it('shows contour review count in the compact active-structure summary @links:SRS-011', () => {
    const structureSet = makeStructureSet();
    structureSet.structures[0].contours = [
      {
        referencedSOPInstanceUID: 'sop-1',
        slicePosition: 10,
        points: new Float32Array([0, 0, 10, 1, 0, 10, 1, 1, 10]),
        isClosed: true,
      },
      {
        referencedSOPInstanceUID: 'sop-2',
        slicePosition: 20,
        points: new Float32Array([0, 0, 20, 1, 0, 20, 1, 1, 20]),
        isClosed: true,
      },
    ];
    useStructureStore.setState({
      structureSets: [structureSet],
      activeStructureSetId: structureSet.id,
      activeStructureId: structureSet.structures[0].id,
    });

    render(<StructurePanel />);

    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('sl')).toBeTruthy();
    expect(screen.queryByText('2 slices')).toBeNull();
  });

  it('shows contour QA warnings for the active structure @links:SRS-013', () => {
    const structureSet = makeStructureSet();
    structureSet.structures[0].contours = [
      {
        referencedSOPInstanceUID: 'sop-1',
        slicePosition: 0,
        points: new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0]),
        isClosed: true,
      },
      {
        referencedSOPInstanceUID: 'sop-2',
        slicePosition: 5,
        points: new Float32Array([0, 0, 5, 40, 0, 5, 40, 40, 5, 0, 40, 5]),
        isClosed: false,
      },
    ];
    useStructureStore.setState({
      structureSets: [structureSet],
      activeStructureSetId: structureSet.id,
      activeStructureId: structureSet.structures[0].id,
    });

    render(<StructurePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'QA' }));

    expect(screen.getByText('Contour QA')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Warnings' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'All' })).toBeTruthy();
    expect(screen.getByText('Open contour')).toBeTruthy();
    expect(screen.getAllByText('1 hit').length).toBeGreaterThan(0);
    expect(screen.getAllByText('pass').length).toBeGreaterThan(0);
    expect(screen.getByText('Slice gap')).toBeTruthy();
    expect(screen.getByText('Area jump')).toBeTruthy();
    expect(screen.queryByText('Open contour at z=5.0 mm.')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Open contour 1 hit' }));
    expect(screen.getByText('Open contour at z=5.0 mm.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Slice gap 1 hit' }));
    expect(screen.getByText('Gap from z=0.0 to 5.0 mm.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Area jump 1 hit' }));
    expect(screen.getByText('Area jump near z=5.0 mm.')).toBeTruthy();
  });

  it('navigates to a contour QA slice when an expanded issue is selected', async () => {
    const loadedSeries = makeLoadedSeries();
    loadedSeries.series.instances = [
      { sopInstanceUID: 'sop-0', instanceNumber: 1, sliceLocation: 0 },
      { sopInstanceUID: 'sop-10', instanceNumber: 2, sliceLocation: 10 },
      { sopInstanceUID: 'sop-20', instanceNumber: 3, sliceLocation: 20 },
    ];
    const structureSet = makeStructureSet();
    structureSet.structures[0].contours = [
      {
        referencedSOPInstanceUID: 'sop-0',
        slicePosition: 0,
        points: new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0]),
        isClosed: true,
      },
      {
        referencedSOPInstanceUID: 'sop-20',
        slicePosition: 20,
        points: new Float32Array([0, 0, 20, 40, 0, 20, 40, 40, 20, 0, 40, 20]),
        isClosed: true,
      },
    ];
    useVolumeStore.setState({
      loadedSeries: [loadedSeries],
      activeSeriesUID: loadedSeries.seriesUID,
    });
    useStructureStore.setState({
      structureSets: [structureSet],
      activeStructureSetId: structureSet.id,
      activeStructureId: structureSet.structures[0].id,
    });

    render(<StructurePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'QA' }));
    fireEvent.click(screen.getByRole('button', { name: 'Slice gap 1 hit' }));
    fireEvent.click(screen.getByRole('button', { name: /Slice gap Gap from z=0.0 to 20.0 mm./i }));

    await waitFor(() => expect(mocks.scroll).toHaveBeenCalledWith(1));
    expect(mocks.renderViewport).toHaveBeenCalled();
  });

  it('summarizes RTSS QA separately from contour geometry QA @links:SRS-024', () => {
    const loadedSeries = makeLoadedSeries();
    loadedSeries.series.instances = [
      { sopInstanceUID: 'sop-1', instanceNumber: 1, sliceLocation: 0 },
    ];
    const structureSet = makeStructureSet();
    structureSet.structures[0].contours = [
      {
        referencedSOPInstanceUID: 'sop-1',
        slicePosition: 0,
        points: new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0]),
        isClosed: true,
      },
      {
        referencedSOPInstanceUID: 'sop-2',
        slicePosition: 5,
        points: new Float32Array([0, 0, 5, 40, 0, 5, 40, 40, 5, 0, 40, 5]),
        isClosed: false,
      },
    ];
    structureSet.structures.push({
      id: 'structure-2',
      name: 'ptv',
      type: 'OAR',
      color: [0, 255, 0],
      contours: [],
      isVisible: true,
      isLocked: false,
      volume_cc: 0,
    });
    useVolumeStore.setState({
      loadedSeries: [loadedSeries],
      activeSeriesUID: loadedSeries.seriesUID,
    });
    useStructureStore.setState({
      structureSets: [structureSet],
      activeStructureSetId: structureSet.id,
      activeStructureId: structureSet.structures[0].id,
    });

    render(<StructurePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'QA' }));

    expect(screen.getByText('RTSS QA')).toBeTruthy();
    expect(screen.getAllByText(/warnings/).length).toBeGreaterThan(0);
    expect(screen.getByText('Duplicate ROI name')).toBeTruthy();
    expect(screen.getAllByText('1 hit').length).toBeGreaterThan(0);
    expect(screen.queryByText('Duplicate ROI name "PTV".')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate ROI name 1 hit' }));
    expect(screen.getByText('Duplicate ROI name "PTV".')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Empty ROI 1 hit' }));
    expect(screen.getByText('ptv: ROI has no contour sequence.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Foreign contour reference 1 hit' }));
    expect(screen.getByText('PTV: contour at z=5.0 mm references an image outside the active image set.')).toBeTruthy();
    expect(screen.queryByText('Open contour at z=5.0 mm.')).toBeNull();
  });

  it('activates a structure and jumps to the RTSS QA issue slice when a structure-set QA item is clicked', async () => {
    const loadedSeries = makeLoadedSeries();
    loadedSeries.series.instances = [
      { sopInstanceUID: 'sop-0', instanceNumber: 1, sliceLocation: 0 },
      { sopInstanceUID: 'sop-10', instanceNumber: 2, sliceLocation: 10 },
      { sopInstanceUID: 'sop-20', instanceNumber: 3, sliceLocation: 20 },
    ];
    const structureSet = makeStructureSet();
    structureSet.structures.push({
      id: 'structure-2',
      name: 'Cord',
      type: 'OAR',
      color: [0, 255, 0],
      contours: [
        {
          referencedSOPInstanceUID: 'sop-outside',
          slicePosition: 20,
          points: new Float32Array([0, 0, 20, 10, 0, 20, 10, 10, 20, 0, 10, 20]),
          isClosed: true,
        },
      ],
      isVisible: true,
      isLocked: false,
      volume_cc: 1,
    });
    useVolumeStore.setState({
      loadedSeries: [loadedSeries],
      activeSeriesUID: loadedSeries.seriesUID,
    });
    useStructureStore.setState({
      structureSets: [structureSet],
      activeStructureSetId: structureSet.id,
      activeStructureId: structureSet.structures[0].id,
    });

    render(<StructurePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'QA' }));
    fireEvent.click(screen.getByRole('button', { name: 'Foreign contour reference 1 hit' }));
    fireEvent.click(screen.getByRole('button', { name: /Cord.*references an image outside the active image set./ }));

    await waitFor(() => expect(useStructureStore.getState().activeStructureId).toBe('structure-2'));
    expect(mocks.scroll).toHaveBeenCalledWith(1);
    expect(mocks.renderViewport).toHaveBeenCalled();
  });

  it('does not show a current-slice marker in the structure list', () => {
    const loadedSeries = makeLoadedSeries();
    loadedSeries.series.instances = [
      { sopInstanceUID: 'sop-1', instanceNumber: 1, sliceLocation: 10 },
      { sopInstanceUID: 'sop-2', instanceNumber: 2, sliceLocation: 20 },
    ];
    const structureSet = makeStructureSet();
    structureSet.structures[0].contours = [
      {
        referencedSOPInstanceUID: 'sop-1',
        slicePosition: 10,
        points: new Float32Array([0, 0, 10, 1, 0, 10, 1, 1, 10]),
        isClosed: true,
      },
      {
        referencedSOPInstanceUID: 'sop-2',
        slicePosition: 20,
        points: new Float32Array([0, 0, 20, 1, 0, 20, 1, 1, 20]),
        isClosed: true,
      },
    ];
    useVolumeStore.setState({
      loadedSeries: [loadedSeries],
      activeSeriesUID: loadedSeries.seriesUID,
    });
    useStructureStore.setState({
      structureSets: [structureSet],
      activeStructureSetId: structureSet.id,
      activeStructureId: structureSet.structures[0].id,
    });

    render(<StructurePanel />);

    expect(screen.queryByTitle('Contour on current axial slice')).toBeNull();
  });

  it('shows compact structure list quality indicators', () => {
    const structureSet = makeStructureSet();
    structureSet.structures[0].type = 'OAR';
    structureSet.structures[0].isVisible = false;
    structureSet.structures[0].isLocked = true;
    structureSet.structures[0].volume_cc = 12.34;
    structureSet.structures[0].contours = [
      {
        referencedSOPInstanceUID: 'sop-1',
        slicePosition: 10,
        points: new Float32Array([0, 0, 10, 1, 0, 10, 1, 1, 10]),
        isClosed: true,
      },
    ];
    useStructureStore.setState({
      structureSets: [structureSet],
      activeStructureSetId: structureSet.id,
      activeStructureId: structureSet.structures[0].id,
    });

    render(<StructurePanel />);

    expect(screen.queryByText('Type · Vol · Slices')).toBeNull();
    expect(screen.getByRole('button', { name: 'Add structure to Organs at Risk' })).toBeTruthy();
    expect(screen.queryByTitle('Structure type: OAR')).toBeNull();
    expect(screen.getAllByText('12.3 cc').length).toBeGreaterThan(0);
    expect(screen.queryByText('Display')).toBeNull();
    expect(screen.queryByText('Hidden')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show PTV' })).toBeTruthy();
    expect(screen.queryByText('Locked')).toBeNull();
    expect(screen.getByRole('button', { name: 'Unlock PTV' })).toBeTruthy();
  });

  it('opens inline operation panels from the active structure detail section', () => {
    const loadedSeries = makeLoadedSeries();
    loadedSeries.volume.dimensions = [32, 32, 2];
    loadedSeries.volume.pixelData = new Float32Array(32 * 32 * 2);
    loadedSeries.series.instances = [
      { sopInstanceUID: 'sop-0', instanceNumber: 1, sliceLocation: 0 },
      { sopInstanceUID: 'sop-10', instanceNumber: 2, sliceLocation: 10 },
    ];
    useVolumeStore.setState({
      loadedSeries: [loadedSeries],
      activeSeriesUID: loadedSeries.seriesUID,
      isLoading: false,
      loadError: null,
    });

    const structureSet = makeStructureSet();
    structureSet.structures[0].contours = [
      {
        referencedSOPInstanceUID: 'sop-0',
        slicePosition: 0,
        points: new Float32Array([8, 8, 0, 16, 8, 0, 16, 16, 0, 8, 16, 0]),
        isClosed: true,
      },
    ];
    structureSet.structures.push({
      id: 'structure-2',
      name: 'Cord',
      type: 'OAR',
      color: [0, 255, 0],
      contours: [],
      isVisible: true,
      isLocked: false,
      volume_cc: 0.8,
    });
    useStructureStore.setState({
      structureSets: [structureSet],
      activeStructureSetId: structureSet.id,
      activeStructureId: structureSet.structures[0].id,
    });

    const { container } = render(<StructurePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Margin' }));
    expect(screen.getByText('Expand / contract')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Margin value'), { target: { value: '7' } });
    expect(screen.getByText('+7 mm')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(screen.getByText('Applied +7 mm margin.')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Interpolate' }));
    expect(screen.getByText('Fill missing slices')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Interpolation gap'), { target: { value: '4' } });
    expect(screen.getByText('4 sl')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByText('Fill missing slices')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Boolean' }));
    expect(screen.getByText('Combine with')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Boolean target structure'), {
      target: { value: 'structure-2' },
    });
    expect(container.textContent).toContain('PTV − Cord');
  });

  it('applies boolean subtract to the active structure @links:SRS-025', async () => {
    const loadedSeries = makeLoadedSeries();
    loadedSeries.volume.dimensions = [32, 32, 2];
    loadedSeries.volume.pixelData = new Float32Array(32 * 32 * 2);
    loadedSeries.series.instances = [
      { sopInstanceUID: 'sop-0', instanceNumber: 1, sliceLocation: 0 },
      { sopInstanceUID: 'sop-10', instanceNumber: 2, sliceLocation: 10 },
    ];
    useVolumeStore.setState({
      loadedSeries: [loadedSeries],
      activeSeriesUID: loadedSeries.seriesUID,
      isLoading: false,
      loadError: null,
    });

    const structureSet = makeStructureSet();
    structureSet.structures[0].contours = [
      {
        referencedSOPInstanceUID: 'sop-0',
        slicePosition: 0,
        points: new Float32Array([4, 4, 0, 20, 4, 0, 20, 20, 0, 4, 20, 0]),
        isClosed: true,
      },
    ];
    structureSet.structures.push({
      id: 'structure-2',
      name: 'Cord',
      type: 'OAR',
      color: [0, 255, 0],
      contours: [
        {
          referencedSOPInstanceUID: 'sop-0',
          slicePosition: 0,
          points: new Float32Array([10, 10, 0, 16, 10, 0, 16, 16, 0, 10, 16, 0]),
          isClosed: true,
        },
      ],
      isVisible: true,
      isLocked: false,
      volume_cc: 0.8,
    });
    useStructureStore.setState({
      structureSets: [structureSet],
      activeStructureSetId: structureSet.id,
      activeStructureId: structureSet.structures[0].id,
    });

    render(<StructurePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Boolean' }));
    fireEvent.change(screen.getByLabelText('Boolean target structure'), {
      target: { value: 'structure-2' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() =>
      expect(useStructureStore.getState().structureSets[0].structures[0].contours).toHaveLength(1)
    );
    expect(useStructureStore.getState().structureSets[0].structures[0].contours[0].points.length).toBeGreaterThan(0);
    expect(screen.getByText('Subtracted Cord.')).toBeTruthy();
  });

  it('interpolates missing contour slices for the active structure @links:SRS-014', async () => {
    const loadedSeries = makeLoadedSeries();
    loadedSeries.series.instances = [
      { sopInstanceUID: 'sop-0', instanceNumber: 1, sliceLocation: 0 },
      { sopInstanceUID: 'sop-10', instanceNumber: 2, sliceLocation: 10 },
      { sopInstanceUID: 'sop-20', instanceNumber: 3, sliceLocation: 20 },
      { sopInstanceUID: 'sop-30', instanceNumber: 4, sliceLocation: 30 },
    ];
    useVolumeStore.setState({
      loadedSeries: [loadedSeries],
      activeSeriesUID: loadedSeries.seriesUID,
      isLoading: false,
      loadError: null,
    });

    const structureSet = makeStructureSet();
    structureSet.structures[0].contours = [
      {
        referencedSOPInstanceUID: 'sop-0',
        slicePosition: 0,
        points: new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0, 0, 10, 0]),
        isClosed: true,
      },
      {
        referencedSOPInstanceUID: 'sop-30',
        slicePosition: 30,
        points: new Float32Array([0, 0, 30, 20, 0, 30, 20, 20, 30, 0, 20, 30]),
        isClosed: true,
      },
    ];
    useStructureStore.setState({
      structureSets: [structureSet],
      activeStructureSetId: structureSet.id,
      activeStructureId: structureSet.structures[0].id,
    });

    render(<StructurePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Interpolate' }));
    fireEvent.change(screen.getByLabelText('Interpolation gap'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() =>
      expect(
        useStructureStore.getState().structureSets[0].structures[0].contours.map((contour) => contour.slicePosition)
      ).toEqual([0, 10, 20, 30])
    );
    expect(screen.getByText('Interpolated 2 contour slices.')).toBeTruthy();
  });

  it('applies a positive margin to the active structure @links:SRS-026', async () => {
    const loadedSeries = makeLoadedSeries();
    loadedSeries.volume.dimensions = [32, 32, 2];
    loadedSeries.volume.pixelData = new Float32Array(32 * 32 * 2);
    loadedSeries.series.instances = [
      { sopInstanceUID: 'sop-0', instanceNumber: 1, sliceLocation: 0 },
      { sopInstanceUID: 'sop-10', instanceNumber: 2, sliceLocation: 10 },
    ];
    useVolumeStore.setState({
      loadedSeries: [loadedSeries],
      activeSeriesUID: loadedSeries.seriesUID,
      isLoading: false,
      loadError: null,
    });

    const structureSet = makeStructureSet();
    structureSet.structures[0].contours = [
      {
        referencedSOPInstanceUID: 'sop-0',
        slicePosition: 0,
        points: new Float32Array([8, 8, 0, 16, 8, 0, 16, 16, 0, 8, 16, 0]),
        isClosed: true,
      },
    ];
    useStructureStore.setState({
      structureSets: [structureSet],
      activeStructureSetId: structureSet.id,
      activeStructureId: structureSet.structures[0].id,
    });

    render(<StructurePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Margin' }));
    fireEvent.change(screen.getByLabelText('Margin value'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));

    await waitFor(() =>
      expect(useStructureStore.getState().structureSets[0].structures[0].contours).toHaveLength(1)
    );
    expect(useStructureStore.getState().structureSets[0].structures[0].contours[0].points.length).toBeGreaterThan(0);
    expect(screen.getByText('Applied +2 mm margin.')).toBeTruthy();
  });

  it('shows the active structure set source when it came from repository RTSTRUCT', () => {
    const structureSet = makeStructureSet();
    structureSet.source = {
      type: 'rtstruct',
      label: 'RTSTRUCT Thorax CT',
      sopInstanceUID: '1.2.3.4.5',
      studyInstanceUID: 'study-1',
      seriesInstanceUID: 'rtss-series-1',
      importedAt: '2026-04-12T07:00:00.000Z',
    };
    useStructureStore.setState({
      structureSets: [structureSet],
      activeStructureSetId: structureSet.id,
      activeStructureId: structureSet.structures[0].id,
      dirtySeriesUIDs: [],
      repositoryDirtySeriesUIDs: [],
    });

    render(<StructurePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'DICOM' }));

    expect(screen.getByText('RTSS')).toBeTruthy();
    expect(screen.getByText('RTSTRUCT Thorax CT')).toBeTruthy();
    expect(screen.getByText('…5')).toBeTruthy();
    expect(screen.getByText('Imported')).toBeTruthy();
  });

  it('edits the active structure type', async () => {
    render(<StructurePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit active structure type' }));
    fireEvent.change(screen.getByLabelText('Active structure type'), {
      target: { value: 'OAR' },
    });

    await waitFor(() =>
      expect(useStructureStore.getState().structureSets[0].structures[0].type).toBe('OAR')
    );
  });

  it('shows a validation message when adding a duplicate structure name', async () => {
    render(<StructurePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Add structure to Targets' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. PTV, Brainstem…'), {
      target: { value: 'ptv' },
    });
    fireEvent.click(screen.getByText('Add'));

    expect(await screen.findByText('Structure "ptv" already exists in this structure set.')).toBeTruthy();
  });
});
