import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import StatusBar from './StatusBar';
import { useStructureStore } from '../../core/store/structureStore';
import { useUIStore } from '../../core/store/uiStore';
import { useVolumeStore, type LoadedSeries } from '../../core/store/volumeStore';

function makeLoadedSeries(): LoadedSeries {
  return {
    seriesUID: 'series-1',
    cornerstoneVolumeId: 'volume-1',
    volume: {
      seriesUID: 'series-1',
      dimensions: [1, 1, 3],
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
      series: [],
    },
    series: {
      seriesInstanceUID: 'series-1',
      seriesDescription: 'Planning CT',
      modality: 'CT',
      instances: [
        { sopInstanceUID: 'sop-1', instanceNumber: 1 },
        { sopInstanceUID: 'sop-2', instanceNumber: 2 },
        { sopInstanceUID: 'sop-3', instanceNumber: 3 },
      ],
    },
  };
}

beforeEach(() => {
  useUIStore.setState({
    activeTool: 'none',
    brushRadius: 10,
    activeViewport: null,
  });
  useVolumeStore.setState({
    loadedSeries: [],
    activeSeriesUID: null,
    isLoading: false,
    loadError: null,
  });
  useStructureStore.setState({
    repositoryDirtySeriesUIDs: [],
  });
});

describe('StatusBar', () => {
  it('shows compact global viewport status', () => {
    render(<StatusBar />);

    expect(screen.getAllByText('n/a').length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText('synced')).toBeTruthy();
  });

  it('shows no active tool after the tool is toggled off', () => {
    useUIStore.setState({ activeTool: 'none' });

    render(<StatusBar />);

    expect(screen.getAllByText('n/a').length).toBeGreaterThanOrEqual(5);
  });

  it('shows slice count and unsynced repository state for the active series', () => {
    useVolumeStore.setState({
      loadedSeries: [makeLoadedSeries()],
      activeSeriesUID: 'series-1',
    });
    useStructureStore.setState({
      repositoryDirtySeriesUIDs: ['series-1'],
    });

    render(<StatusBar />);

    expect(screen.getByText('1/3')).toBeTruthy();
    expect(screen.getByText('unsynced')).toBeTruthy();
  });

  it('shows brush radius only for brush-like tools', () => {
    useUIStore.setState({
      activeTool: 'brush',
      brushRadius: 12,
      activeViewport: 'AXIAL',
    });

    render(<StatusBar />);

    expect(screen.getByText('Brush')).toBeTruthy();
    expect(screen.getByText('12px')).toBeTruthy();
    expect(screen.getByText('AXIAL')).toBeTruthy();
  });
});
