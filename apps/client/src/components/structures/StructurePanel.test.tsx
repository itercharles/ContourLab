import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StructurePanel from './StructurePanel';
import { useStructureStore } from '../../core/store/structureStore';
import { useVolumeStore, type LoadedSeries } from '../../core/store/volumeStore';
import type { StructureSet } from '@webtps/shared-types';

const mocks = vi.hoisted(() => ({
  loadStructureDraftForSeries: vi.fn(),
  saveStructureDraftForSeries: vi.fn(),
}));

vi.mock('../../core/structures/structureDraftStore', () => ({
  loadStructureDraftForSeries: mocks.loadStructureDraftForSeries,
  saveStructureDraftForSeries: mocks.saveStructureDraftForSeries,
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

beforeEach(() => {
  vi.clearAllMocks();
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

  it('shows the active drawing target and edits its color', async () => {
    render(<StructurePanel />);

    expect(screen.getByText('Drawing target')).toBeTruthy();
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

  it('shows contour review navigation for the active structure', () => {
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

    expect(screen.getByText('2 contour slices')).toBeTruthy();
    expect(screen.getByTitle('Jump to previous contour slice on the axial view')).toBeTruthy();
    expect(screen.getByTitle('Jump to next contour slice on the axial view')).toBeTruthy();
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
    });

    render(<StructurePanel />);

    expect(screen.getByText('RTSS')).toBeTruthy();
    expect(screen.getByText('Source: RTSTRUCT Thorax CT')).toBeTruthy();
    expect(screen.getByText('SOP: 1.2.3.4.5')).toBeTruthy();
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

    fireEvent.click(screen.getByTitle('Add new structure'));
    fireEvent.change(screen.getByPlaceholderText('e.g. PTV, Brainstem…'), {
      target: { value: 'ptv' },
    });
    fireEvent.click(screen.getByText('Add'));

    expect(await screen.findByText('Structure "ptv" already exists in this structure set.')).toBeTruthy();
  });
});
