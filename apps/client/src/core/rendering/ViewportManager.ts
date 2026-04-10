import type { WLPreset } from '../store/uiStore';
import { cornerstoneInit } from './cornerstoneInit';
import { WINDOW_LEVEL_PRESETS } from './WindowLevelPresets';

export type OrthographicOrientation = 'AXIAL' | 'SAGITTAL' | 'CORONAL';

const ENGINE_ID = 'webtps-rendering-engine';

let renderingEngine: {
  enableElement: (cfg: object) => void;
  getViewport: (id: string) => ViewportLike | undefined;
  renderViewport: (id: string) => void;
  resize: () => void;
  destroy: () => void;
} | null = null;

interface ViewportLike {
  setVolumes: (
    vols: Array<{ volumeId: string; callback?: (p: unknown) => void }>,
    immediate?: boolean
  ) => Promise<void>;
  setProperties: (props: { voiRange?: { lower: number; upper: number } }) => void;
  render: () => void;
  resize: () => void;
  resetCamera: () => void;
}

export const ViewportManager = {
  async init(): Promise<void> {
    if (renderingEngine) return;
    await cornerstoneInit();
    const { RenderingEngine } = await import('@cornerstonejs/core');
    renderingEngine = new RenderingEngine(ENGINE_ID) as unknown as NonNullable<typeof renderingEngine>;
  },

  getRenderingEngine() {
    return renderingEngine;
  },

  async enableElement(
    viewportId: string,
    element: HTMLDivElement,
    orientation: OrthographicOrientation
  ): Promise<void> {
    if (!renderingEngine) await this.init();
    const { Enums } = await import('@cornerstonejs/core');

    renderingEngine!.enableElement({
      viewportId,
      type: Enums.ViewportType.ORTHOGRAPHIC,
      element,
      defaultOptions: {
        orientation:
          orientation === 'AXIAL'
            ? Enums.OrientationAxis.AXIAL
            : orientation === 'SAGITTAL'
              ? Enums.OrientationAxis.SAGITTAL
              : Enums.OrientationAxis.CORONAL,
        background: [0, 0, 0] as [number, number, number],
      },
    });
  },

  async setVolume(
    viewportId: string,
    volumeId: string
  ): Promise<void> {
    if (!renderingEngine) return;
    const viewport = renderingEngine.getViewport(viewportId);
    if (!viewport) return;

    await viewport.setVolumes([
      {
        volumeId,
        callback: (actorInfo) => {
          void actorInfo;
        },
      },
    ], true);
    viewport.resetCamera();
    viewport.render();
    renderingEngine?.renderViewport(viewportId);
  },

  setWindowLevel(viewportId: string, preset: WLPreset): void {
    if (!renderingEngine) return;
    const viewport = renderingEngine.getViewport(viewportId);
    if (!viewport) return;
    const { lower, upper } = getVoiRange(preset);
    viewport.setProperties({ voiRange: { lower, upper } });
    viewport.render();
  },

  resizeViewport(viewportId: string): void {
    if (!renderingEngine) return;
    const viewport = renderingEngine.getViewport(viewportId);
    viewport?.resize();
  },

  resize(): void {
    renderingEngine?.resize();
  },

  destroy(): void {
    renderingEngine?.destroy();
    renderingEngine = null;
  },
};

function getVoiRange(preset: WLPreset): { lower: number; upper: number } {
  const { windowCenter, windowWidth } = WINDOW_LEVEL_PRESETS[preset];
  return {
    lower: windowCenter - windowWidth / 2,
    upper: windowCenter + windowWidth / 2,
  };
}
