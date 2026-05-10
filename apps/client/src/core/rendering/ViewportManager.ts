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
let initPromise: Promise<void> | null = null;
const enabledViewportElements = new Map<string, HTMLDivElement>();

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
    if (initPromise) {
      await initPromise;
      return;
    }

    initPromise = (async () => {
      await cornerstoneInit();
      const { RenderingEngine } = await import('@cornerstonejs/core');
      if (!renderingEngine) {
        renderingEngine = new RenderingEngine(ENGINE_ID) as unknown as NonNullable<typeof renderingEngine>;
      }
    })();

    try {
      await initPromise;
    } finally {
      initPromise = null;
    }
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
    if (!renderingEngine) return;

    const existingViewport = renderingEngine.getViewport(viewportId);
    const existingElement = enabledViewportElements.get(viewportId);
    if (existingViewport && existingElement === element) {
      return;
    }

    const { Enums } = await import('@cornerstonejs/core');

    renderingEngine.enableElement({
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
    enabledViewportElements.set(viewportId, element);
  },

  async setVolume(
    viewportId: string,
    volumeId: string
  ): Promise<void> {
    if (!renderingEngine) return;
    const viewport = renderingEngine.getViewport(viewportId);
    if (!viewport) return;

    // Cold-load profiling: setVolumes can block for several seconds when the
    // CT lacks WindowCenter/WindowWidth metadata, because Cornerstone3D's
    // setDefaultVolumeVOI then has to fetch the middle slice and compute
    // min/max. Log per-step timing so we can see exactly where the time goes
    // on a fresh patient load.
    const t0 = performance.now();
    await viewport.setVolumes([
      {
        volumeId,
        callback: (actorInfo) => {
          void actorInfo;
        },
      },
    ], true);
    const tAfterSet = performance.now();
    viewport.resetCamera();
    const tAfterReset = performance.now();
    viewport.render();
    renderingEngine?.renderViewport(viewportId);
    const tAfterRender = performance.now();
    const setMs = Math.round(tAfterSet - t0);
    const resetMs = Math.round(tAfterReset - tAfterSet);
    const renderMs = Math.round(tAfterRender - tAfterReset);
    if (setMs >= 100) {
      // Only emit when the cold path gets hit; warm reloads are fast.
      void import('../debug/clientDebugLog').then(({ logClientDebug }) => {
        logClientDebug(
          'ViewportManager',
          `setVolume ${viewportId} setMs=${setMs} resetMs=${resetMs} renderMs=${renderMs}`
        );
      });
    }
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
    initPromise = null;
    enabledViewportElements.clear();
  },
};

function getVoiRange(preset: WLPreset): { lower: number; upper: number } {
  const { windowCenter, windowWidth } = WINDOW_LEVEL_PRESETS[preset];
  return {
    lower: windowCenter - windowWidth / 2,
    upper: windowCenter + windowWidth / 2,
  };
}
