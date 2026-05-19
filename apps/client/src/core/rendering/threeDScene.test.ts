import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Structure, Volume } from '@contourlab/shared-types';

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
        setVisibility: vi.fn(),
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

  // Stub WebGL2 capability so the GPU pre-flight check in createThreeDScene
  // succeeds under jsdom. The scene's vtk pipeline is fully mocked above.
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    getExtension: () => ({ UNMASKED_RENDERER_WEBGL: 0x9246 }),
    getParameter: () => 'TestGPU NVIDIA',
  })) as unknown as typeof HTMLCanvasElement.prototype.getContext;
});

describe('threeDScene lifecycle', () => {
  it('keeps the current camera on subsequent scene refreshes', async () => {
    const container = document.createElement('div');
    container.getBoundingClientRect = () =>
      ({ width: 320, height: 240 } as DOMRect);

    const scene = createThreeDScene(container);
    const snapshot = {
      volume,
      structures: [{ structure }],
    };

    await scene.renderSnapshot(snapshot);
    await scene.renderSnapshot(snapshot);

    expect(mocks.renderer.resetCamera).toHaveBeenCalledTimes(1);
  });

  it('disposes the previous vtk pipelines before replacing scene props', async () => {
    const container = document.createElement('div');
    container.getBoundingClientRect = () =>
      ({ width: 320, height: 240 } as DOMRect);

    const scene = createThreeDScene(container);
    const snapshot = {
      volume,
      structures: [{ structure }],
    };

    await scene.renderSnapshot(snapshot);

    // CT actor is at index 0; structure actor is at index 1.
    const firstStructureActorDelete = mocks.tracked.actors[1].delete;
    const firstStructureImageDelete = mocks.tracked.images[1].delete;
    const firstStructureMapperDelete = mocks.tracked.mappers[1].delete;
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

    await scene.renderSnapshot(changedSnapshot);

    expect(firstStructureActorDelete).toHaveBeenCalledTimes(1);
    expect(firstStructureImageDelete).toHaveBeenCalledTimes(1);
    expect(firstStructureMapperDelete).toHaveBeenCalledTimes(1);
    expect(firstStructureMarchingDelete).toHaveBeenCalledTimes(1);
  });

  it('reuses vtk pipelines for identical snapshots', async () => {
    const container = document.createElement('div');
    container.getBoundingClientRect = () =>
      ({ width: 320, height: 240 } as DOMRect);

    const scene = createThreeDScene(container);
    const snapshot = {
      volume,
      structures: [{ structure }],
    };

    await scene.renderSnapshot(snapshot);
    const actorCountAfterFirstRender = mocks.tracked.actors.length;
    const imageCountAfterFirstRender = mocks.tracked.images.length;

    await scene.renderSnapshot(snapshot);

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

  // vtk.js's vtkImageMarchingCubes ignores the imageData direction matrix and
  // computes voxel positions as `origin + index * spacing`. For HFP / FFP /
  // FFS volumes the volume's K and/or J basis vectors point in -Z and -Y, so
  // unsigned spacing places every mesh on the wrong side of the origin and
  // each per-structure mask flips around its own origin — producing a
  // different per-structure offset relative to the CT mesh. Lock down the
  // signed-spacing fix that compensates for this.
  it('passes direction-signed spacing to vtk.js for HFP-style flipped volumes', async () => {
    // HFP-style direction: K basis = -Z, J basis = -Y. With origin Z=2 and
    // spacing[2]=2 and dimZ=2, world Z range is [0, 2]. Place the contour at
    // Z=2 (top slice K=0) so worldToContinuousVoxel keeps it inside the
    // volume and the structure mask is non-empty.
    const hfpVolume: Volume = {
      ...volume,
      origin: [0, 6, 2],
      directionCosines: [1, 0, 0, 0, -1, 0, 0, 0, -1],
    };
    const hfpStructure: Structure = {
      ...structure,
      contours: [
        {
          referencedSOPInstanceUID: 'sop-1',
          slicePosition: 2,
          isClosed: true,
          points: new Float32Array([1, 1, 2, 4, 1, 2, 4, 4, 2, 1, 4, 2]),
        },
      ],
    };
    const container = document.createElement('div');
    container.getBoundingClientRect = () =>
      ({ width: 320, height: 240 } as DOMRect);

    const scene = createThreeDScene(container);
    await scene.renderSnapshot({ volume: hfpVolume, structures: [{ structure: hfpStructure }] });

    // First image is the CT actor's data, second is the structure mask. The
    // tracked mock array's element type only exposes `delete`; the rest of
    // the methods (setSpacing/setDirection/...) are added at newInstance
    // time, so cast through `unknown` to read them off.
    type ImageMock = {
      setSpacing: ReturnType<typeof vi.fn>;
      setDirection: ReturnType<typeof vi.fn>;
    };
    const ctImage = mocks.tracked.images[0] as unknown as ImageMock;
    const structureImage = mocks.tracked.images[1] as unknown as ImageMock;

    expect(ctImage.setSpacing).toHaveBeenCalledWith([
      1 * 4, // sx · 1, then ×stride (4) from downsampleVolume
      -1 * 4, // sy flipped (J basis = -Y)
      -2 * 4, // sz flipped (K basis = -Z)
    ]);
    // Identity direction so vtk.js's other code paths don't double-rotate the
    // signed-spacing geometry.
    const ctDirectionArg = ctImage.setDirection.mock.calls[0][0];
    expect(Array.from(ctDirectionArg as Float64Array)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);

    expect(structureImage.setSpacing).toHaveBeenCalledWith([1, -1, -2]);
  });
});
