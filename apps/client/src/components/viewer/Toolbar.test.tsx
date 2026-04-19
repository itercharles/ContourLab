import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Toolbar from './Toolbar';
import { UndoRedoManager } from '../../core/contouring/UndoRedoManager';
import { useStructureStore } from '../../core/store/structureStore';
import { useUIStore } from '../../core/store/uiStore';
import { useVolumeStore, type LoadedSeries } from '../../core/store/volumeStore';
import type { StructureSet } from '@webtps/shared-types';

const mocks = vi.hoisted(() => ({
  scroll: vi.fn(),
  renderViewport: vi.fn(),
  getViewport: vi.fn(() => ({
    getCamera: () => ({ focalPoint: [0, 0, 10] as [number, number, number] }),
    scroll: vi.fn(),
    render: vi.fn(),
  })),
  setActiveTool: vi.fn(),
  enableCrosshairs: vi.fn(),
  disableCrosshairs: vi.fn(),
  setWindowLevel: vi.fn(),
  exportRtstructObject: vi.fn(),
  uploadDicomBlobToRepository: vi.fn(),
}));

vi.mock('../../core/rendering/MPRController', () => ({
  VIEWPORT_IDS: {
    AXIAL: 'viewport-axial',
    SAGITTAL: 'viewport-sagittal',
    CORONAL: 'viewport-coronal',
  },
  MPRController: {
    setActiveTool: mocks.setActiveTool,
    enableCrosshairs: mocks.enableCrosshairs,
    disableCrosshairs: mocks.disableCrosshairs,
  },
}));

vi.mock('../../core/rendering/ViewportManager', () => ({
  ViewportManager: {
    getRenderingEngine: vi.fn(() => ({
      getViewport: mocks.getViewport,
    })),
    setWindowLevel: mocks.setWindowLevel,
  },
}));

vi.mock('../../core/debug/clientDebugLog', () => ({
  logClientDebug: vi.fn(),
}));

vi.mock('../../core/structures/rtstructExport', () => ({
  exportRtstructObject: mocks.exportRtstructObject,
}));

vi.mock('../../core/dicom/dicomWebClient', () => ({
  uploadDicomBlobToRepository: mocks.uploadDicomBlobToRepository,
}));

function makeLoadedSeries(): LoadedSeries {
  return {
    seriesUID: 'series-1',
    cornerstoneVolumeId: 'volume-1',
    volume: {
      seriesUID: 'series-1',
      dimensions: [1, 1, 2],
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
      instances: [
        { sopInstanceUID: 'sop-1', instanceNumber: 1, sliceLocation: 10 },
        { sopInstanceUID: 'sop-2', instanceNumber: 2, sliceLocation: 20 },
      ],
    },
  };
}

