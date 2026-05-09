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
import { buildStructureMaskVolume, hasRenderableContours } from './threeDGeometry';

export interface ThreeDStructureLayer {
  structure: Structure;
  opacity?: number;
}

export interface ThreeDSceneSnapshot {
  volume: Volume | null;
  structures: ThreeDStructureLayer[];
}

export interface ThreeDScene {
  renderSnapshot: (snapshot: ThreeDSceneSnapshot) => { structureCount: number };
  resize: () => void;
  resetCamera: () => void;
  rotateCamera: (azimuthDelta: number, elevationDelta?: number) => void;
  destroy: () => void;
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
  setSizeFromContainer(container, openGLRenderWindow);
  pushDebug('create');
  let mountedProps: ScenePropHandle[] = [];
  let hasFramedContent = false;
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
      pushDebug(
        `snapshot volume=${snapshot.volume?.seriesUID ?? 'none'} structures=${snapshot.structures.length}`
      );

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
      return { structureCount };
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
    destroy() {
      clearMountedProps();
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
