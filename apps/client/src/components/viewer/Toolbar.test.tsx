import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Toolbar from './Toolbar';
import ToolRail from './ToolRail';
import { UndoRedoManager } from '../../core/contouring/UndoRedoManager';
import { addUserActivity, useActivityStore } from '../../core/store/activityStore';
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
  clearPrimaryTool: vi.fn(),
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
    clearPrimaryTool: mocks.clearPrimaryTool,
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

function renderToolbar() {
  return render(
    <MemoryRouter>
      <Toolbar />
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  UndoRedoManager.clear();
  useActivityStore.getState().clearActivities();
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
    activeStructureOperationPanel: null,
    windowLevelPreset: 'softTissue',
    brushRadius: 10,
    rightSidebarOpen: true,
    leftSidebarOpen: false,
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
  it('keeps image and edit tools out of the top bar', () => {
    renderToolbar();

    expect(screen.getByText('WebTPS')).toBeTruthy();
    expect(screen.getByRole('button', { name: '01 Contour' })).toBeTruthy();
    expect((screen.getByRole('button', { name: /02 Review soon/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: /03 Plan soon/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByTitle('Window/Level Preset')).toBeNull();
    expect(screen.queryByRole('button', { name: /Window \/ Level/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Crosshair/ })).toBeNull();
    expect(screen.queryByText('New contour')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete Slice' })).toBeNull();
  });

  it('activates the matching Cornerstone tool from the tool rail', async () => {
    render(<ToolRail />);

    fireEvent.click(screen.getByRole('button', { name: /Zoom \(Z\)/ }));
    await waitFor(() => expect(mocks.setActiveTool).toHaveBeenCalledWith('Zoom'));

    fireEvent.click(screen.getByRole('button', { name: /Pan \(P\)/ }));
    await waitFor(() => expect(mocks.setActiveTool).toHaveBeenCalledWith('Pan'));

    fireEvent.click(screen.getByRole('button', { name: /Scroll \(S\)/ }));
    await waitFor(() => expect(mocks.setActiveTool).toHaveBeenCalledWith('StackScroll'));

    fireEvent.click(screen.getByRole('button', { name: /Window \/ Level \(W\)/ }));
    await waitFor(() => expect(mocks.setActiveTool).toHaveBeenCalledWith('WindowLevel'));

    fireEvent.click(screen.getByRole('button', { name: /Crosshairs \(C\)/ }));
    expect(useUIStore.getState().crosshairsEnabled).toBe(false);
    await waitFor(() => expect(mocks.disableCrosshairs).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole('button', { name: /Edit contour \(D\)/ }));
    expect(useUIStore.getState().activeTool).toBe('edit');
  });

  it('deactivates the active image tool when clicked again', async () => {
    render(<ToolRail />);

    const windowLevelButton = screen.getByRole('button', { name: /Window \/ Level \(W\)/ });

    fireEvent.click(windowLevelButton);

    await waitFor(() => expect(mocks.clearPrimaryTool).toHaveBeenCalledTimes(1));
    expect(useUIStore.getState().activeTool).toBe('none');
    expect(windowLevelButton.getAttribute('data-active')).toBe('false');
  });

  it('shows and activates measurement tools from the tool rail without Cornerstone binding', () => {
    render(<ToolRail />);

    fireEvent.click(screen.getByRole('button', { name: /Distance \(M\)/ }));
    expect(useUIStore.getState().activeTool).toBe('measureDistance');

    fireEvent.click(screen.getByRole('button', { name: /Angle \(A\)/ }));
    expect(useUIStore.getState().activeTool).toBe('measureAngle');

    fireEvent.click(screen.getByRole('button', { name: /Area \(R\)/ }));
    expect(useUIStore.getState().activeTool).toBe('measureArea');

    fireEvent.click(screen.getByRole('button', { name: /HU Probe \(H\)/ }));
    expect(useUIStore.getState().activeTool).toBe('huProbe');
    expect(mocks.setActiveTool).not.toHaveBeenCalledWith('measureDistance');
  });

  it('opens structure operation panels from the tool rail and keeps only roadmap stubs disabled', () => {
    render(<ToolRail />);

    fireEvent.click(screen.getByRole('button', { name: /Interpolate slices \(I\)/ }));
    expect(useUIStore.getState().activeStructureOperationPanel).toBe('interpolate');

    fireEvent.click(screen.getByRole('button', { name: /Margin \(G\)/ }));
    expect(useUIStore.getState().activeStructureOperationPanel).toBe('margin');

    fireEvent.click(screen.getByRole('button', { name: /Boolean ops \(O\)/ }));
    expect(useUIStore.getState().activeStructureOperationPanel).toBe('boolean');

    const disabledLabels = screen.getAllByRole('button')
      .filter((btn) => (btn as HTMLButtonElement).disabled)
      .map((btn) => btn.getAttribute('aria-label'));
    expect(disabledLabels).toEqual(expect.arrayContaining([
      'Select (V)',
    ]));
    expect(disabledLabels).not.toContain('Help');
  });

  it('keeps patient selection out of the global title bar', () => {
    renderToolbar();

    expect(screen.queryByRole('button', { name: 'Select patient' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeTruthy();
  });

  it('opens the activity inbox from the global title bar', () => {
    addUserActivity({
      title: 'Assigned task',
      message: 'Review contour changes for Ada Lovelace.',
      detail: 'PTV review',
      tone: 'info',
    });

    renderToolbar();

    fireEvent.click(screen.getByRole('button', { name: 'Inbox' }));

    expect(screen.getByRole('heading', { name: 'Activity' })).toBeTruthy();
    expect(screen.getByText('Assigned task')).toBeTruthy();
    expect(screen.getByText('Review contour changes for Ada Lovelace.')).toBeTruthy();
    expect(screen.getByText('PTV review')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Inbox' }).getAttribute('title')).toBe('Inbox · 0 unread');
  });

  it('opens the prototype issue-driven AI coding notice from the top bar CTA', () => {
    renderToolbar();

    fireEvent.click(screen.getByRole('button', { name: 'Click Me' }));

    expect(screen.getByRole('dialog', { name: 'Issue-driven AI coding prototype' })).toBeTruthy();
    expect(screen.getByText(/does not contain any Elekta product code/i)).toBeTruthy();
    expect(screen.getByText(/CI\/CD workflows, and compliance documentation were written by AI/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'github.com/itercharles/WebTPS' }).getAttribute('href')).toBe(
      'https://github.com/itercharles/WebTPS'
    );
    expect(screen.getByText(/Open a GitHub issue/i)).toBeTruthy();
    expect(screen.getByText(/CR \+ Plan Spec generated/i)).toBeTruthy();
    expect(screen.getByText(/send your GitHub username to/i)).toBeTruthy();
    expect(screen.getByText(/How to get access/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /Open a WebTPS issue/i }).getAttribute('href')).toBe(
      'https://github.com/itercharles/WebTPS/issues/new'
    );
  });

  it('saves active structure changes from the global title bar @links:SRS-018', async () => {
    useStructureStore.getState().markSeriesDirty('series-1');

    renderToolbar();

    const saveButton = screen.getByRole('button', { name: 'Save changes' }) as HTMLButtonElement;
    expect(saveButton.disabled).toBe(false);

    fireEvent.click(saveButton);

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

});
