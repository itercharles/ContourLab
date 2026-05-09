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
  showCtSurface: boolean;
  structures: ThreeDStructureLayer[];
}

export interface ThreeDScene {
  renderSnapshot: (snapshot: ThreeDSceneSnapshot) => { ctReady: boolean; structureCount: number };
  resize: () => void;
  resetCamera: () => void;
  rotateCamera: (azimuthDelta: number, elevationDelta?: number) => void;
  destroy: () => void;
}

const CT_ISO_THRESHOLD_HU = 250;
const CT_DOWNSAMPLE_STRIDE = 2;
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
  const renderer = vtkRenderer.newInstance({
    background: [0.01, 0.01, 0.01],
  });
  const renderWindow = vtkRenderWindow.newInstance();
  const openGLRenderWindow = vtkOpenGLRenderWindow.newInstance();
  const interactor = vtkRenderWindowInteractor.newInstance();
  const interactorStyle = vtkInteractorStyleTrackballCamera.newInstance();
  const axesActor = vtkAxesActor.newInstance();

  openGLRenderWindow.setContainer(container);
  renderWindow.addRenderer(renderer);
  renderWindow.addView(openGLRenderWindow);
  interactor.setView(openGLRenderWindow);
  interactor.initialize();
  interactor.bindEvents(container);
  interactor.setInteractorStyle(interactorStyle);
  renderer.addActor(axesActor);
  renderer.getActiveCamera().setParallelProjection(false);
  resizeScene(container, openGLRenderWindow, renderWindow);
  pushDebug('create');
  let mountedProps: ScenePropHandle[] = [];
  let hasFramedContent = false;
  let cachedCtProp: CachedPropHandle | null = null;
  const cachedStructureProps = new Map<string, CachedPropHandle>();

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

      let ctReady = false;
      if (snapshot.volume && snapshot.showCtSurface && snapshot.volume.pixelData.length > 0) {
        const ctKey = buildCtCacheKey(snapshot.volume);
        let ctProp = cachedCtProp;
        if (!ctProp || ctProp.key !== ctKey) {
          disposeCachedProp(cachedCtProp);
          ctProp = createCtActor(snapshot.volume, pushDebug, ctKey);
          cachedCtProp = ctProp;
        }
        if (ctProp) {
          renderer.addActor(ctProp.actor);
          mountedProps.push(ctProp);
          ctReady = true;
        }
      }

      let structureCount = 0;
      const activeStructureKeys = new Set<string>();
      for (const layer of snapshot.structures) {
        const structureKey = buildStructureCacheKey(layer.structure, snapshot.volume, layer.opacity ?? 0.72);
        activeStructureKeys.add(structureKey);
        let structureProp = cachedStructureProps.get(structureKey) ?? null;
        if (!structureProp) {
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

      const hasSceneContent = ctReady || structureCount > 0;
      if (hasSceneContent && !hasFramedContent) {
        renderer.resetCamera();
        pushDebug('camera reset for initial framing');
      }
      hasFramedContent = hasSceneContent;
      renderWindow.render();
      const elapsedMs = Math.round(performance.now() - startedAt);
      if (elapsedMs >= 80) {
        pushDebug(`render slow ms=${elapsedMs} ctReady=${ctReady} structureCount=${structureCount}`);
      }
      return { ctReady, structureCount };
    },
    resize() {
      resizeScene(container, openGLRenderWindow, renderWindow);
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
    destroy() {
      clearMountedProps();
      disposeCachedProp(cachedCtProp);
      cachedCtProp = null;
      for (const prop of cachedStructureProps.values()) {
        disposeCachedProp(prop);
      }
      cachedStructureProps.clear();
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

function buildCtCacheKey(volume: Volume): string {
  return [
    volume.seriesUID,
    volume.dimensions.join('x'),
    volume.spacing.join(','),
    volume.origin.join(','),
    volume.pixelData.length,
  ].join('::');
}

function buildStructureCacheKey(
  structure: Structure,
  volume: Volume | null,
  opacity: number
): string {
  const firstContour = structure.contours[0];
  const lastContour = structure.contours[structure.contours.length - 1];
  return [
    volume?.seriesUID ?? 'no-volume',
    structure.id,
    opacity.toFixed(2),
    structure.color.join(','),
    structure.contours.length,
    firstContour?.slicePosition ?? 'none',
    lastContour?.slicePosition ?? 'none',
    firstContour?.points.length ?? 0,
    lastContour?.points.length ?? 0,
  ].join('::');
}

function resizeScene(
  container: HTMLDivElement,
  openGLRenderWindow: ReturnType<typeof vtkOpenGLRenderWindow.newInstance>,
  renderWindow: ReturnType<typeof vtkRenderWindow.newInstance>
) {
  const { width, height } = container.getBoundingClientRect();
  openGLRenderWindow.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
  renderWindow.render();
}

function createCtActor(
  volume: Volume,
  pushDebug: (message: string) => void,
  key: string
): CachedPropHandle | null {
  const startedAt = performance.now();
  const sourceVolume = downsampleVolume(volume, CT_DOWNSAMPLE_STRIDE);
  const imageData = vtkImageData.newInstance();
  imageData.setDimensions(...sourceVolume.dimensions);
  imageData.setSpacing(sourceVolume.spacing);
  imageData.setOrigin(sourceVolume.origin);
  imageData.setDirection(Float64Array.from(sourceVolume.directionCosines) as unknown as never);
  imageData.getPointData().setScalars(
    vtkDataArray.newInstance({
      name: 'ct-scalars',
      values: sourceVolume.pixelData,
      numberOfComponents: 1,
    })
  );

  const marchingCubes = vtkImageMarchingCubes.newInstance({
    contourValue: CT_ISO_THRESHOLD_HU,
    computeNormals: true,
    mergePoints: true,
  });
  marchingCubes.setInputData(imageData);
  const mapper = vtkMapper.newInstance();
  mapper.setInputConnection(marchingCubes.getOutputPort());

  const actor = vtkActor.newInstance();
  actor.setMapper(mapper);
  actor.getProperty().setColor(0.85, 0.87, 0.92);
  actor.getProperty().setOpacity(0.18);
  actor.getProperty().setInterpolationToPhong();
  const elapsedMs = Math.round(performance.now() - startedAt);
  if (elapsedMs >= 40) {
    pushDebug(
      `ct actor slow ms=${elapsedMs} source=${volume.dimensions.join('x')} downsampled=${sourceVolume.dimensions.join('x')} scalars=${sourceVolume.pixelData.length}`
    );
  }
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

function createStructureActor(
  structure: Structure,
  volume: Volume | null,
  opacity: number,
  pushDebug: (message: string) => void,
  key: string
): CachedPropHandle | null {
  if (!volume || !hasRenderableContours(structure)) return null;
  const startedAt = performance.now();
  const maskVolume = buildStructureMaskVolume(structure, volume);
  if (!maskVolume) {
    return null;
  }

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
  const elapsedMs = Math.round(performance.now() - startedAt);
  if (elapsedMs >= 40) {
    pushDebug(
      `structure actor slow id=${structure.id} ms=${elapsedMs} contours=${structure.contours.length} mask=${maskVolume.dimensions.join('x')} filled=${maskVolume.filledVoxelCount}`
    );
  }
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
