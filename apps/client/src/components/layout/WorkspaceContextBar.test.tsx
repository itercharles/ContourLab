import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import WorkspaceContextBar from './WorkspaceContextBar';
import { useStructureStore } from '../../core/store/structureStore';
import { useUIStore } from '../../core/store/uiStore';
import { useVolumeStore, type LoadedSeries } from '../../core/store/volumeStore';
import type { StructureSet } from '@contourlab/shared-types';

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
      seriesDescription: 'Planning CT',
      modality: 'CT',
      instances: [],
    },
  };
}

function makeStructureSet(): StructureSet {
  return {
    id: 'ss-1',
    label: 'Manual Set',
    referencedSeriesUID: 'series-1',
    version: 1,
    source: {
      type: 'rtstruct',
      label: 'RTSTRUCT Planning CT',
      sopInstanceUID: '1.2.3.4',
      studyInstanceUID: 'study-1',
      seriesInstanceUID: 'rtss-series-1',
      importedAt: '2026-04-12T07:00:00.000Z',
    },
    structures: [],
  };
}

beforeEach(() => {
  useUIStore.setState({
    leftSidebarOpen: false,
  });
  useVolumeStore.setState({
    loadedSeries: [],
    activeSeriesUID: null,
    isLoading: false,
    loadError: null,
  });
  useStructureStore.setState({
    structureSets: [],
    activeStructureSetId: null,
    activeStructureId: null,
    dirtySeriesUIDs: [],
    repositoryDirtySeriesUIDs: [],
  });
});

describe('WorkspaceContextBar @links:SRS-020', () => {
  it('shows empty active context before a patient and image set are loaded', () => {
    render(<WorkspaceContextBar />);

    expect(screen.getByText('Load Patient')).toBeTruthy();
    expect(screen.getByText('No active image set')).toBeTruthy();
    expect(screen.getByText('No active RTSS')).toBeTruthy();
    expect(screen.getByText('Synced')).toBeTruthy();
  });

  it('shows active patient, image, RTSTRUCT source, and sync state', () => {
    useVolumeStore.setState({
      loadedSeries: [makeLoadedSeries()],
      activeSeriesUID: 'series-1',
    });
    useStructureStore.setState({
      structureSets: [makeStructureSet()],
      activeStructureSetId: 'ss-1',
      repositoryDirtySeriesUIDs: ['series-1'],
    });

    render(<WorkspaceContextBar />);

    expect(screen.getByText('Jane Doe')).toBeTruthy();
    expect(screen.getByText('Planning CT')).toBeTruthy();
    expect(screen.getByText('RTSTRUCT Planning CT')).toBeTruthy();
    expect(screen.getByText('Unsynced')).toBeTruthy();
  });

  it('opens the workspace selector from the active patient context', () => {
    useVolumeStore.setState({
      loadedSeries: [makeLoadedSeries()],
      activeSeriesUID: 'series-1',
    });

    render(<WorkspaceContextBar />);

    expect(useUIStore.getState().leftSidebarOpen).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Jane Doe' }));
    expect(useUIStore.getState().leftSidebarOpen).toBe(true);
  });
});
