import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import DicomRepoPanel from './DicomRepoPanel';
import { useVolumeStore, type LoadedSeries } from '../../core/store/volumeStore';
import { useStructureStore } from '../../core/store/structureStore';
import type { StructureSet } from '@webtps/shared-types';

const mocks = vi.hoisted(() => ({
  queryDicomWebSeries: vi.fn(),
  uploadDicomWebStudies: vi.fn(),
  loadSeriesFromDicomWeb: vi.fn(),
  uploadDicomBlobToRepository: vi.fn(),
  queryRtstructInstancesForStudy: vi.fn(),
  retrieveDicomWebInstance: vi.fn(),
  exportRtstructObject: vi.fn(),
  importRtstructArrayBuffer: vi.fn(),
}));

vi.mock('../../core/dicom/dicomWebClient', () => ({
  queryDicomWebSeries: mocks.queryDicomWebSeries,
  uploadDicomWebStudies: mocks.uploadDicomWebStudies,
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

beforeEach(() => {
  vi.clearAllMocks();
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
  mocks.uploadDicomWebStudies.mockResolvedValue(undefined);
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

  it('focuses image-set choices after patient selection when multiple patients exist', async () => {
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

    render(<DicomRepoPanel />);

    await screen.findByText('Select a patient to begin.');
    expect(screen.queryByText('Axial')).toBeNull();

    fireEvent.click(screen.getByText('Select Patient'));
    fireEvent.change(screen.getByPlaceholderText('Search patient, MRN, study, series'), {
      target: { value: 'smith' },
    });
    fireEvent.click(screen.getByText('JOHN SMITH'));

    await waitFor(() => expect(mocks.queryRtstructInstancesForStudy).toHaveBeenCalledWith('study-2'));
    expect(screen.queryByText('Select Patient')).toBeNull();
    expect(screen.getByText('Simulation CT')).toBeTruthy();
    expect(screen.getByText('CT SIM')).toBeTruthy();
    expect(screen.queryByText('Axial')).toBeNull();
  });

  it('opens patient selection from the patient context command', async () => {
    render(<DicomRepoPanel />);

    await screen.findByText('Image Sets');
    act(() => {
      window.dispatchEvent(new CustomEvent('webtps:open-patient-selector'));
    });

    expect(await screen.findByText('Select Patient')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search patient, MRN, study, series')).toBeTruthy();
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

  it('keeps push changes out of the repository navigator', async () => {
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

  it('loads RTSTRUCT structure sets from a double-clicked repository row', async () => {
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
    expect(screen.getByText('LATEST')).toBeTruthy();
    expect(screen.getByText(/3 ROI/)).toBeTruthy();
    expect(screen.getByText('RTSTRUCT Thorax CT')).toBeTruthy();

    fireEvent.doubleClick(screen.getByRole('button', { name: /RTSTRUCT Thorax CT/i }));

    await waitFor(() => expect(mocks.loadSeriesFromDicomWeb).toHaveBeenCalledTimes(1));
    expect(useVolumeStore.getState().activeSeriesUID).toBe('series-1');
    await waitFor(() => expect(mocks.retrieveDicomWebInstance).toHaveBeenCalledWith(expect.objectContaining({
      sopInstanceUID: 'rtss-1',
    })));
    expect(mocks.importRtstructArrayBuffer).toHaveBeenCalledWith(dicomBuffer, 'series-1');
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

  it('compares a repository RTSTRUCT with the active workspace structure set without loading it', async () => {
    const repositoryRtstruct = makeStructureSet();
    repositoryRtstruct.id = 'repo-ss';
    repositoryRtstruct.label = 'Repository Set';
    repositoryRtstruct.structures[0].volume_cc = 0.4;
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
    expect(mocks.importRtstructArrayBuffer).toHaveBeenCalledWith(dicomBuffer, 'series-1');
    expect(screen.getByText('RTSS Compare')).toBeTruthy();
    expect(screen.getByText('RTSTRUCT Baseline vs active workspace')).toBeTruthy();
    expect(screen.getByText('+0 / -1 / Δ1')).toBeTruthy();
    expect(useStructureStore.getState().activeStructureSetId).toBe('ss-1');
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
    expect(screen.getByText('Double-click to load')).toBeTruthy();
  });

});
