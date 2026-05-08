import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Structure, Volume } from '@webtps/shared-types';

const mocks = vi.hoisted(() => {
  const renderer = {
    addActor: vi.fn(),
    removeActor: vi.fn(),
    getActiveCamera: vi.fn(() => ({
      setParallelProjection: vi.fn(),
    })),
    resetCamera: vi.fn(),
    delete: vi.fn(),
  };

  const renderWindow = {
    addRenderer: vi.fn(),
    addView: vi.fn(),
    render: vi.fn(),
    removeView: vi.fn(),
    delete: vi.fn(),
  };

  const openGLRenderWindow = {
    setContainer: vi.fn(),
    setSize: vi.fn(),
    delete: vi.fn(),
  };

  const interactor = {
    setView: vi.fn(),
    initialize: vi.fn(),
    bindEvents: vi.fn(),
    setInteractorStyle: vi.fn(),
    unbindEvents: vi.fn(),
    delete: vi.fn(),
  };

  const tracked = {
    actors: [] as Array<{ delete: ReturnType<typeof vi.fn> }>,
    images: [] as Array<{ delete: ReturnType<typeof vi.fn> }>,
    mappers: [] as Array<{ delete: ReturnType<typeof vi.fn> }>,
    marching: [] as Array<{ delete: ReturnType<typeof vi.fn> }>,
  };

  return {
    renderer,
    renderWindow,
    openGLRenderWindow,
    interactor,
    interactorStyle: { delete: vi.fn() },
    axesActor: { delete: vi.fn() },
    tracked,
  };
});

vi.mock('@kitware/vtk.js/Rendering/Core/Actor', () => ({
  default: {
    newInstance: vi.fn(() => {
      const instance = {
        setMapper: vi.fn(),
        getProperty: vi.fn(() => ({
          setColor: vi.fn(),
          setOpacity: vi.fn(),
          setInterpolationToPhong: vi.fn(),
        })),
        delete: vi.fn(),
      };
      mocks.tracked.actors.push(instance);
      return instance;
    }),
  },
}));

vi.mock('@kitware/vtk.js/Rendering/Core/AxesActor', () => ({
  default: {
    newInstance: vi.fn(() => mocks.axesActor),
  },
}));

vi.mock('@kitware/vtk.js/Common/Core/DataArray', () => ({
  default: {
    newInstance: vi.fn((config) => config),
  },
}));

vi.mock('@kitware/vtk.js/Common/DataModel/ImageData', () => ({
  default: {
    newInstance: vi.fn(() => {
      const instance = {
        setDimensions: vi.fn(),
        setSpacing: vi.fn(),
        setOrigin: vi.fn(),
        setDirection: vi.fn(),
        getPointData: vi.fn(() => ({
          setScalars: vi.fn(),
        })),
        delete: vi.fn(),
      };
      mocks.tracked.images.push(instance);
      return instance;
    }),
  },
}));

vi.mock('@kitware/vtk.js/Interaction/Style/InteractorStyleTrackballCamera', () => ({
  default: {
    newInstance: vi.fn(() => mocks.interactorStyle),
  },
}));

vi.mock('@kitware/vtk.js/Rendering/Core/Mapper', () => ({
  default: {
    newInstance: vi.fn(() => {
      const instance = {
        setInputConnection: vi.fn(),
        delete: vi.fn(),
      };
      mocks.tracked.mappers.push(instance);
      return instance;
    }),
  },
}));

vi.mock('@kitware/vtk.js/Rendering/OpenGL/RenderWindow', () => ({
  default: {
    newInstance: vi.fn(() => mocks.openGLRenderWindow),
  },
}));

vi.mock('@kitware/vtk.js/Rendering/Core/RenderWindow', () => ({
  default: {
    newInstance: vi.fn(() => mocks.renderWindow),
  },
}));

vi.mock('@kitware/vtk.js/Rendering/Core/RenderWindowInteractor', () => ({
  default: {
    newInstance: vi.fn(() => mocks.interactor),
  },
}));

vi.mock('@kitware/vtk.js/Rendering/Core/Renderer', () => ({
  default: {
    newInstance: vi.fn(() => mocks.renderer),
  },
}));

vi.mock('@kitware/vtk.js/Filters/General/ImageMarchingCubes', () => ({
  default: {
    newInstance: vi.fn(() => {
      const instance = {
        setInputData: vi.fn(),
        getOutputPort: vi.fn(() => ({})),
        delete: vi.fn(),
      };
      mocks.tracked.marching.push(instance);
      return instance;
    }),
  },
}));

import { createThreeDScene } from './threeDScene';

const volume: Volume = {
  seriesUID: 'series-1',
  dimensions: [8, 8, 2],
  spacing: [1, 1, 2],
  origin: [0, 0, 0],
  directionCosines: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  pixelData: new Float32Array(8 * 8 * 2).fill(300),
  windowCenter: 40,
  windowWidth: 400,
};

const structure: Structure = {
  id: 'structure-1',
  name: 'PTV',
  type: 'PTV',
  color: [0, 0, 255],
  contours: [
    {
      referencedSOPInstanceUID: 'sop-1',
      slicePosition: 0,
      isClosed: true,
      points: new Float32Array([1, 1, 0, 4, 1, 0, 4, 4, 0, 1, 4, 0]),
    },
  ],
  isVisible: true,
  isLocked: false,
  volume_cc: 0,
};

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tracked.actors.length = 0;
  mocks.tracked.images.length = 0;
  mocks.tracked.mappers.length = 0;
  mocks.tracked.marching.length = 0;
});

describe('threeDScene lifecycle', () => {
  it('keeps the current camera on subsequent scene refreshes', () => {
    const container = document.createElement('div');
    container.getBoundingClientRect = () =>
      ({ width: 320, height: 240 } as DOMRect);

    const scene = createThreeDScene(container);
    const snapshot = {
      volume,
      showCtSurface: true,
      structures: [{ structure }],
    };

    scene.renderSnapshot(snapshot);
    scene.renderSnapshot(snapshot);

    expect(mocks.renderer.resetCamera).toHaveBeenCalledTimes(1);
  });

  it('disposes the previous vtk pipelines before replacing scene props', () => {
    const container = document.createElement('div');
    container.getBoundingClientRect = () =>
      ({ width: 320, height: 240 } as DOMRect);

    const scene = createThreeDScene(container);
    const snapshot = {
      volume,
      showCtSurface: true,
      structures: [{ structure }],
    };

    scene.renderSnapshot(snapshot);

    const firstActorDeletes = mocks.tracked.actors.slice(0, 2).map((instance) => instance.delete);
    const firstImageDeletes = mocks.tracked.images.slice(0, 2).map((instance) => instance.delete);
    const firstMapperDeletes = mocks.tracked.mappers.slice(0, 2).map((instance) => instance.delete);
    const firstMarchingDeletes = mocks.tracked.marching.slice(0, 2).map((instance) => instance.delete);

    scene.renderSnapshot(snapshot);

    expect(firstActorDeletes.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(firstImageDeletes.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(firstMapperDeletes.every((spy) => spy.mock.calls.length === 1)).toBe(true);
    expect(firstMarchingDeletes.every((spy) => spy.mock.calls.length === 1)).toBe(true);
  });
});
