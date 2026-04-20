import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StructurePanel from './StructurePanel';
import { useStructureStore } from '../../core/store/structureStore';
import { useVolumeStore, type LoadedSeries } from '../../core/store/volumeStore';
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
  useStructureStore.setState({
    structureSets: [makeStructureSet()],
    activeStructureSetId: 'ss-1',
    activeStructureId: 'structure-1',
    dirtySeriesUIDs: [],
    repositoryDirtySeriesUIDs: [],
  });
});

describe('StructurePanel local draft and structure editing interactions', () => {
  it('auto-saves dirty structures to the local browser draft store', async () => {
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

  it('shows active structure details under the structure set and edits its color', async () => {
    render(<StructurePanel />);

    expect(screen.getByText('Structure Set')).toBeTruthy();
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

    expect(screen.getAllByText('Test Set').length).toBeGreaterThan(0);
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
    expect(screen.getAllByText('Test Set').length).toBeGreaterThan(0);
  });

  it('activates a visible structure set from its header after stale selection is cleared', async () => {
    useStructureStore.setState({
      structureSets: [makeOtherSeriesStructureSet(), makeStructureSet()],
      activeStructureSetId: 'ss-old',
      activeStructureId: 'old-ptv-1',
    });

    render(<StructurePanel />);

    await waitFor(() => expect(useStructureStore.getState().activeStructureSetId).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: 'Activate structure set Test Set' }));

    expect(useStructureStore.getState().activeStructureSetId).toBe('ss-1');
    expect(useStructureStore.getState().activeStructureId).toBe('structure-1');
    expect(screen.getByLabelText('Active structure color')).toBeTruthy();
    expect(screen.getByText('ACTIVE')).toBeTruthy();
  });

  it('adds new structures to the active image-set structure set', async () => {
    useStructureStore.setState({
      structureSets: [makeOtherSeriesStructureSet(), makeStructureSet()],
      activeStructureSetId: 'ss-1',
      activeStructureId: 'structure-1',
    });

    render(<StructurePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Add structure' }));
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
          .some((structure) => structure.name === 'Brainstem')
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

  it('shows active structure editability and repository sync state', () => {
    const structureSet = makeStructureSet();
    structureSet.structures[0].isLocked = true;
    useStructureStore.setState({
      structureSets: [structureSet],
      activeStructureSetId: structureSet.id,
      activeStructureId: structureSet.structures[0].id,
      repositoryDirtySeriesUIDs: ['series-1'],
    });

    render(<StructurePanel />);

    expect(screen.getAllByText('Locked').length).toBeGreaterThan(0);
    expect(screen.getByText('Unsynced')).toBeTruthy();
  });

  it('shows contour review count for the active structure', () => {
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

    expect(screen.getByText('2 slices')).toBeTruthy();
    expect(screen.queryByText('2 sl')).toBeNull();
  });

  it('shows contour QA warnings for the active structure', () => {
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
    expect(screen.getAllByText(/warnings/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Open contour at z=5.0 mm.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Gap from z=0.0 to 5.0 mm.').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Area jump near z=5.0 mm.').length).toBeGreaterThan(0);
  });

  it('summarizes RTSS QA separately from contour geometry QA', () => {
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
    expect(screen.getByText('Duplicate ROI name "PTV".')).toBeTruthy();
    expect(screen.getByText('ptv: ROI has no contour sequence.')).toBeTruthy();
    expect(screen.getByText('PTV: contour at z=5.0 mm references an image outside the active image set.')).toBeTruthy();
    expect(screen.getAllByText('Open contour at z=5.0 mm.')).toHaveLength(1);
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
    expect(screen.queryByText('2 sl')).toBeNull();
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
    expect(screen.getByRole('button', { name: 'Add structure' })).toBeTruthy();
    expect(screen.getAllByText('OAR').length).toBeGreaterThan(0);
    expect(screen.getAllByText('12.3 cc').length).toBeGreaterThan(0);
    expect(screen.queryByText('1 sl')).toBeNull();
    expect(screen.queryByText('Display')).toBeNull();
    expect(screen.queryByText('Hidden')).toBeNull();
    expect(screen.getByRole('button', { name: 'Show PTV' })).toBeTruthy();
    expect(screen.getByText('Locked')).toBeTruthy();
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

    fireEvent.change(screen.getByLabelText('Active structure type'), {
      target: { value: 'OAR' },
    });

    await waitFor(() =>
      expect(useStructureStore.getState().structureSets[0].structures[0].type).toBe('OAR')
    );
  });

  it('shows a validation message when adding a duplicate structure name', async () => {
    render(<StructurePanel />);

    fireEvent.click(screen.getByRole('button', { name: 'Add structure' }));
    fireEvent.change(screen.getByPlaceholderText('e.g. PTV, Brainstem…'), {
      target: { value: 'ptv' },
    });
    fireEvent.click(screen.getByText('Add'));

    expect(await screen.findByText('Structure "ptv" already exists in this structure set.')).toBeTruthy();
  });
});
