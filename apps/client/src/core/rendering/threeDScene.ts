import vtkActor from '@kitware/vtk.js/Rendering/Core/Actor';
import vtkAxesActor from '@kitware/vtk.js/Rendering/Core/AxesActor';
import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkInteractorStyleTrackballCamera from '@kitware/vtk.js/Interaction/Style/InteractorStyleTrackballCamera';
import vtkMapper from '@kitware/vtk.js/Rendering/Core/Mapper';
import vtkOpenGLRenderWindow from '@kitware/vtk.js/Rendering/OpenGL/RenderWindow';
import vtkRenderWindow from '@kitware/vtk.js/Rendering/Core/RenderWindow';
import vtkRenderWindowInteractor from '@kitware/vtk.js/Rendering/Core/RenderWindowInteractor';
import vtkRenderer from '@kitware/vtk.js/Rendering/Core/Renderer';
import { logClientDebug } from '../debug/clientDebugLog';
// vtk.js ships this module without a public .d.ts in the version we use.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import vtkImageMarchingCubes from '@kitware/vtk.js/Filters/General/ImageMarchingCubes';
import type { Structure, Volume } from '@webtps/shared-types';
import { buildStructureMaskVolume, downsampleVolume, hasRenderableContours } from './threeDGeometry';

export interface ThreeDStructureLayer {
  structure: Structure;
  opacity?: number;
}

export interface ThreeDSceneSnapshot {
  volume: Volume | null;
  structures: ThreeDStructureLayer[];
}

export interface ThreeDScene {
  renderSnapshot: (snapshot: ThreeDSceneSnapshot) => { structureCount: number; ctReady: boolean };
  resize: () => void;
  resetCamera: () => void;
  rotateCamera: (azimuthDelta: number, elevationDelta?: number) => void;
  setCTVisible: (visible: boolean) => void;
  destroy: () => void;
}

export class GpuUnavailableError extends Error {
  constructor(public readonly reason: string, public readonly rendererName?: string) {
    super(reason);
    this.name = 'GpuUnavailableError';
  }
}

