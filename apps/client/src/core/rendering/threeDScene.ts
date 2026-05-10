// Register vtk.js surface-rendering profile so the render pipeline's pass
// classes are wired up. Without this, Vite tree-shakes the side-effect
// registration in production builds and `interactor.initialize()` fails
// with "Cannot read properties of undefined (reading 'traverse')" the
// first time a render pass is traversed.
import '@kitware/vtk.js/Rendering/Profiles/Geometry';
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
import {
  buildStructureMaskVolume,
  chooseStructureMaskStride,
  deriveStrideVolume,
  downsampleVolume,
  hasRenderableContours,
} from './threeDGeometry';

export interface ThreeDStructureLayer {
  structure: Structure;
  opacity?: number;
}

export interface ThreeDSceneSnapshot {
  volume: Volume | null;
  structures: ThreeDStructureLayer[];
}

export interface ThreeDScene {
  renderSnapshot: (
    snapshot: ThreeDSceneSnapshot,
    options?: { signal?: AbortSignal }
  ) => Promise<{ structureCount: number; ctReady: boolean; cancelled?: boolean }>;
  resize: () => void;
  resetCamera: () => void;
  rotateCamera: (azimuthDelta: number, elevationDelta?: number) => void;
  setCTVisible: (visible: boolean) => void;
  destroy: () => void;
}

