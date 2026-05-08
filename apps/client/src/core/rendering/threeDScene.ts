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

export function createThreeDScene(container: HTMLDivElement): ThreeDScene {
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

  return {
    renderSnapshot(snapshot) {
      renderer.removeAllViewProps();
      renderer.addActor(axesActor);

      let ctReady = false;
      if (snapshot.volume && snapshot.showCtSurface && snapshot.volume.pixelData.length > 0) {
        const ctActor = createCtActor(snapshot.volume);
        if (ctActor) {
          renderer.addActor(ctActor);
          ctReady = true;
        }
      }

      let structureCount = 0;
      for (const layer of snapshot.structures) {
        const actor = createStructureActor(layer.structure, snapshot.volume, layer.opacity ?? 0.72);
        if (!actor) continue;
        renderer.addActor(actor);
        structureCount += 1;
      }

      renderer.resetCamera();
      renderWindow.render();
      return { ctReady, structureCount };
    },
    resize() {
      resizeScene(container, openGLRenderWindow, renderWindow);
    },
    resetCamera() {
      renderer.resetCamera();
      renderWindow.render();
    },
    destroy() {
      interactor.unbindEvents();
      renderWindow.removeView(openGLRenderWindow);
      openGLRenderWindow.delete();
      renderer.delete();
      renderWindow.delete();
      interactor.delete();
      axesActor.delete();
      interactorStyle.delete();
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

function createCtActor(volume: Volume) {
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
  return actor;
}

function createStructureActor(structure: Structure, volume: Volume | null, opacity: number) {
  if (!volume || !hasRenderableContours(structure)) return null;
  const maskVolume = buildStructureMaskVolume(structure, volume);
  if (!maskVolume) return null;

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
  return actor;
}