export class ThreeDInitError extends Error {
  constructor(public readonly step: string, cause: unknown) {
    super(`init step "${step}" failed: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'ThreeDInitError';
    if (cause instanceof Error) {
      this.stack = cause.stack;
    }
  }
}

export class GpuContextLostError extends Error {
  constructor() {
    super('WebGL context lost');
    this.name = 'GpuContextLostError';
  }
}

const SOFTWARE_RENDERER_PATTERN = /SwiftShader|llvmpipe|software|Microsoft Basic Render|ANGLE.*SwiftShader/i;

interface GpuProbe {
  rendererName: string;
}

function probeGpu(): GpuProbe {
  const probeCanvas = document.createElement('canvas');
  const gl = probeCanvas.getContext('webgl2') as WebGL2RenderingContext | null;
  if (!gl) {
    throw new GpuUnavailableError('WebGL2 not supported by this browser');
  }
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  const rendererName = debugInfo
    ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) ?? 'unknown')
    : 'renderer-info-blocked';
  if (SOFTWARE_RENDERER_PATTERN.test(rendererName)) {
    throw new GpuUnavailableError(`software-rendered: ${rendererName}`, rendererName);
  }
  return { rendererName };
}

function tryInitStep<T>(step: string, fn: () => T): T {
  try {
    return fn();
  } catch (error) {
    throw new ThreeDInitError(step, error);
  }
}

let nextSceneId = 1;
interface ScenePropHandle {
  actor: ReturnType<typeof vtkActor.newInstance>;
  dispose: () => void;
}

interface CachedPropHandle extends ScenePropHandle {
  key: string;
}

export function createThreeDScene(container: HTMLDivElement): ThreeDScene {
  const sceneId = nextSceneId++;
  const pushDebug = (message: string) => {
    logClientDebug('ThreeDScene', `scene=${sceneId} ${message}`);
  };

  const { rendererName } = probeGpu();
  pushDebug(`gpu ok renderer="${rendererName}"`);

  const renderer = tryInitStep('renderer.newInstance', () =>
    vtkRenderer.newInstance({ background: [0.01, 0.01, 0.01] })
  );
  const renderWindow = tryInitStep('renderWindow.newInstance', () => vtkRenderWindow.newInstance());
  const openGLRenderWindow = tryInitStep('openGLRenderWindow.newInstance', () =>
    vtkOpenGLRenderWindow.newInstance()
  );
  const interactor = tryInitStep('interactor.newInstance', () => vtkRenderWindowInteractor.newInstance());
  const interactorStyle = tryInitStep('interactorStyle.newInstance', () =>
    vtkInteractorStyleTrackballCamera.newInstance()
  );
  const axesActor = tryInitStep('axesActor.newInstance', () => vtkAxesActor.newInstance());

  tryInitStep('setContainer', () => openGLRenderWindow.setContainer(container));

  // Listen for WebGL context loss after vtk.js attaches its canvas. The canvas
  // is appended to `container` by setContainer().
  const canvas = container.querySelector('canvas');
  if (canvas) {
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      pushDebug('webglcontextlost');
      // The next render will throw; consumers see GpuContextLostError via the
      // ResizeObserver / renderSnapshot catch paths.
    }, { once: false });
  }

  tryInitStep('addRenderer', () => renderWindow.addRenderer(renderer));
  tryInitStep('addView', () => renderWindow.addView(openGLRenderWindow));
  tryInitStep('interactor.setView', () => interactor.setView(openGLRenderWindow));
  tryInitStep('interactor.initialize', () => interactor.initialize());
  tryInitStep('interactor.bindEvents', () => interactor.bindEvents(container));
  tryInitStep('interactor.setInteractorStyle', () => interactor.setInteractorStyle(interactorStyle));
  tryInitStep('addActor(axes)', () => renderer.addActor(axesActor));
  tryInitStep('camera.setParallelProjection', () => renderer.getActiveCamera().setParallelProjection(false));
  tryInitStep('setSizeFromContainer', () => setSizeFromContainer(container, openGLRenderWindow));
  pushDebug('create');
  let mountedProps: ScenePropHandle[] = [];
  let hasFramedContent = false;
  const cachedStructureProps = new Map<string, CachedPropHandle>();
  let ctPropHandle: ScenePropHandle | null = null;
  let lastCtSeriesUID: string | null = null;
  let ctActorVisible = true;

  const clearMountedProps = () => {
    if (mountedProps.length > 0) {
      pushDebug(`clear props=${mountedProps.length}`);
    }
    for (const prop of mountedProps) {
      renderer.removeActor(prop.actor);
    }
    mountedProps = [];
  };

  const disposeCachedProp = (prop: CachedPropHandle | null) => {
    if (!prop) return;
    renderer.removeActor(prop.actor);
    prop.dispose();
  };

  return {
    renderSnapshot(snapshot) {
      const startedAt = performance.now();
      clearMountedProps();
      pushDebug(
        `snapshot volume=${snapshot.volume?.seriesUID ?? 'none'} structures=${snapshot.structures.length}`
      );

      // CT context rendering
      let ctReady = false;
      if (snapshot.volume) {
        const nextCtSeriesUID = snapshot.volume.seriesUID;
        if (lastCtSeriesUID !== nextCtSeriesUID) {
          if (ctPropHandle) {
            renderer.removeActor(ctPropHandle.actor);
            ctPropHandle.dispose();
            ctPropHandle = null;
          }
          const handle = createCTActor(snapshot.volume, pushDebug);
          if (handle) {
            ctPropHandle = handle;
            handle.actor.setVisibility(ctActorVisible);
            renderer.addActor(handle.actor);
            lastCtSeriesUID = nextCtSeriesUID;
          }
        }
        ctReady = ctPropHandle !== null;
      }

      let structureCount = 0;
      const activeStructureKeys = new Set<string>();
      for (const layer of snapshot.structures) {
        const structureKey = buildStructureCacheKey(layer.structure, snapshot.volume, layer.opacity ?? 0.72);
        activeStructureKeys.add(structureKey);
        let structureProp = cachedStructureProps.get(structureKey) ?? null;
        if (!structureProp) {
          pushDebug(`structure cache miss id=${layer.structure.id}`);
          structureProp = createStructureActor(
            layer.structure,
            snapshot.volume,
            layer.opacity ?? 0.72,
            pushDebug,
            structureKey
          );
          if (structureProp) {
            cachedStructureProps.set(structureKey, structureProp);
          }
        } else {
          pushDebug(`structure cache hit id=${layer.structure.id}`);
        }
        if (!structureProp) continue;
        renderer.addActor(structureProp.actor);
        mountedProps.push(structureProp);
        structureCount += 1;
      }

      for (const [key, prop] of cachedStructureProps.entries()) {
        if (activeStructureKeys.has(key)) continue;
        disposeCachedProp(prop);
        cachedStructureProps.delete(key);
      }

      const hasSceneContent = structureCount > 0;
      if (hasSceneContent && !hasFramedContent) {
        renderer.resetCamera();
        pushDebug('camera reset for initial framing');
      }
      hasFramedContent = hasSceneContent;
      renderWindow.render();
      const elapsedMs = Math.round(performance.now() - startedAt);
      pushDebug(
        `render ms=${elapsedMs} structureCount=${structureCount} mountedProps=${mountedProps.length} cached_structures=${cachedStructureProps.size}`
      );
      return { structureCount, ctReady };
    },
    resize() {
      setSizeFromContainer(container, openGLRenderWindow);
      // Only re-render if there is content to display; avoids a wasted GPU draw on empty init.
      if (hasFramedContent) {
        renderWindow.render();
      }
    },
    resetCamera() {
      renderer.resetCamera();
      hasFramedContent = true;
      pushDebug('camera reset manual');
      renderWindow.render();
    },
    rotateCamera(azimuthDelta, elevationDelta = 0) {
      const camera = renderer.getActiveCamera();
      if (azimuthDelta !== 0) {
        camera.azimuth(azimuthDelta);
      }
      if (elevationDelta !== 0) {
        camera.elevation(elevationDelta);
        camera.orthogonalizeViewUp();
      }
      renderer.resetCameraClippingRange();
      pushDebug(`camera rotate azimuth=${azimuthDelta} elevation=${elevationDelta}`);
      renderWindow.render();
    },
    setCTVisible(visible: boolean) {
      ctActorVisible = visible;
      if (ctPropHandle) {
        ctPropHandle.actor.setVisibility(visible);
        renderWindow.render();
        pushDebug(`ct visibility=${visible}`);
      }
    },
    destroy() {
      clearMountedProps();
      for (const prop of cachedStructureProps.values()) {
        disposeCachedProp(prop);
      }
      cachedStructureProps.clear();
      if (ctPropHandle) {
        renderer.removeActor(ctPropHandle.actor);
        ctPropHandle.dispose();
        ctPropHandle = null;
      }
      interactor.unbindEvents();
      renderer.removeActor(axesActor);
      renderWindow.removeView(openGLRenderWindow);
      openGLRenderWindow.delete();
      renderer.delete();
      renderWindow.delete();
      interactor.delete();
      axesActor.delete();
      interactorStyle.delete();
      pushDebug('destroy');
    },
  };
}

function buildStructureCacheKey(
  structure: Structure,
  volume: Volume | null,
  opacity: number
): string {
  const contourSig = structure.contours
    .map((c) => `${c.slicePosition}:${c.points.length}`)
    .join(',');
  return [
    volume?.seriesUID ?? 'no-volume',
    structure.id,
    opacity.toFixed(2),
    structure.color.join(','),
    contourSig,
  ].join('::');
}

function createCTActor(volume: Volume, pushDebug: (msg: string) => void): ScenePropHandle | null {
  const startedAt = performance.now();
  try {
    const downsampled = downsampleVolume(volume, 4);
    const imageData = vtkImageData.newInstance();
    imageData.setDimensions(...downsampled.dimensions);
    imageData.setSpacing(downsampled.spacing);
    imageData.setOrigin(downsampled.origin);
    imageData.setDirection(Float64Array.from(downsampled.directionCosines) as unknown as never);
    imageData.getPointData().setScalars(
      vtkDataArray.newInstance({
        name: 'ct-scalars',
        values: downsampled.pixelData,
        numberOfComponents: 1,
      })
    );
    const marchingCubes = vtkImageMarchingCubes.newInstance({
      contourValue: -400,
      computeNormals: true,
      mergePoints: true,
    });
    marchingCubes.setInputData(imageData);
    const mapper = vtkMapper.newInstance();
    mapper.setInputConnection(marchingCubes.getOutputPort());
    const actor = vtkActor.newInstance();
    actor.setMapper(mapper);
    actor.getProperty().setColor(0.85, 0.82, 0.78);
    actor.getProperty().setOpacity(0.12);
    actor.getProperty().setInterpolationToPhong();
    const elapsedMs = Math.round(performance.now() - startedAt);
    pushDebug(`ct actor ms=${elapsedMs} uid=${volume.seriesUID} dims=${downsampled.dimensions.join('x')}`);
    return {
      actor,
      dispose: () => {
        actor.delete();
        mapper.delete();
        marchingCubes.delete();
        imageData.delete();
      },
    };
  } catch (error) {
    pushDebug(`ct actor error ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function setSizeFromContainer(
  container: HTMLDivElement,
  openGLRenderWindow: ReturnType<typeof vtkOpenGLRenderWindow.newInstance>
) {
  const { width, height } = container.getBoundingClientRect();
  openGLRenderWindow.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
}

function createStructureActor(
  structure: Structure,
  volume: Volume | null,
  opacity: number,
  pushDebug: (message: string) => void,
  key: string
): CachedPropHandle | null {
  if (!volume) {
    pushDebug(`structure skip id=${structure.id} reason=no-volume`);
    return null;
  }
  if (!hasRenderableContours(structure)) {
    pushDebug(`structure skip id=${structure.id} reason=no-renderable-contours`);
    return null;
  }
  const startedAt = performance.now();
  const maskVolume = buildStructureMaskVolume(structure, volume);
  if (!maskVolume) {
    pushDebug(`structure skip id=${structure.id} reason=empty-mask`);
    return null;
  }
  const maskMs = Math.round(performance.now() - startedAt);

  const marchingStart = performance.now();
  const imageData = vtkImageData.newInstance();
  imageData.setDimensions(...maskVolume.dimensions);
  imageData.setSpacing(maskVolume.spacing);
  imageData.setOrigin(maskVolume.origin);
  imageData.setDirection(Float64Array.from(maskVolume.directionCosines) as unknown as never);
  imageData.getPointData().setScalars(
    vtkDataArray.newInstance({
      name: `${structure.id}-mask`,
      values: maskVolume.scalars,
      numberOfComponents: 1,
    })
  );

  const marchingCubes = vtkImageMarchingCubes.newInstance({
    contourValue: 0.5,
    computeNormals: true,
    mergePoints: true,
  });
  marchingCubes.setInputData(imageData);

  const mapper = vtkMapper.newInstance();
  mapper.setInputConnection(marchingCubes.getOutputPort());

  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);
  actor.getProperty().setColor(
    structure.color[0] / 255,
    structure.color[1] / 255,
    structure.color[2] / 255
  );
  actor.getProperty().setOpacity(opacity);
  actor.getProperty().setInterpolationToPhong();

  const marchingMs = Math.round(performance.now() - marchingStart);
  const totalMs = Math.round(performance.now() - startedAt);
  pushDebug(
    `structure actor ms=${totalMs} (mask=${maskMs} marching=${marchingMs}) id=${structure.id} contours=${structure.contours.length} mask=${maskVolume.dimensions.join('x')} filled=${maskVolume.filledVoxelCount}`
  );

  return {
    key,
    actor,
    dispose: () => {
      actor.delete();
      mapper.delete();
      marchingCubes.delete();
      imageData.delete();
    },
  };
}
