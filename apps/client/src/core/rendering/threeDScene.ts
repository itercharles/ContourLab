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
  destroy: () => void;
}

const CT_ISO_THRESHOLD_HU = 250;
const CT_DOWNSAMPLE_STRIDE = 2;
let nextSceneId = 1;
interface ScenePropHandle {
  actor: ReturnType<typeof vtkActor.newInstance>;
  dispose: () => void;
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
  let disposableProps: ScenePropHandle[] = [];
  let hasFramedContent = false;

  const clearDisposableProps = () => {
    if (disposableProps.length > 0) {
      pushDebug(`clear props=${disposableProps.length}`);
    }
    for (const prop of disposableProps) {
      renderer.removeActor(prop.actor);
      prop.dispose();
    }
    disposableProps = [];
  };

  return {
    renderSnapshot(snapshot) {
      const startedAt = performance.now();
      pushDebug(
        `render start showCt=${snapshot.showCtSurface} volume=${snapshot.volume ? snapshot.volume.dimensions.join('x') : 'none'} structures=${snapshot.structures.length}`
      );
      clearDisposableProps();

      let ctReady = false;
      if (snapshot.volume && snapshot.showCtSurface && snapshot.volume.pixelData.length > 0) {
        const ctProp = createCtActor(snapshot.volume, pushDebug);
        if (ctProp) {
          renderer.addActor(ctProp.actor);
          disposableProps.push(ctProp);
          ctReady = true;
        }
      }

      let structureCount = 0;
      for (const layer of snapshot.structures) {
        const structureProp = createStructureActor(
          layer.structure,
          snapshot.volume,
          layer.opacity ?? 0.72,
          pushDebug
        );
        if (!structureProp) continue;
        renderer.addActor(structureProp.actor);
        disposableProps.push(structureProp);
        structureCount += 1;
      }

      const hasSceneContent = ctReady || structureCount > 0;
      if (hasSceneContent && !hasFramedContent) {
        renderer.resetCamera();
        pushDebug('camera reset for initial framing');
      }
      hasFramedContent = hasSceneContent;
      renderWindow.render();
      pushDebug(
        `render done ms=${Math.round(performance.now() - startedAt)} ctReady=${ctReady} structureCount=${structureCount}`
      );
      return { ctReady, structureCount };
    },
    resize() {
      pushDebug('resize');
      resizeScene(container, openGLRenderWindow, renderWindow);
    },
    resetCamera() {
      renderer.resetCamera();
      hasFramedContent = true;
      pushDebug('camera reset manual');
      renderWindow.render();
    },
    destroy() {
      clearDisposableProps();
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

function resizeScene(
  container: HTMLDivElement,
  openGLRenderWindow: ReturnType<typeof vtkOpenGLRenderWindow.newInstance>,
  renderWindow: ReturnType<typeof vtkRenderWindow.newInstance>
) {
  const { width, height } = container.getBoundingClientRect();
  openGLRenderWindow.setSize(Math.max(1, Math.floor(width)), Math.max(1, Math.floor(height)));
  renderWindow.render();
}

function createCtActor(volume: Volume, pushDebug: (message: string) => void): ScenePropHandle | null {
  const startedAt = performance.now();
  const sourceVolume = downsampleVolume(volume, CT_DOWNSAMPLE_STRIDE);
  pushDebug(
    `ct actor source=${volume.dimensions.join('x')} downsampled=${sourceVolume.dimensions.join('x')} scalars=${sourceVolume.pixelData.length}`
  );
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
  pushDebug(`ct actor ready ms=${Math.round(performance.now() - startedAt)}`);
  return {
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
  pushDebug: (message: string) => void
): ScenePropHandle | null {
  if (!volume || !hasRenderableContours(structure)) return null;
  const startedAt = performance.now();
  const maskVolume = buildStructureMaskVolume(structure, volume);
  if (!maskVolume) {
    pushDebug(
      `structure skip id=${structure.id} name=${structure.name} contours=${structure.contours.length} reason=empty-mask`
    );
    return null;
  }
  pushDebug(
    `structure actor id=${structure.id} name=${structure.name} contours=${structure.contours.length} mask=${maskVolume.dimensions.join('x')} filled=${maskVolume.filledVoxelCount}`
  );

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
  pushDebug(
    `structure actor ready id=${structure.id} ms=${Math.round(performance.now() - startedAt)}`
  );
  return {
    actor,
    dispose: () => {
      actor.delete();
      mapper.delete();
      marchingCubes.delete();
      imageData.delete();
    },
  };
}
