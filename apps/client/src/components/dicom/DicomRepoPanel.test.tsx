import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DicomRepoPanel from './DicomRepoPanel';
import { useVolumeStore, type LoadedSeries } from '../../core/store/volumeStore';
import { useStructureStore } from '../../core/store/structureStore';
import type { StructureSet } from '@contourlab/shared-types';

const mocks = vi.hoisted(() => ({
  queryDicomWebSeries: vi.fn(),
  getOrthancUiUrl: vi.fn(() => 'http://localhost:8042/ui/app/index.html'),
  loadSeriesFromDicomWeb: vi.fn(),
  uploadDicomBlobToRepository: vi.fn(),
  queryRtstructInstancesForStudy: vi.fn(),
  retrieveDicomWebInstance: vi.fn(),
  exportRtstructObject: vi.fn(),
  importRtstructArrayBuffer: vi.fn(),
  scroll: vi.fn(),
  renderViewport: vi.fn(),
  getViewport: vi.fn(() => ({
    getCamera: () => ({ focalPoint: [0, 0, 0] as [number, number, number] }),
    scroll: vi.fn(),
    render: vi.fn(),
  })),
}));

vi.mock('../../core/dicom/dicomWebClient', () => ({
  queryDicomWebSeries: mocks.queryDicomWebSeries,
  getOrthancUiUrl: mocks.getOrthancUiUrl,
  loadSeriesFromDicomWeb: mocks.loadSeriesFromDicomWeb,
  uploadDicomBlobToRepository: mocks.uploadDicomBlobToRepository,
  queryRtstructInstancesForStudy: mocks.queryRtstructInstancesForStudy,
  retrieveDicomWebInstance: mocks.retrieveDicomWebInstance,
}));

vi.mock('../../core/structures/rtstructExport', () => ({
  exportRtstructObject: mocks.exportRtstructObject,
}));

vi.mock('../../core/structures/rtstructImport', () => ({
  importRtstructArrayBuffer: mocks.importRtstructArrayBuffer,
}));

vi.mock('../../core/debug/clientDebugLog', () => ({
  logClientDebug: vi.fn(),
}));

