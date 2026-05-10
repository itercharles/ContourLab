import { Component, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ViewportManager } from '../../core/rendering/ViewportManager';
import { MPRController, VIEWPORT_IDS } from '../../core/rendering/MPRController';
import { useVolumeStore } from '../../core/store/volumeStore';
import { useUIStore } from '../../core/store/uiStore';
import { logClientDebug } from '../../core/debug/clientDebugLog';
import ContourOverlay from './ContourOverlay';
import ToolOptions from './ToolOptions';
import ViewportContextMenu from './ViewportContextMenu';
import ThreeDViewport from './ThreeDViewport';

class ContourErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(err: unknown) { console.error('ContourOverlay error:', err); }
  render() { return this.state.failed ? null : this.props.children; }
}

interface ViewportPanelProps {
  id: string;
  label: string;
  orientation: 'AXIAL' | 'SAGITTAL' | 'CORONAL';
  onReady: (id: string, el: HTMLDivElement) => void;
}

interface InteractiveViewportLike {
  getZoom?: () => number;
  setZoom?: (value: number) => void;
  scroll?: (delta: number) => void;
  render?: () => void;
}

function ViewportPanel({ id, label, orientation, onReady }: ViewportPanelProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const [viewportElement, setViewportElement] = useState<HTMLDivElement | null>(null);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const activeViewport = useUIStore((s) => s.activeViewport);
  const setActiveViewport = useUIStore((s) => s.setActiveViewport);
  const maximizedViewport = useUIStore((s) => s.maximizedViewport);
  const toggleMaximizeViewport = useUIStore((s) => s.toggleMaximizeViewport);

  const isActive = activeViewport === orientation;
  const isMaximized = maximizedViewport === orientation;

  useEffect(() => {
    if (elRef.current) {
      setViewportElement(elRef.current);
      onReady(id, elRef.current);
    }
  }, [id, onReady]);

  useEffect(() => {
    const element = elRef.current;
    if (!element) return;

    const handleWheel = (event: WheelEvent) => {
      const viewport = ViewportManager.getRenderingEngine()?.getViewport(id) as
        | InteractiveViewportLike
        | undefined;
      if (!viewport) return;

      event.preventDefault();

      if (event.ctrlKey || event.metaKey) {
        const currentZoom = viewport.getZoom?.();
        if (!currentZoom || !viewport.setZoom) return;

        const factor = event.deltaY < 0 ? 1.12 : 0.9;
        viewport.setZoom(currentZoom * factor);
        viewport.render?.();
        return;
      }

      viewport.scroll?.(event.deltaY > 0 ? 1 : -1);
      viewport.render?.();
    };

    element.addEventListener('wheel', handleWheel, { passive: false });
    return () => element.removeEventListener('wheel', handleWheel);
  }, [id]);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  return (
    <div
      className={`relative bg-black overflow-hidden ${isActive ? 'ring-1 ring-blue-500' : ''}`}
      onClick={() => setActiveViewport(orientation)}
      onContextMenu={handleContextMenu}
    >
      <div
        ref={elRef}
        data-viewport-id={id}
        className="w-full h-full"
      />
      <ContourErrorBoundary>
        <ContourOverlay
          viewportId={id}
          viewportElement={viewportElement}
          orientation={orientation}
        />
      </ContourErrorBoundary>
      <span className="absolute top-1 left-1 text-[10px] font-mono text-[#f97316] bg-black/50 px-1 py-0.5 pointer-events-none select-none z-10">
        {label}
      </span>
      {contextMenu && (
        <ViewportContextMenu
          orientation={orientation}
          isMaximized={isMaximized}
          onMaximize={toggleMaximizeViewport}
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}

export default function ImageViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeSeriesUID = useVolumeStore((s) => s.activeSeriesUID);
  const loadedSeries = useVolumeStore((s) => s.loadedSeries);
  const windowLevelPreset = useUIStore((s) => s.windowLevelPreset);
  const maximizedViewport = useUIStore((s) => s.maximizedViewport);
  const resetMaximizeViewport = useUIStore((s) => s.resetMaximizeViewport);
  const crosshairsEnabled = useUIStore((s) => s.crosshairsEnabled);
  const [viewportsReady, setViewportsReady] = useState(false);

  // Track whether we've set up the tool group yet
  const setupDone = useRef(false);
  const readyViewportIds = useRef(new Set<string>());
  const prevActiveSeriesUID = useRef<string | null>(null);

  const pushDebugEvent = useCallback((message: string) => {
    logClientDebug('ImageViewer', message);
  }, []);

  const handleViewportReady = useCallback(async (id: string, el: HTMLDivElement): Promise<boolean> => {
    try {
      await ViewportManager.init();
      const existingViewport = ViewportManager.getRenderingEngine()?.getViewport(id);
      if (existingViewport) {
        return true;
      }

      const orientation = id === VIEWPORT_IDS.AXIAL
        ? 'AXIAL'
        : id === VIEWPORT_IDS.SAGITTAL
          ? 'SAGITTAL'
          : 'CORONAL';
      await ViewportManager.enableElement(id, el, orientation as 'AXIAL' | 'SAGITTAL' | 'CORONAL');
      return true;
    } catch (err) {
      const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      pushDebugEvent(`ready:error ${id} ${message}`);
      console.error(`Failed to enable viewport ${id}:`, err);
      return false;
    }
  }, [pushDebugEvent]);

  // After all three viewports are ready, set up tool group once
  const onReady = useCallback(async (id: string, el: HTMLDivElement) => {
    const ok = await handleViewportReady(id, el);
    if (!ok) return;

    readyViewportIds.current.add(id);
    if (readyViewportIds.current.size === 3 && !setupDone.current) {
      setupDone.current = true;
      try {
        // MPRController.setup requires a volumeId; pass empty string for initial setup
        // It will be re-called when a volume is loaded
        await MPRController.setup('');
        if (crosshairsEnabled) {
          await MPRController.enableCrosshairs();
        }
        pushDebugEvent('toolgroup:setup');
        setViewportsReady(true);
      } catch (err) {
        const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        pushDebugEvent(`toolgroup:error ${message}`);
        console.error('MPRController setup failed:', err);
      }
    }
  }, [handleViewportReady, pushDebugEvent]);

  // When active series changes, load volume into viewports
  useEffect(() => {
    if (!viewportsReady) return;
    if (!activeSeriesUID) return;

    const series = loadedSeries.find((s) => s.seriesUID === activeSeriesUID);
    if (!series) return;

    const volumeId = series.cornerstoneVolumeId;

    const applyVolume = async () => {
      const t0 = performance.now();
      try {
        pushDebugEvent(`volume:start ${volumeId}`);
        // Re-setup tool group with the actual volume id
        await MPRController.setup(volumeId);
        if (crosshairsEnabled) {
          await MPRController.enableCrosshairs();
        }
        const tToolgroup = performance.now();
        pushDebugEvent(`volume:toolgroup ${volumeId} ms=${Math.round(tToolgroup - t0)}`);

        await Promise.all([
          ViewportManager.setVolume(VIEWPORT_IDS.AXIAL, volumeId),
          ViewportManager.setVolume(VIEWPORT_IDS.SAGITTAL, volumeId),
          ViewportManager.setVolume(VIEWPORT_IDS.CORONAL, volumeId),
        ]);
        const tSetVolume = performance.now();
        ViewportManager.setWindowLevel(VIEWPORT_IDS.AXIAL, windowLevelPreset);
        ViewportManager.setWindowLevel(VIEWPORT_IDS.SAGITTAL, windowLevelPreset);
        ViewportManager.setWindowLevel(VIEWPORT_IDS.CORONAL, windowLevelPreset);
        pushDebugEvent(
          `volume:done ${volumeId} setVolume=${Math.round(tSetVolume - tToolgroup)} total=${Math.round(performance.now() - t0)}`
        );

        // Time-to-first-paint per 2D viewport. setVolume returns once the
        // actor is wired up, but the GPU 3D-texture upload + first MPR
        // composition happens asynchronously after — that is the wall-clock
        // delay the user perceives as "TSC views are slow". Listen for
        // CORNERSTONE_IMAGE_RENDERED on each viewport DOM element exactly
        // once and log the elapsed time, so we have an objective
        // measurement of where the load goes.
        for (const id of [VIEWPORT_IDS.AXIAL, VIEWPORT_IDS.SAGITTAL, VIEWPORT_IDS.CORONAL] as const) {
          const element = document.querySelector(`[data-viewport-id="${id}"]`) as HTMLDivElement | null;
          if (!element) continue;
          const onFirstRender = () => {
            const elapsed = Math.round(performance.now() - t0);
            pushDebugEvent(`viewport:first-paint ${id} ms=${elapsed}`);
            element.removeEventListener('CORNERSTONE_IMAGE_RENDERED', onFirstRender);
          };
          element.addEventListener('CORNERSTONE_IMAGE_RENDERED', onFirstRender);
        }
      } catch (err) {
        const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
        pushDebugEvent(`volume:error ${volumeId} ${message}`);
        console.error('Failed to set volume on viewports:', err);
      }
    };

    void applyVolume();
  }, [activeSeriesUID, crosshairsEnabled, loadedSeries, viewportsReady, windowLevelPreset]);

  // ResizeObserver on the container
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver(() => {
      ViewportManager.resize();
    });
    observer.observe(el);

    return () => observer.disconnect();
  }, []);

  // Reset maximize state when active series changes (patient changes)
  useEffect(() => {
    if (activeSeriesUID && activeSeriesUID !== prevActiveSeriesUID.current) {
      resetMaximizeViewport();
    }
    prevActiveSeriesUID.current = activeSeriesUID;
  }, [activeSeriesUID, resetMaximizeViewport]);

  // Handle Escape key to reset maximize state
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && maximizedViewport) {
        resetMaximizeViewport();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [maximizedViewport, resetMaximizeViewport]);

  useEffect(() => {
    return () => {
      readyViewportIds.current.clear();
      setupDone.current = false;
      MPRController.destroy();
      ViewportManager.destroy();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-full flex-1 bg-[var(--color-border)] focus:outline-none"
      tabIndex={0}
    >
      <ToolOptions />
      {maximizedViewport ? (
        <div className="flex h-full gap-[1px]">
          {maximizedViewport === 'AXIAL' && (
            <ViewportPanel
              id={VIEWPORT_IDS.AXIAL}
              label="AXIAL"
              orientation="AXIAL"
              onReady={onReady}
            />
          )}
          {maximizedViewport === 'SAGITTAL' && (
            <ViewportPanel
              id={VIEWPORT_IDS.SAGITTAL}
              label="SAGITTAL"
              orientation="SAGITTAL"
              onReady={onReady}
            />
          )}
          {maximizedViewport === 'CORONAL' && (
            <ViewportPanel
              id={VIEWPORT_IDS.CORONAL}
              label="CORONAL"
              orientation="CORONAL"
              onReady={onReady}
            />
          )}
        </div>
      ) : (
        <div className="grid h-full grid-cols-2 grid-rows-2 gap-[1px]">
          <ViewportPanel
            id={VIEWPORT_IDS.AXIAL}
            label="AXIAL"
            orientation="AXIAL"
            onReady={onReady}
          />
          <ViewportPanel
            id={VIEWPORT_IDS.SAGITTAL}
            label="SAGITTAL"
            orientation="SAGITTAL"
            onReady={onReady}
          />
          <ViewportPanel
            id={VIEWPORT_IDS.CORONAL}
            label="CORONAL"
            orientation="CORONAL"
            onReady={onReady}
          />
          <ThreeDViewport />
        </div>
      )}
    </div>
  );
}
