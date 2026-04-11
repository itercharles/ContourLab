import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import DicomRepoPanel from './DicomRepoPanel';
import { useVolumeStore, type LoadedSeries } from '../../core/store/volumeStore';

const mocks = vi.hoisted(() => ({
  queryDicomWebSeries: vi.fn(),
  uploadDicomWebStudies: vi.fn(),
  loadSeriesFromDicomWeb: vi.fn(),
}));

vi.mock('../../core/dicom/dicomWebClient', () => ({
  queryDicomWebSeries: mocks.queryDicomWebSeries,
  uploadDicomWebStudies: mocks.uploadDicomWebStudies,
  loadSeriesFromDicomWeb: mocks.loadSeriesFromDicomWeb,
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

  useVolumeStore.setState({
    loadedSeries: [],
    activeSeriesUID: null,
    isLoading: false,
    loadError: null,
  });
});

describe('DicomRepoPanel', () => {
  it('queries repository series on mount', async () => {
    render(<DicomRepoPanel />);

    await waitFor(() => expect(mocks.queryDicomWebSeries).toHaveBeenCalledTimes(1));
    expect(screen.getByText('Axial')).toBeTruthy();
  });

  it('loads a series into the volume store when clicked', async () => {
    mocks.loadSeriesFromDicomWeb.mockResolvedValue(makeLoadedSeries());

    render(<DicomRepoPanel />);

    await screen.findByText('Axial');
    fireEvent.click(screen.getByRole('button', { name: /Axial/i }));

    await waitFor(() => expect(mocks.loadSeriesFromDicomWeb).toHaveBeenCalledTimes(1));
    expect(useVolumeStore.getState().activeSeriesUID).toBe('series-1');
  });
});