function makeStructureSet(isLocked = false): StructureSet {
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
        contours: [
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
        ],
        isVisible: true,
        isLocked,
        volume_cc: 1.2,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  UndoRedoManager.clear();
  mocks.getViewport.mockReturnValue({
    getCamera: () => ({ focalPoint: [0, 0, 10] as [number, number, number] }),
    scroll: mocks.scroll,
    render: mocks.renderViewport,
  });
  mocks.exportRtstructObject.mockResolvedValue({
    blob: new Blob(['dicom'], { type: 'application/dicom' }),
    identifiers: {
      studyInstanceUID: 'study-1',
      seriesInstanceUID: 'rtss-series-new',
      sopInstanceUID: 'rtss-sop-new',
      seriesDescription: 'RTSTRUCT Thorax CT Edited',
      seriesDate: '20260418',
      seriesTime: '071500',
      roiCount: 1,
    },
  });
  mocks.uploadDicomBlobToRepository.mockResolvedValue(undefined);
  useUIStore.setState({
    activeTool: 'windowLevel',
    windowLevelPreset: 'softTissue',
    brushRadius: 10,
    rightSidebarOpen: true,
    leftSidebarOpen: true,
    crosshairsEnabled: true,
    activeViewport: null,
  });
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

describe('Toolbar contour operations', () => {
  it('uses descriptive labels for window and crosshair controls', () => {
    render(<Toolbar />);

    expect(screen.getByRole('button', { name: /Window \/ Level \(W\)/ })).toBeTruthy();
    expect(screen.getByTitle('Window/Level Preset')).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: 'Show or hide crosshair reference lines on the MPR views',
      })
    ).toBeTruthy();
  });

  it('activates the matching Cornerstone tool for each view button', async () => {
    render(<Toolbar />);

    fireEvent.click(screen.getByRole('button', { name: /Zoom \(Z\)/ }));
    await waitFor(() => expect(mocks.setActiveTool).toHaveBeenCalledWith('Zoom'));

    fireEvent.click(screen.getByRole('button', { name: /Pan \(P\)/ }));
    await waitFor(() => expect(mocks.setActiveTool).toHaveBeenCalledWith('Pan'));

    fireEvent.click(screen.getByRole('button', { name: /Scroll \(S\)/ }));
    await waitFor(() => expect(mocks.setActiveTool).toHaveBeenCalledWith('StackScroll'));

    fireEvent.click(screen.getByRole('button', { name: /Window \/ Level \(W\)/ }));
    await waitFor(() => expect(mocks.setActiveTool).toHaveBeenCalledWith('WindowLevel'));
  });

  it('toggles the workspace navigator from the top operation bar', () => {
    render(<Toolbar />);

    expect(useUIStore.getState().leftSidebarOpen).toBe(true);
    fireEvent.click(screen.getByTitle('Toggle workspace navigator'));

    expect(useUIStore.getState().leftSidebarOpen).toBe(false);
  });

  it('pushes active structure changes from the top operation bar', async () => {
    useStructureStore.getState().markSeriesDirty('series-1');

    render(<Toolbar />);

    const pushButton = screen.getByRole('button', { name: 'Push Changes' }) as HTMLButtonElement;
    expect(pushButton.disabled).toBe(false);

    fireEvent.click(pushButton);

    await waitFor(() => expect(mocks.exportRtstructObject).toHaveBeenCalledTimes(1));
    expect(mocks.uploadDicomBlobToRepository).toHaveBeenCalledWith(expect.any(Blob));
    await waitFor(() => expect(useStructureStore.getState().structureSets[0].source).toEqual(
      expect.objectContaining({
        type: 'rtstruct',
        label: 'RTSTRUCT Thorax CT Edited',
        sopInstanceUID: 'rtss-sop-new',
        seriesInstanceUID: 'rtss-series-new',
      })
    ));
    expect(useStructureStore.getState().repositoryDirtySeriesUIDs).not.toContain('series-1');
  });

  it('deletes the active structure contour on the current axial slice from the top operation bar', async () => {
    render(<Toolbar />);

    const deleteButton = screen.getByRole('button', { name: 'Delete Slice' }) as HTMLButtonElement;
    expect(deleteButton.disabled).toBe(false);

    fireEvent.click(deleteButton);

    await waitFor(() =>
      expect(useStructureStore.getState().structureSets[0].structures[0].contours).toHaveLength(1)
    );
    expect(useStructureStore.getState().structureSets[0].structures[0].contours[0].slicePosition).toBe(20);
    expect(screen.getByRole('button', { name: 'Undo' }).getAttribute('title')).toContain(
      'Undo: Delete contour'
    );
  });

  it('adds an interpolated contour on an empty slice between adjacent contour slices', async () => {
    mocks.getViewport.mockReturnValue({
      getCamera: () => ({ focalPoint: [0, 0, 15] as [number, number, number] }),
      scroll: mocks.scroll,
      render: mocks.renderViewport,
    });
    const loaded = makeLoadedSeries();
    loaded.series.instances = [
      { sopInstanceUID: 'sop-1', instanceNumber: 1, sliceLocation: 10 },
      { sopInstanceUID: 'sop-mid', instanceNumber: 2, sliceLocation: 15 },
      { sopInstanceUID: 'sop-2', instanceNumber: 3, sliceLocation: 20 },
    ];
    useVolumeStore.setState({
      loadedSeries: [loaded],
      activeSeriesUID: 'series-1',
    });

    render(<Toolbar />);

    const interpolateButton = screen.getByRole('button', { name: 'Interp' }) as HTMLButtonElement;
    expect(interpolateButton.disabled).toBe(false);

    fireEvent.click(interpolateButton);

    await waitFor(() =>
      expect(useStructureStore.getState().structureSets[0].structures[0].contours).toHaveLength(3)
    );
    const interpolated = useStructureStore
      .getState()
      .structureSets[0]
      .structures[0]
      .contours.find((contour) => contour.slicePosition === 15);
    expect(interpolated?.referencedSOPInstanceUID).toBe('sop-mid');
  });

  it('navigates to adjacent contour slices from the top operation bar', () => {
    render(<Toolbar />);

    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(mocks.scroll).toHaveBeenCalledWith(1);
    expect(mocks.renderViewport).toHaveBeenCalled();

    mocks.scroll.mockClear();
    mocks.getViewport.mockReturnValue({
      getCamera: () => ({ focalPoint: [0, 0, 20] as [number, number, number] }),
      scroll: mocks.scroll,
      render: mocks.renderViewport,
    });
    fireEvent.click(screen.getByRole('button', { name: 'Prev' }));
    expect(mocks.scroll).toHaveBeenCalledWith(-1);
  });

  it('restores a deleted current-slice contour through the top operation bar undo control', async () => {
    render(<Toolbar />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete Slice' }));

    await waitFor(() =>
      expect(useStructureStore.getState().structureSets[0].structures[0].contours).toHaveLength(1)
    );

    const undoButton = screen.getByRole('button', { name: 'Undo' }) as HTMLButtonElement;
    expect(undoButton.disabled).toBe(false);

    fireEvent.click(undoButton);

    await waitFor(() =>
      expect(useStructureStore.getState().structureSets[0].structures[0].contours).toHaveLength(2)
    );
    expect(screen.getByRole('button', { name: 'Redo' }).getAttribute('title')).toContain(
      'Redo: Delete contour'
    );
  });

  it('disables current-slice contour deletion when the active structure is locked', () => {
    useStructureStore.setState({
      structureSets: [makeStructureSet(true)],
      activeStructureSetId: 'ss-1',
      activeStructureId: 'structure-1',
    });

    render(<Toolbar />);

    const deleteButton = screen.getByRole('button', { name: 'Delete Slice' }) as HTMLButtonElement;
    expect(deleteButton.disabled).toBe(true);
  });
});