// Yield to the browser between heavy work units so paints, input events, and
// 2D viewport rendering can interleave with the synchronous vtk.js work.
// requestIdleCallback is the right primitive — it specifically targets idle
// time after rendering. Falls back to setTimeout(0) for browsers that don't
// expose it (older Safari).
function yieldToMainThread(): Promise<void> {
  return new Promise<void>((resolve) => {
    const ric = typeof window !== 'undefined' ? window.requestIdleCallback : undefined;
    if (typeof ric === 'function') {
      ric(() => resolve(), { timeout: 50 });
    } else {
      setTimeout(resolve, 0);
    }
  });
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

const SOFTWARE_RENDERER_PATTERN = /SwiftShader|llvmpipe|software|Microsoft Basic Render/i;

interface GpuProbe {
  rendererName: string;
  isSoftware: boolean;
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
  // Software rendering is logged (so the deployed workstation can surface it)
  // but not blocked — the existing e2e suite runs on Chromium SwiftShader and
  // legitimately needs the scene to render. The scene's other catch paths
  // surface freezes / errors specifically when they occur.
  return { rendererName, isSoftware: SOFTWARE_RENDERER_PATTERN.test(rendererName) };
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

  const { rendererName, isSoftware } = probeGpu();
  pushDebug(`gpu renderer="${rendererName}" software=${isSoftware}`);

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
    async renderSnapshot(snapshot, options) {
      const signal = options?.signal;
      const startedAt = performance.now();
      const isAborted = () => signal?.aborted === true;

      clearMountedProps();
      pushDebug(
        `snapshot volume=${snapshot.volume?.seriesUID ?? 'none'} structures=${snapshot.structures.length}`
      );

      // CT context rendering. After it lands we yield so the 2D viewports
      // (which already started rendering on this same patient load) get a
      // chance to commit their first frame before we move on to the
      // marching-cubes work for each structure.
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

      await yieldToMainThread();
      if (isAborted()) {
        pushDebug('snapshot cancelled after CT actor');
        return { structureCount: 0, ctReady, cancelled: true };
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
        if (structureProp) {
          renderer.addActor(structureProp.actor);
          mountedProps.push(structureProp);
          structureCount += 1;
        }

        // Yield between structures so input + 2D-viewport paint events can
        // interleave with the synchronous mask + marching-cubes work.
        await yieldToMainThread();
        if (isAborted()) {
          pushDebug(`snapshot cancelled after structure ${structureCount}`);
          // Don't bail entirely — rendering whatever we have is better than a
          // blank scene. Caller decides whether to swap to a follow-up snapshot.
          break;
        }
      }

      for (const [key, prop] of cachedStructureProps.entries()) {
        if (activeStructureKeys.has(key)) continue;
        disposeCachedProp(prop);
        cachedStructureProps.delete(key);
      }

      // Last yield + abort check before the synchronous renderWindow.render().
      // The render itself can't be aborted (vtk.js draws into the WebGL context
      // synchronously) — but if we already know the snapshot is stale we skip
      // the GPU work and let the next snapshot's clearMountedProps drain the
      // actors we just added. The next-snapshot path is the safety net for
      // overlapping renders; this final check is the cheap escape hatch.
      await yieldToMainThread();
      if (isAborted()) {
        pushDebug('snapshot cancelled before final render');
        return { structureCount, ctReady, cancelled: true };
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
      return { structureCount, ctReady, cancelled: isAborted() };
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

// Encode the per-axis direction sign into the spacing we hand to vtk.js.
//
// vtk.js's vtkImageMarchingCubes ignores the imageData's direction matrix and
// computes voxel positions as `origin[a] + index * spacing[a]` (see
// Filters/General/ImageMarchingCubes.js getVoxelPoints). For a HFP / FFS axial
// CT (direction = diag(1, -1, -1) etc.) that places every voxel on the wrong
// side of the volume origin, and the per-actor flip-axis differs between the
// CT image (volume.origin) and each structure mask (each its own mask.origin),
// so each structure ends up with a different offset relative to the CT.
//
// For axis-aligned (diagonal) direction matrices we can fold the per-axis
// sign into the spacing and pass identity direction to vtk.js. Then
// `origin + index * signedSpacing` matches `origin + direction · diag(spacing)
// · index` exactly. Non-diagonal (oblique) volumes still need a transform-
// based fix; this codepath assumes axial CTs which is what the rest of the
// rendering pipeline expects.
// Off-diagonal magnitude above which the volume's direction is treated as
// oblique enough to fall outside the axis-aligned contract. Voxel sizes are
// typically ~1 mm; an off-diagonal of 1e-3 corresponds to a ~0.06° basis
// rotation, well below clinical-relevance.
const OBLIQUE_DIRECTION_EPSILON = 1e-3;
let obliqueDirectionWarned = false;

function getDirectionSignedSpacing(
  spacing: readonly [number, number, number],
  directionCosines: readonly number[]
): [number, number, number] {
  if (directionCosines.length !== 9) return [spacing[0], spacing[1], spacing[2]];
  // Detect oblique direction matrices and warn loudly. The contract here is
  // strictly axis-aligned; tilted-gantry CTs (rare in RT) would silently
  // produce a wrong mesh otherwise. Surface a specific named cause so it
  // ends up in the deployed-workstation debug log alongside the other
  // viewer error messages.
  const offDiagonalMax = Math.max(
    Math.abs(directionCosines[1] ?? 0),
    Math.abs(directionCosines[2] ?? 0),
    Math.abs(directionCosines[3] ?? 0),
    Math.abs(directionCosines[5] ?? 0),
    Math.abs(directionCosines[6] ?? 0),
    Math.abs(directionCosines[7] ?? 0)
  );
  if (offDiagonalMax > OBLIQUE_DIRECTION_EPSILON && !obliqueDirectionWarned) {
    obliqueDirectionWarned = true;
    logClientDebug(
      'ThreeDScene',
      `oblique direction approximated as axis-aligned offDiagMax=${offDiagonalMax.toFixed(4)} ` +
        `direction=[${directionCosines.map((v) => v.toFixed(3)).join(',')}] ` +
        `— 3D meshes will be misregistered until the path is generalised`
    );
    console.warn(
      '[ThreeDScene] Volume direction is non-diagonal (off-diagonal max=%s); ' +
        'getDirectionSignedSpacing approximates as axis-aligned and meshes may misregister.',
      offDiagonalMax.toFixed(4)
    );
  }
  const sx = (directionCosines[0] || 0) >= 0 ? 1 : -1;
  const sy = (directionCosines[4] || 0) >= 0 ? 1 : -1;
  const sz = (directionCosines[8] || 0) >= 0 ? 1 : -1;
  return [sx * spacing[0], sy * spacing[1], sz * spacing[2]];
}

// Identity direction handed to vtkImageData so vtk.js's other code paths (camera
// reset bounds, picking, …) match the signed-spacing geometry we use in
// marching cubes. WARNING: do NOT reuse imageData configured with this constant
// for vtkVolume / vtkImageMapper without first auditing how their bounds and
// VOI handling react to negative spacing — vtkMapper.getBounds() recomputes
// from polydata points so marching-cubes output is fine, but volume-rendering
// paths read renderer-level bounds that derive from imageData.
const IDENTITY_DIRECTION_FLAT = Float64Array.from([1, 0, 0, 0, 1, 0, 0, 0, 1]);

function createCTActor(volume: Volume, pushDebug: (msg: string) => void): ScenePropHandle | null {
  const startedAt = performance.now();
  try {
    const downsampled = downsampleVolume(volume, 4);
    const signedSpacing = getDirectionSignedSpacing(downsampled.spacing, downsampled.directionCosines);
    const imageData = vtkImageData.newInstance();
    imageData.setDimensions(...downsampled.dimensions);
    imageData.setSpacing(signedSpacing);
    imageData.setOrigin(downsampled.origin);
    imageData.setDirection(IDENTITY_DIRECTION_FLAT as unknown as never);
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
  // Big external/skin contours produce 8-10 M-voxel masks, which marching-
  // cubes turns into 1-2 M triangles. On integrated GPUs the upload + first
  // render of that mesh dominates the perceived "load patient" delay (≈8 s
  // out of 10). Drop the stride for those — full-resolution stays the
  // default for the small structures (PTV, OARs, lungs).
  const stride = chooseStructureMaskStride(structure, volume);
  const maskGridVolume = stride > 1 ? deriveStrideVolume(volume, stride) : volume;
  const maskVolume = buildStructureMaskVolume(structure, maskGridVolume);
  if (!maskVolume) {
    pushDebug(`structure skip id=${structure.id} reason=empty-mask`);
    return null;
  }
  const maskMs = Math.round(performance.now() - startedAt);
  if (stride > 1) {
    pushDebug(`structure stride id=${structure.id} stride=${stride} mask=${maskVolume.dimensions.join('x')}`);
  }

  const marchingStart = performance.now();
  const signedSpacing = getDirectionSignedSpacing(maskVolume.spacing, maskVolume.directionCosines);
  const imageData = vtkImageData.newInstance();
  imageData.setDimensions(...maskVolume.dimensions);
  imageData.setSpacing(signedSpacing);
  imageData.setOrigin(maskVolume.origin);
  imageData.setDirection(IDENTITY_DIRECTION_FLAT as unknown as never);
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
