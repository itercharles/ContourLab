import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ContourOverlay from './ContourOverlay';
import { useUIStore } from '../../core/store/uiStore';
import { useVolumeStore, type LoadedSeries } from '../../core/store/volumeStore';
import { useStructureStore } from '../../core/store/structureStore';

const mocks = vi.hoisted(() => ({
  getViewport: vi.fn(),
  getRenderingEngine: vi.fn(),
  logClientDebug: vi.fn(),
}));

vi.mock('../../core/rendering/ViewportManager', () => ({
  ViewportManager: {
    getRenderingEngine: mocks.getRenderingEngine,
  },
}));

vi.mock('../../core/debug/clientDebugLog', () => ({
  logClientDebug: mocks.logClientDebug,
}));

function makeLoadedSeries(): LoadedSeries {
  return {
    seriesUID: 'series-1',
    cornerstoneVolumeId: 'volume-1',
    volume: {
      seriesUID: 'series-1',
      dimensions: [32, 32, 4],
      spacing: [1, 1, 2],
      origin: [0, 0, 0],
      directionCosines: [1, 0, 0, 0, 1, 0, 0, 0, 1],
      pixelData: new Float32Array(32 * 32 * 4),
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
      studyDate: '2026-04-21',
      series: [],
    },
    series: {
      seriesInstanceUID: 'series-1',
      seriesDescription: 'Planning CT',
      modality: 'CT',
      instances: [
        { sopInstanceUID: 'sop-1', instanceNumber: 1, sliceLocation: 6 },
        { sopInstanceUID: 'sop-2', instanceNumber: 2, sliceLocation: 8 },
      ],
    },
  };
}

describe('ContourOverlay measurements', () => {
  const originalRequestAnimationFrame = window.requestAnimationFrame;
  const originalCancelAnimationFrame = window.cancelAnimationFrame;

  beforeEach(() => {
    vi.clearAllMocks();
    window.requestAnimationFrame = vi.fn(() => 1);
    window.cancelAnimationFrame = vi.fn();
    mocks.getViewport.mockReturnValue({
      canvasToWorld: (point: [number, number]) => [Number.isFinite(point[0]) ? point[0] : 0, Number.isFinite(point[1]) ? point[1] : 0, 8] as [number, number, number],
      worldToCanvas: (point: [number, number, number]) => [
        Number.isFinite(point[0]) ? point[0] : 0,
        Number.isFinite(point[1]) ? point[1] : 0,
      ] as [number, number],
      getIntensityFromWorld: vi.fn(() => 24),
      getCamera: () => ({ focalPoint: [0, 0, 8] as [number, number, number] }),
      getZoom: () => 1,
    });
    mocks.getRenderingEngine.mockReturnValue({
      getViewport: mocks.getViewport,
    });
    useUIStore.setState({
      activeTool: 'huProbe',
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
      structureSets: [],
      activeStructureSetId: null,
      activeStructureId: null,
      dirtySeriesUIDs: [],
      repositoryDirtySeriesUIDs: [],
    });
  });

  afterEach(() => {
    window.requestAnimationFrame = originalRequestAnimationFrame;
    window.cancelAnimationFrame = originalCancelAnimationFrame;
  });

  function renderOverlay() {
    const viewportElement = document.createElement('div');
    Object.defineProperty(viewportElement, 'clientWidth', { value: 256, configurable: true });
    Object.defineProperty(viewportElement, 'clientHeight', { value: 256, configurable: true });
    viewportElement.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 256,
        height: 256,
        right: 256,
        bottom: 256,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    const canvas = document.createElement('canvas');
    canvas.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 256,
        height: 256,
        right: 256,
        bottom: 256,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    viewportElement.appendChild(canvas);

    const result = render(
      <ContourOverlay
        viewportId="viewport-axial"
        viewportElement={viewportElement}
        orientation="AXIAL"
      />
    );

    const svg = result.container.querySelector('svg') as SVGSVGElement;
    svg.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        width: 256,
        height: 256,
        right: 256,
        bottom: 256,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;

    return { ...result, svg };
  }

  it('creates and deletes the latest HU probe with Delete', () => {
    const { svg } = renderOverlay();

    fireEvent.pointerDown(svg, { clientX: 24, clientY: 30, button: 0, buttons: 1 });
    expect(screen.getAllByText('24 HU').length).toBeGreaterThan(0);

    fireEvent.keyDown(window, { key: 'Delete' });
    expect(screen.queryAllByText('24 HU')).toHaveLength(0);
  });

  it('removes the selected measurement instead of always deleting the latest one', () => {
    mocks.getViewport.mockReturnValue({
      canvasToWorld: (point: [number, number]) => [Number.isFinite(point[0]) ? point[0] : 0, Number.isFinite(point[1]) ? point[1] : 0, 8] as [number, number, number],
      worldToCanvas: (point: [number, number, number]) => [
        Number.isFinite(point[0]) ? point[0] : 0,
        Number.isFinite(point[1]) ? point[1] : 0,
      ] as [number, number],
      getIntensityFromWorld: vi.fn()
        .mockReturnValueOnce(24)
        .mockReturnValueOnce(80),
      getCamera: () => ({ focalPoint: [0, 0, 8] as [number, number, number] }),
      getZoom: () => 1,
    });

    const { svg } = renderOverlay();

    fireEvent.pointerDown(svg, { clientX: 24, clientY: 30, button: 0, buttons: 1 });
    fireEvent.pointerDown(svg, { clientX: 80, clientY: 42, button: 0, buttons: 1 });

    expect(screen.getAllByText('24 HU').length).toBeGreaterThan(0);
    expect(screen.getAllByText('80 HU').length).toBeGreaterThan(0);

    fireEvent.pointerDown(screen.getAllByText('24 HU')[0]);
    fireEvent.keyDown(window, { key: 'Delete' });

    expect(screen.queryAllByText('24 HU')).toHaveLength(0);
    expect(screen.getAllByText('80 HU').length).toBeGreaterThan(0);
  });
});
