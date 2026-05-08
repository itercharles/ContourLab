import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { StructureSet } from '@webtps/shared-types';
import ThreeDViewport from './ThreeDViewport';
import { useStructureStore } from '../../core/store/structureStore';
import { useVolumeStore, type LoadedSeries } from '../../core/store/volumeStore';

const mocks = vi.hoisted(() => ({
  renderSnapshot: vi.fn((snapshot) => ({
    ctReady: Boolean(snapshot.volume?.pixelData.length) && snapshot.showCtSurface,
    structureCount: snapshot.structures.length,
  })),
  resize: vi.fn(),
  resetCamera: vi.fn(),
  destroy: vi.fn(),
}));

vi.mock('../../core/rendering/threeDScene', () => ({
  createThreeDScene: vi.fn(() => ({
    renderSnapshot: mocks.renderSnapshot,
    resize: mocks.resize,
    resetCamera: mocks.resetCamera,
    destroy: mocks.destroy,
  })),
}));

class ResizeObserverMock {
  observe() {}
  disconnect() {}
}

function makeLoadedSeries(pixelData: Float32Array = new Float32Array([0, 250, 500])): LoadedSeries {
  return {
    seriesUID: 'series-1',
    cornerstoneVolumeId: 'volume-1',
    volume: {
      seriesUID: 'series-1',
      dimensions: [4, 4, 2],
      spacing: [1, 1, 2],
      origin: [0, 0, 0],
      directionCosines: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      pixelData,
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
      studyDate: '2026-05-08',
      studyDescription: 'Planning CT',
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
    label: 'Structures',
    referencedSeriesUID: 'series-1',
    version: 1,
    structures: [
      {
        id: 'structure-1',
        name: 'PTV',
        type: 'PTV',
        color: [0, 0, 255],
        isVisible: true,
        isLocked: false,
        volume_cc: 1.2,
        contours: [
          {
            referencedSOPInstanceUID: 'sop-1',
            slicePosition: 0,
            isClosed: true,
            points: new Float32Array([
              0, 0, 0,
              1, 0, 0,
              1, 1, 0,
              0, 1, 0,
            ]),
          },
        ],
      },
    ],
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
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

describe('ThreeDViewport @links:SRS-028,SRS-029', () => {
  it('renders the live 3D viewport status instead of the old placeholder', async () => {
    render(<ThreeDViewport />);

    expect(screen.getByLabelText('3D viewport')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByText(/CT surface ready/i)).toBeTruthy();
      expect(screen.getByText(/1 visible structure/i)).toBeTruthy();
    });
  });

  it('lets the user hide CT context and reset the 3D camera', async () => {
    render(<ThreeDViewport />);

    fireEvent.click(screen.getByRole('button', { name: 'Hide CT' }));
    await waitFor(() => expect(screen.getByText(/CT hidden/i)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Reset' }));
    expect(mocks.resetCamera).toHaveBeenCalledTimes(1);
  });

  it('offers a manual refresh path when the scene needs rebuilding', async () => {
    render(<ThreeDViewport />);

    const callsBefore = mocks.renderSnapshot.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Refresh 3D' }));

    await waitFor(() => {
      expect(mocks.renderSnapshot.mock.calls.length).toBeGreaterThan(callsBefore);
    });
  });
});
