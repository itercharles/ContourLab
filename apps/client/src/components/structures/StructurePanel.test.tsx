import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import StructurePanel from './StructurePanel';
import { useStructureStore } from '../../core/store/structureStore';
import { useVolumeStore, type LoadedSeries } from '../../core/store/volumeStore';
import type { StructureSet } from '@webtps/shared-types';

const mocks = vi.hoisted(() => ({
  loadStructureDraftForSeries: vi.fn(),
  saveStructureDraftForSeries: vi.fn(),
  uploadDicomBlobToRepository: vi.fn(),
  queryRtstructInstancesForStudy: vi.fn(),
  retrieveDicomWebInstance: vi.fn(),
  exportRtstructBlob: vi.fn(),
  importRtstructArrayBuffer: vi.fn(),
}));

vi.mock('../../core/structures/structureDraftStore', () => ({
  loadStructureDraftForSeries: mocks.loadStructureDraftForSeries,
  saveStructureDraftForSeries: mocks.saveStructureDraftForSeries,
}));

vi.mock('../../core/dicom/dicomWebClient', () => ({
  uploadDicomBlobToRepository: mocks.uploadDicomBlobToRepository,
  queryRtstructInstancesForStudy: mocks.queryRtstructInstancesForStudy,
  retrieveDicomWebInstance: mocks.retrieveDicomWebInstance,
}));

vi.mock('../../core/structures/rtstructExport', () => ({
  exportRtstructBlob: mocks.exportRtstructBlob,
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
  mocks.uploadDicomBlobToRepository.mockResolvedValue(undefined);
  mocks.queryRtstructInstancesForStudy.mockResolvedValue([]);
  mocks.retrieveDicomWebInstance.mockResolvedValue(new ArrayBuffer(0));
  mocks.importRtstructArrayBuffer.mockResolvedValue(makeStructureSet());
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

describe('StructurePanel local draft and RTSTRUCT upload interactions', () => {
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

  it('uploads the active structure set as RTSTRUCT to the DICOM repository', async () => {
    const rtstructBlob = new Blob(['dicom'], { type: 'application/dicom' });
    mocks.exportRtstructBlob.mockResolvedValue(rtstructBlob);

    render(<StructurePanel />);

    fireEvent.click(screen.getByTitle('Upload active structure set as RTSTRUCT to DICOM repository'));

    await waitFor(() => expect(mocks.exportRtstructBlob).toHaveBeenCalledTimes(1));
    expect(mocks.uploadDicomBlobToRepository).toHaveBeenCalledWith(rtstructBlob);
  });

  it('lists RTSTRUCT candidates before replacing active-series structures', async () => {
    const imported = makeStructureSet();
    imported.id = 'ss-imported';
    imported.structures[0].id = 'structure-imported';
    imported.structures[0].name = 'Brainstem';
    const dicomBuffer = new ArrayBuffer(8);
    mocks.queryRtstructInstancesForStudy.mockResolvedValue([
      {
        studyInstanceUID: 'study-1',
        seriesInstanceUID: 'rtss-series-1',
        sopInstanceUID: 'rtss-1',
        seriesDescription: 'RTSTRUCT Thorax CT',
        seriesDate: '20260411',
        seriesTime: '120000',
      },
    ]);
    mocks.retrieveDicomWebInstance.mockResolvedValue(dicomBuffer);
    mocks.importRtstructArrayBuffer.mockResolvedValue(imported);

    render(<StructurePanel />);

    fireEvent.click(screen.getByTitle('Find RTSTRUCT objects in DICOM repository for this study'));

    await waitFor(() => expect(mocks.queryRtstructInstancesForStudy).toHaveBeenCalledWith('study-1'));
    expect(await screen.findByText('Repository RTSTRUCT')).toBeTruthy();
    expect(screen.getByText('RTSTRUCT Thorax CT')).toBeTruthy();
    expect(screen.getByText('Import replaces the current active-series structures and updates the local browser draft.')).toBeTruthy();

    fireEvent.click(screen.getByText('Replace'));

    await waitFor(() => expect(mocks.retrieveDicomWebInstance).toHaveBeenCalledWith(expect.objectContaining({
      sopInstanceUID: 'rtss-1',
    })));
    expect(mocks.retrieveDicomWebInstance).toHaveBeenCalledWith(expect.objectContaining({
      sopInstanceUID: 'rtss-1',
    }));
    expect(mocks.importRtstructArrayBuffer).toHaveBeenCalledWith(dicomBuffer, 'series-1');
    expect(useStructureStore.getState().activeStructureSetId).toBe('ss-imported');
    expect(useStructureStore.getState().activeStructureId).toBe('structure-imported');
    expect(useStructureStore.getState().structureSets).toHaveLength(1);
    expect(useStructureStore.getState().structureSets[0].id).toBe('ss-imported');
    expect(useStructureStore.getState().dirtySeriesUIDs).toContain('series-1');
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