vi.mock('../../core/rendering/MPRController', () => ({
  VIEWPORT_IDS: {
    AXIAL: 'viewport-axial',
    SAGITTAL: 'viewport-sagittal',
    CORONAL: 'viewport-coronal',
  },
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
      mrn: 'MRN-1',
      name: { given: 'Jane', family: 'Doe' },
      dateOfBirth: '',
      studies: [],
    },
    study: {
      studyInstanceUID: 'study-1',
      studyDate: '20260411',
      studyDescription: 'Chest CT',
      series: [],
    },
    series: {
      seriesInstanceUID: 'series-1',
      seriesDescription: 'Axial',
      modality: 'CT',
      instances: [
        { sopInstanceUID: 'sop-0', instanceNumber: 1, sliceLocation: 0 },
        { sopInstanceUID: 'sop-10', instanceNumber: 2, sliceLocation: 10 },
      ],
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
        contours: [{
          referencedSOPInstanceUID: 'sop-10',
          slicePosition: 10,
          points: new Float32Array([0, 0, 10, 10, 0, 10, 10, 10, 10, 0, 10, 10]),
          isClosed: true,
        }],
        isVisible: true,
        isLocked: false,
        volume_cc: 1.2,
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getViewport.mockReturnValue({
    getCamera: () => ({ focalPoint: [0, 0, 0] as [number, number, number] }),
    scroll: mocks.scroll,
    render: mocks.renderViewport,
  });
  mocks.queryDicomWebSeries.mockResolvedValue([
    {
      studyInstanceUID: 'study-1',
      seriesInstanceUID: 'series-1',
      patientName: 'DOE^JANE',
      patientId: 'MRN-1',
      studyDate: '20260411',
      studyDescription: 'Chest CT',
      seriesDescription: 'Axial',
      modality: 'CT',
      instanceCount: 128,
    },
  ]);
  mocks.getOrthancUiUrl.mockReturnValue('http://localhost:8042/ui/app/index.html');
  mocks.loadSeriesFromDicomWeb.mockResolvedValue(makeLoadedSeries());
  mocks.uploadDicomBlobToRepository.mockResolvedValue(undefined);
  mocks.queryRtstructInstancesForStudy.mockResolvedValue([]);
  mocks.retrieveDicomWebInstance.mockResolvedValue(new ArrayBuffer(0));
  mocks.exportRtstructObject.mockResolvedValue({
    blob: new Blob(['dicom'], { type: 'application/dicom' }),
    identifiers: {
      studyInstanceUID: 'study-1',
      seriesInstanceUID: 'new-rtss-series',
        sopInstanceUID: 'new-rtss-sop',
        seriesDescription: 'RTSTRUCT Axial',
        seriesDate: '20260412',
        seriesTime: '101112',
        roiCount: 1,
      },
    });
  mocks.importRtstructArrayBuffer.mockResolvedValue(makeStructureSet());

  useVolumeStore.setState({
    loadedSeries: [],
    activeSeriesUID: null,
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

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DicomRepoPanel', () => {
  it('queries repository series on mount', async () => {
    render(<DicomRepoPanel />);

    await waitFor(() => expect(mocks.queryDicomWebSeries).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Image Sets')).toBeTruthy();
    expect(screen.getByText('Chest CT')).toBeTruthy();
    expect(screen.getByText('Axial')).toBeTruthy();
    expect(screen.queryByText('Structure Sets / RTSS')).toBeNull();
  });

  it('refreshes the repository when the parent requests it', async () => {
    const { rerender } = render(<DicomRepoPanel refreshRequestToken={0} />);

    await waitFor(() => expect(mocks.queryDicomWebSeries).toHaveBeenCalledTimes(1));
    rerender(<DicomRepoPanel refreshRequestToken={1} />);

    await waitFor(() => expect(mocks.queryDicomWebSeries).toHaveBeenCalledTimes(2));
  });

  it('loads the newest image set after patient selection when multiple patients exist', async () => {
    const smithLoadedSeries = {
      ...makeLoadedSeries(),
      seriesUID: 'series-2',
      cornerstoneVolumeId: 'volume-2',
      volume: {
        ...makeLoadedSeries().volume,
        seriesUID: 'series-2',
      },
      patient: {
        ...makeLoadedSeries().patient,
        id: 'MRN-2',
        mrn: 'MRN-2',
        name: { given: 'JOHN', family: 'SMITH' },
      },
      study: {
        ...makeLoadedSeries().study,
        studyInstanceUID: 'study-2',
        studyDate: '20260412',
        studyDescription: 'Simulation CT',
      },
      series: {
        ...makeLoadedSeries().series,
        seriesInstanceUID: 'series-2',
        seriesDescription: 'CT SIM',
      },
    };
    mocks.queryDicomWebSeries.mockResolvedValue([
      {
        studyInstanceUID: 'study-1',
        seriesInstanceUID: 'series-1',
        patientName: 'DOE^JANE',
        patientId: 'MRN-1',
        studyDate: '20260411',
        studyDescription: 'Chest CT',
        seriesDescription: 'Axial',
        modality: 'CT',
        instanceCount: 128,
      },
      {
        studyInstanceUID: 'study-2',
        seriesInstanceUID: 'series-2',
        patientName: 'SMITH^JOHN',
        patientId: 'MRN-2',
        studyDate: '20260412',
        studyDescription: 'Simulation CT',
        seriesDescription: 'CT SIM',
        modality: 'CT',
        instanceCount: 96,
      },
    ]);
    mocks.loadSeriesFromDicomWeb.mockResolvedValue(smithLoadedSeries);

    render(<DicomRepoPanel />);

    await screen.findByText('Select a patient to begin.');
    expect(screen.queryByText('Axial')).toBeNull();

    fireEvent.click(screen.getByText('Select Patient'));
    fireEvent.change(screen.getByPlaceholderText('Search patient, MRN, study, series…'), {
      target: { value: 'smith' },
    });
    fireEvent.click(screen.getByText('JOHN SMITH'));

    await waitFor(() => expect(mocks.queryRtstructInstancesForStudy).toHaveBeenCalledWith('study-2'));
    await waitFor(() => expect(mocks.loadSeriesFromDicomWeb).toHaveBeenCalledWith(expect.objectContaining({
      seriesInstanceUID: 'series-2',
    })));
    expect(useVolumeStore.getState().activeSeriesUID).toBe('series-2');
    expect(screen.queryByText('Select Patient')).toBeNull();
    expect(screen.getByText('Simulation CT')).toBeTruthy();
    expect(screen.getByText('CT SIM')).toBeTruthy();
    expect(screen.queryByText('Axial')).toBeNull();
  });

  it('loads the latest matching RTSTRUCT when a patient is selected @links:SRS-019', async () => {
    const imported = makeStructureSet();
    imported.id = 'ss-auto';
    imported.structures[0].id = 'structure-auto';
    const dicomBuffer = new ArrayBuffer(16);
    mocks.queryRtstructInstancesForStudy.mockResolvedValue([
      {
        studyInstanceUID: 'study-1',
        seriesInstanceUID: 'rtss-old-series',
        sopInstanceUID: 'rtss-old',
        seriesDescription: 'RTSTRUCT Old',
        seriesDate: '20260410',
        seriesTime: '090000',
        roiCount: 1,
        referencedSeriesInstanceUIDs: ['series-1'],
      },
      {
        studyInstanceUID: 'study-1',
        seriesInstanceUID: 'rtss-new-series',
        sopInstanceUID: 'rtss-new',
        seriesDescription: 'RTSTRUCT Latest',
        seriesDate: '20260412',
        seriesTime: '120000',
        roiCount: 2,
        referencedSeriesInstanceUIDs: ['series-1'],
      },
    ]);
    mocks.retrieveDicomWebInstance.mockResolvedValue(dicomBuffer);
    mocks.importRtstructArrayBuffer.mockResolvedValue(imported);

    render(<DicomRepoPanel />);

    await screen.findByText('Image Sets');
    act(() => {
      window.dispatchEvent(new CustomEvent('contourlab:open-patient-selector'));
    });

    fireEvent.click(await screen.findByText('JANE DOE'));

    await waitFor(() => expect(mocks.retrieveDicomWebInstance).toHaveBeenCalledWith(expect.objectContaining({
      sopInstanceUID: 'rtss-new',
    })));
    expect(mocks.importRtstructArrayBuffer).toHaveBeenCalledWith(dicomBuffer, 'series-1', expect.any(Number));
    expect(useVolumeStore.getState().activeSeriesUID).toBe('series-1');
    expect(useStructureStore.getState().activeStructureSetId).toBe('ss-auto');
  });

  it('opens patient selection from the patient context command', async () => {
    render(<DicomRepoPanel />);

    await screen.findByText('Image Sets');
    act(() => {
      window.dispatchEvent(new CustomEvent('contourlab:open-patient-selector'));
    });

    expect(await screen.findByText('Patient browser')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search patient, MRN, study, series…')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /All/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /New/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /In progress/ })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Awaiting review/ })).toBeTruthy();
    expect(screen.getByText('Treatment site')).toBeTruthy();
    expect(screen.getByText('Status')).toBeTruthy();
    expect(screen.getByText('Assignee')).toBeTruthy();
    expect(screen.getByText('Last activity')).toBeTruthy();
  });

  it('opens the Orthanc UI in a new tab when Import DICOM is clicked', async () => {
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    mocks.getOrthancUiUrl.mockReturnValue('http://10.140.115.109:8042/ui/app/index.html');

    render(<DicomRepoPanel />);
    await screen.findByText('Image Sets');
    act(() => {
      window.dispatchEvent(new CustomEvent('contourlab:open-patient-selector'));
    });
    await screen.findByText('Patient browser');

    fireEvent.click(screen.getByRole('button', { name: /Import DICOM/i }));

    expect(openSpy).toHaveBeenCalledWith(
      'http://10.140.115.109:8042/ui/app/index.html',
      '_blank',
      'noopener,noreferrer',
    );

    openSpy.mockRestore();
  });

  it('refreshes the worklist when the window regains focus', async () => {
    render(<DicomRepoPanel />);
    await screen.findByText('Image Sets');

    const callsBeforeFocus = mocks.queryDicomWebSeries.mock.calls.length;

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });

    await waitFor(() => {
      expect(mocks.queryDicomWebSeries.mock.calls.length).toBeGreaterThan(callsBeforeFocus);
    });
  });

  it('closes the patient browser with the close command and Escape', async () => {
    render(<DicomRepoPanel />);

    await screen.findByText('Image Sets');
    act(() => {
      window.dispatchEvent(new CustomEvent('contourlab:open-patient-selector'));
    });

    expect(await screen.findByText('Patient browser')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Close patient browser' }));
    expect(screen.queryByText('Patient browser')).toBeNull();

    act(() => {
      window.dispatchEvent(new CustomEvent('contourlab:open-patient-selector'));
    });
    expect(await screen.findByText('Patient browser')).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByText('Patient browser')).toBeNull();
  });

  it('loads a series into the volume store when clicked', async () => {
    mocks.loadSeriesFromDicomWeb.mockResolvedValue(makeLoadedSeries());

    render(<DicomRepoPanel />);

    await screen.findByText('Axial');
    fireEvent.click(screen.getByRole('button', { name: /Load image set Axial/i }));

    await waitFor(() => expect(mocks.loadSeriesFromDicomWeb).toHaveBeenCalledTimes(1));
    expect(useVolumeStore.getState().activeSeriesUID).toBe('series-1');
    expect(screen.getAllByText('ACTIVE').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Structure Sets / RTSS')).toBeTruthy();
  });

  it('shows RTSTRUCT rows only under the referenced image set when a study has multiple image sets', async () => {
    mocks.queryDicomWebSeries.mockResolvedValue([
      {
        studyInstanceUID: 'study-1',
        seriesInstanceUID: 'series-1',
        patientName: 'DOE^JANE',
        patientId: 'MRN-1',
        studyDate: '20260411',
        studyDescription: 'Chest CT',
        seriesDescription: 'Axial',
        modality: 'CT',
        instanceCount: 128,
      },
      {
        studyInstanceUID: 'study-1',
        seriesInstanceUID: 'series-2',
        patientName: 'DOE^JANE',
        patientId: 'MRN-1',
        studyDate: '20260411',
        studyDescription: 'Chest CT',
        seriesDescription: 'Boost CT',
        modality: 'CT',
        instanceCount: 72,
      },
    ]);
    mocks.queryRtstructInstancesForStudy.mockResolvedValue([
      {
        studyInstanceUID: 'study-1',
        seriesInstanceUID: 'rtss-series-1',
        sopInstanceUID: 'rtss-1',
        seriesDescription: 'RTSTRUCT Axial',
        seriesDate: '20260412',
        seriesTime: '090000',
        roiCount: 2,
        referencedSeriesInstanceUIDs: ['series-1'],
      },
      {
        studyInstanceUID: 'study-1',
        seriesInstanceUID: 'rtss-series-2',
        sopInstanceUID: 'rtss-2',
        seriesDescription: 'RTSTRUCT Boost',
        seriesDate: '20260412',
        seriesTime: '100000',
        roiCount: 1,
        referencedSeriesInstanceUIDs: ['series-2'],
      },
    ]);

    render(<DicomRepoPanel />);

    await waitFor(() => expect(mocks.queryRtstructInstancesForStudy).toHaveBeenCalledWith('study-1'));

    fireEvent.click(screen.getByRole('button', { name: /Show structure sets for Axial/i }));
    expect(await screen.findByText('RTSTRUCT Axial')).toBeTruthy();
    expect(screen.queryByText('RTSTRUCT Boost')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Show structure sets for Boost CT/i }));
    expect(await screen.findByText('RTSTRUCT Boost')).toBeTruthy();
  });

  it('keeps the active image set when unsynced changes are not confirmed', async () => {
    mocks.queryDicomWebSeries.mockResolvedValue([
      {
        studyInstanceUID: 'study-1',
        seriesInstanceUID: 'series-1',
        patientName: 'DOE^JANE',
        patientId: 'MRN-1',
        studyDate: '20260411',
        studyDescription: 'Chest CT',
        seriesDescription: 'Axial',
        modality: 'CT',
        instanceCount: 128,
      },
      {
        studyInstanceUID: 'study-1',
        seriesInstanceUID: 'series-2',
        patientName: 'DOE^JANE',
        patientId: 'MRN-1',
        studyDate: '20260411',
        studyDescription: 'Chest CT',
        seriesDescription: 'Boost CT',
        modality: 'CT',
        instanceCount: 72,
      },
    ]);
    useVolumeStore.setState({
      loadedSeries: [makeLoadedSeries()],
      activeSeriesUID: 'series-1',
      isLoading: false,
      loadError: null,
    });
    useStructureStore.getState().markSeriesDirty('series-1');
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<DicomRepoPanel />);

    await screen.findByText('Boost CT');
    fireEvent.click(screen.getByRole('button', { name: /Load image set Boost CT/i }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('local changes'));
    expect(mocks.loadSeriesFromDicomWeb).not.toHaveBeenCalled();
    expect(useVolumeStore.getState().activeSeriesUID).toBe('series-1');
    expect(screen.queryByText('Boost CT ACTIVE')).toBeNull();
  });

  it('keeps push changes out of the repository navigator @links:SRS-010', async () => {
    useVolumeStore.setState({
      loadedSeries: [makeLoadedSeries()],
      activeSeriesUID: 'series-1',
      isLoading: false,
      loadError: null,
    });

    render(<DicomRepoPanel />);

    await waitFor(() => expect(mocks.queryDicomWebSeries).toHaveBeenCalledTimes(1));

    expect(screen.queryByRole('button', { name: 'Push Changes' })).toBeNull();
  });

  it('loads RTSTRUCT structure sets from a double-clicked repository row @links:SRS-019', async () => {
    const imported = makeStructureSet();
    imported.id = 'ss-imported';
    imported.structures[0].id = 'structure-imported';
    imported.structures[0].name = 'Brainstem';
    const dicomBuffer = new ArrayBuffer(8);
    mocks.queryRtstructInstancesForStudy.mockResolvedValue([
      {
        studyInstanceUID: 'study-1',
        seriesInstanceUID: 'rtss-series-2',
        sopInstanceUID: 'rtss-2',
        seriesDescription: 'RTSTRUCT Latest Thorax CT',
        seriesDate: '20260412',
        seriesTime: '120000',
        roiCount: 3,
        referencedSeriesInstanceUIDs: ['series-1'],
      },
      {
        studyInstanceUID: 'study-1',
        seriesInstanceUID: 'rtss-series-1',
        sopInstanceUID: 'rtss-1',
        seriesDescription: 'RTSTRUCT Thorax CT',
        seriesDate: '20260411',
        seriesTime: '120000',
        roiCount: 2,
        referencedSeriesInstanceUIDs: ['series-1'],
      },
    ]);
    mocks.retrieveDicomWebInstance.mockResolvedValue(dicomBuffer);
    mocks.importRtstructArrayBuffer.mockResolvedValue(imported);

    render(<DicomRepoPanel />);

    await waitFor(() => expect(mocks.queryRtstructInstancesForStudy).toHaveBeenCalledWith('study-1'));
    expect(screen.queryByText('Structure Sets / RTSS')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Show structure sets for Axial/i }));
    expect(await screen.findByText('Structure Sets / RTSS')).toBeTruthy();
    expect(screen.queryByText('LATEST')).toBeNull();
    expect(screen.queryByText('1 VERSIONS')).toBeNull();
    expect(screen.getByText(/3 ROI/)).toBeTruthy();
    expect(screen.getByText('RTSTRUCT Thorax CT')).toBeTruthy();

    expect(screen.queryByRole('button', { name: 'Load' })).toBeNull();
    fireEvent.doubleClick(screen.getByText('RTSTRUCT Thorax CT').closest('[role="button"]')!);

    await waitFor(() => expect(mocks.loadSeriesFromDicomWeb).toHaveBeenCalledTimes(1));
    expect(useVolumeStore.getState().activeSeriesUID).toBe('series-1');
    await waitFor(() => expect(mocks.retrieveDicomWebInstance).toHaveBeenCalledWith(expect.objectContaining({
      sopInstanceUID: 'rtss-1',
    })));
    expect(mocks.importRtstructArrayBuffer).toHaveBeenCalledWith(dicomBuffer, 'series-1', expect.any(Number));
    expect(useStructureStore.getState().activeStructureSetId).toBe('ss-imported');
    expect(useStructureStore.getState().activeStructureId).toBe('structure-imported');
    expect(useStructureStore.getState().structureSets).toHaveLength(1);
    expect(useStructureStore.getState().structureSets[0].id).toBe('ss-imported');
    expect(useStructureStore.getState().structureSets[0].source).toEqual(expect.objectContaining({
      type: 'rtstruct',
      label: 'RTSTRUCT Thorax CT',
      sopInstanceUID: 'rtss-1',
      studyInstanceUID: 'study-1',
      seriesInstanceUID: 'rtss-series-1',
    }));
    expect(useStructureStore.getState().dirtySeriesUIDs).toContain('series-1');
    expect(useStructureStore.getState().repositoryDirtySeriesUIDs).not.toContain('series-1');
    expect(screen.getAllByText('ACTIVE').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('Plans').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('No plans yet').length).toBeGreaterThanOrEqual(1);
  });

  it('groups RTSTRUCT predecessor versions under the latest structure set entry @links:SRS-019', async () => {
    mocks.queryRtstructInstancesForStudy.mockResolvedValue([
      {
        studyInstanceUID: 'study-1',
        seriesInstanceUID: 'rtss-series-2',
        sopClassUID: '1.2.840.10008.5.1.4.1.1.481.3',
        sopInstanceUID: 'rtss-2',
        seriesDescription: 'RTSTRUCT Latest Thorax CT',
        seriesDate: '20260412',
        seriesTime: '120000',
        structureSetLabel: 'RTSS',
        structureSetName: 'RTSTRUCT Latest Thorax CT',
        structureSetDescription: '',
        structureSetDate: '20260412',
        structureSetTime: '120000',
        predecessorSopClassUID: '1.2.840.10008.5.1.4.1.1.481.3',
        predecessorSopInstanceUID: 'rtss-1',
        roiCount: 3,
        referencedSeriesInstanceUIDs: ['series-1'],
      },
      {
        studyInstanceUID: 'study-1',
        seriesInstanceUID: 'rtss-series-1',
        sopClassUID: '1.2.840.10008.5.1.4.1.1.481.3',
        sopInstanceUID: 'rtss-1',
        seriesDescription: 'RTSTRUCT Thorax CT',
        seriesDate: '20260411',
        seriesTime: '120000',
        structureSetLabel: 'RTSS',
        structureSetName: 'RTSTRUCT Thorax CT',
        structureSetDescription: '',
        structureSetDate: '20260411',
        structureSetTime: '120000',
        roiCount: 2,
        referencedSeriesInstanceUIDs: ['series-1'],
      },
    ]);

    render(<DicomRepoPanel />);

    await waitFor(() => expect(mocks.queryRtstructInstancesForStudy).toHaveBeenCalledWith('study-1'));
    fireEvent.click(screen.getByRole('button', { name: /Show structure sets for Axial/i }));

    expect(await screen.findByText('RTSTRUCT Latest Thorax CT')).toBeTruthy();
    expect(screen.getByText('2 VERSIONS')).toBeTruthy();
    expect(screen.queryByText('RTSTRUCT Thorax CT')).toBeNull();
  });

  it('marks the repository RTSTRUCT active when the active structure set matches the RTSTRUCT SOP @links:SRS-019', async () => {
    useVolumeStore.setState({
      loadedSeries: [makeLoadedSeries()],
      activeSeriesUID: 'series-1',
      isLoading: false,
      loadError: null,
    });
    useStructureStore.setState({
      structureSets: [{
        ...makeStructureSet(),
        source: {
          type: 'rtstruct',
          label: 'RTSTRUCT Thorax CT',
          sopInstanceUID: 'current-query-sop',
          studyInstanceUID: 'study-1',
          seriesInstanceUID: 'rtss-series-1',
          importedAt: '2026-04-19T00:00:00.000Z',
        },
      }],
      activeStructureSetId: 'ss-1',
      activeStructureId: 'structure-1',
      dirtySeriesUIDs: [],
      repositoryDirtySeriesUIDs: [],
    });
    mocks.queryRtstructInstancesForStudy.mockResolvedValue([
      {
        studyInstanceUID: 'study-1',
        seriesInstanceUID: 'rtss-series-1',
        sopInstanceUID: 'current-query-sop',
        seriesDescription: 'RTSTRUCT Thorax CT',
        seriesDate: '20260411',
        seriesTime: '120000',
        roiCount: 2,
        referencedSeriesInstanceUIDs: ['series-1'],
      },
    ]);

    render(<DicomRepoPanel />);

    await screen.findByText('RTSTRUCT Thorax CT');

    expect(screen.getByText('Active in workspace')).toBeTruthy();
    expect(screen.getAllByText('ACTIVE').length).toBeGreaterThanOrEqual(2);
  });

  it('compares a repository RTSTRUCT with the active workspace structure set without loading it @links:SRS-015', async () => {
    const repositoryRtstruct = makeStructureSet();
    repositoryRtstruct.id = 'repo-ss';
    repositoryRtstruct.label = 'Repository Set';
    repositoryRtstruct.structures[0].volume_cc = 0.4;
    repositoryRtstruct.structures[0].contours = [{
      referencedSOPInstanceUID: 'sop-0',
      slicePosition: 0,
      points: new Float32Array([0, 0, 0, 6, 0, 0, 6, 6, 0, 0, 6, 0]),
      isClosed: true,
    }];
    repositoryRtstruct.structures.push({
      id: 'old-oar',
      name: 'Old_OAR',
      type: 'OAR',
      color: [255, 0, 0],
      contours: [],
      isVisible: true,
      isLocked: false,
      volume_cc: 5,
    });
    useVolumeStore.setState({
      loadedSeries: [makeLoadedSeries()],
      activeSeriesUID: 'series-1',
      isLoading: false,
      loadError: null,
    });
    mocks.queryRtstructInstancesForStudy.mockResolvedValue([
      {
        studyInstanceUID: 'study-1',
        seriesInstanceUID: 'rtss-series-1',
        sopInstanceUID: 'rtss-1',
        seriesDescription: 'RTSTRUCT Baseline',
        seriesDate: '20260411',
        seriesTime: '120000',
        roiCount: 2,
        referencedSeriesInstanceUIDs: ['series-1'],
      },
    ]);
    const dicomBuffer = new ArrayBuffer(12);
    mocks.retrieveDicomWebInstance.mockResolvedValue(dicomBuffer);
    mocks.importRtstructArrayBuffer.mockResolvedValue(repositoryRtstruct);

    render(<DicomRepoPanel />);

    expect(await screen.findByText('RTSTRUCT Baseline')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Compare' }));

    await waitFor(() => expect(mocks.retrieveDicomWebInstance).toHaveBeenCalledWith(expect.objectContaining({
      sopInstanceUID: 'rtss-1',
    })));
    expect(mocks.importRtstructArrayBuffer).toHaveBeenCalledWith(dicomBuffer, 'series-1', expect.any(Number));
    expect(screen.getByText('RTSS Compare')).toBeTruthy();
    expect(screen.getByText('RTSTRUCT Baseline vs active workspace')).toBeTruthy();
    expect(screen.getByText('+0 / -1 / Δ1')).toBeTruthy();
    expect(useStructureStore.getState().activeStructureSetId).toBe('ss-1');
    fireEvent.click(screen.getByRole('button', { name: /PTV changed/i }));
    expect(useStructureStore.getState().activeStructureId).toBe('structure-1');
    expect(mocks.scroll).toHaveBeenCalledWith(1);
    expect(mocks.renderViewport).toHaveBeenCalled();
  });

  it('keeps the active RTSTRUCT when unsynced changes are not confirmed', async () => {
    useVolumeStore.setState({
      loadedSeries: [makeLoadedSeries()],
      activeSeriesUID: 'series-1',
      isLoading: false,
      loadError: null,
    });
    useStructureStore.getState().markSeriesDirty('series-1');
    mocks.queryRtstructInstancesForStudy.mockResolvedValue([
      {
        studyInstanceUID: 'study-1',
        seriesInstanceUID: 'rtss-series-1',
        sopInstanceUID: 'rtss-1',
        seriesDescription: 'RTSTRUCT Thorax CT',
        seriesDate: '20260411',
        seriesTime: '120000',
        roiCount: 2,
        referencedSeriesInstanceUIDs: ['series-1'],
      },
    ]);
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(<DicomRepoPanel />);

    await screen.findByText('RTSTRUCT Thorax CT');
    fireEvent.doubleClick(screen.getByRole('button', { name: /RTSTRUCT Thorax CT/i }));

    expect(confirmSpy).toHaveBeenCalledWith(expect.stringContaining('local changes'));
    expect(mocks.retrieveDicomWebInstance).not.toHaveBeenCalled();
    expect(mocks.importRtstructArrayBuffer).not.toHaveBeenCalled();
    expect(useStructureStore.getState().activeStructureSetId).toBe('ss-1');
    expect(screen.getByText('Double-click to activate')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Load' })).toBeNull();
  });

});
