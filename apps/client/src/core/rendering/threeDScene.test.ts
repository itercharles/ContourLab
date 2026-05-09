import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Structure, Volume } from '@webtps/shared-types';

const mocks = vi.hoisted(() => {
  const camera = {
    setParallelProjection: vi.fn(),
    azimuth: vi.fn(),
    elevation: vi.fn(),
    orthogonalizeViewUp: vi.fn(),
  };
  const renderer = {
    addActor: vi.fn(),
    removeActor: vi.fn(),
    getActiveCamera: vi.fn(() => camera),
    resetCamera: vi.fn(),
    resetCameraClippingRange: vi.fn(),
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
    camera,
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
  mocks.camera.azimuth.mockClear();
  mocks.camera.elevation.mockClear();
  mocks.camera.orthogonalizeViewUp.mockClear();
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

    const firstCtActorDelete = mocks.tracked.actors[0].delete;
    const firstStructureActorDelete = mocks.tracked.actors[1].delete;
    const firstCtImageDelete = mocks.tracked.images[0].delete;
    const firstStructureImageDelete = mocks.tracked.images[1].delete;
    const firstCtMapperDelete = mocks.tracked.mappers[0].delete;
    const firstStructureMapperDelete = mocks.tracked.mappers[1].delete;
    const firstCtMarchingDelete = mocks.tracked.marching[0].delete;
    const firstStructureMarchingDelete = mocks.tracked.marching[1].delete;

    const changedSnapshot = {
      ...snapshot,
      structures: [
        {
          structure: {
            ...structure,
            contours: [
              ...structure.contours,
              {
                referencedSOPInstanceUID: 'sop-2',
                slicePosition: 1,
                isClosed: true,
                points: new Float32Array([1, 1, 1, 4, 1, 1, 4, 4, 1, 1, 4, 1]),
              },
            ],
          },
        },
      ],
    };

    scene.renderSnapshot(changedSnapshot);

    expect(firstCtActorDelete).not.toHaveBeenCalled();
    expect(firstCtImageDelete).not.toHaveBeenCalled();
    expect(firstCtMapperDelete).not.toHaveBeenCalled();
    expect(firstCtMarchingDelete).not.toHaveBeenCalled();
    expect(firstStructureActorDelete).toHaveBeenCalledTimes(1);
    expect(firstStructureImageDelete).toHaveBeenCalledTimes(1);
    expect(firstStructureMapperDelete).toHaveBeenCalledTimes(1);
    expect(firstStructureMarchingDelete).toHaveBeenCalledTimes(1);
  });

  it('reuses vtk pipelines for identical snapshots', () => {
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
    const actorCountAfterFirstRender = mocks.tracked.actors.length;
    const imageCountAfterFirstRender = mocks.tracked.images.length;

    scene.renderSnapshot(snapshot);

    expect(mocks.tracked.actors.length).toBe(actorCountAfterFirstRender);
    expect(mocks.tracked.images.length).toBe(imageCountAfterFirstRender);
  });

  it('rotates the camera explicitly when requested', () => {
    const container = document.createElement('div');
    container.getBoundingClientRect = () =>
      ({ width: 320, height: 240 } as DOMRect);

    const scene = createThreeDScene(container);
    scene.rotateCamera(15, -10);

    expect(mocks.camera.azimuth).toHaveBeenCalledWith(15);
    expect(mocks.camera.elevation).toHaveBeenCalledWith(-10);
    expect(mocks.camera.orthogonalizeViewUp).toHaveBeenCalledTimes(1);
    expect(mocks.renderer.resetCameraClippingRange).toHaveBeenCalledTimes(1);
    expect(mocks.renderWindow.render).toHaveBeenCalled();
  });
});
