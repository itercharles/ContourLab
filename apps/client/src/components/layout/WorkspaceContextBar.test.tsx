import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import WorkspaceContextBar from './WorkspaceContextBar';
import { useStructureStore } from '../../core/store/structureStore';
import { useVolumeStore, type LoadedSeries } from '../../core/store/volumeStore';
import type { StructureSet } from '@webtps/shared-types';

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

describe('WorkspaceContextBar', () => {
  it('shows empty active context before a patient and image set are loaded', () => {
    render(<WorkspaceContextBar />);

    expect(screen.getByText('No active patient')).toBeTruthy();
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
});
