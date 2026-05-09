import { Component, useCallback, useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { ViewportManager } from '../../core/rendering/ViewportManager';
import { MPRController, VIEWPORT_IDS } from '../../core/rendering/MPRController';
import { useVolumeStore } from '../../core/store/volumeStore';
import { useUIStore } from '../../core/store/uiStore';
import { logClientDebug } from '../../core/debug/clientDebugLog';
import ContourOverlay from './ContourOverlay';
import ToolOptions from './ToolOptions';
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
  const activeViewport = useUIStore((s) => s.activeViewport);
  const setActiveViewport = useUIStore((s) => s.setActiveViewport);

  const isActive = activeViewport === orientation;

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

  return (
    <div
      className={`relative bg-black overflow-hidden ${isActive ? 'ring-1 ring-blue-500' : ''}`}
      onClick={() => setActiveViewport(orientation)}
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
    </div>
  );
}

export default function ImageViewer() {
  const containerRef = useRef<HTMLDivElement>(null);
  const activeSeriesUID = useVolumeStore((s) => s.activeSeriesUID);
  const loadedSeries = useVolumeStore((s) => s.loadedSeries);
  const windowLevelPreset = useUIStore((s) => s.windowLevelPreset);
  const crosshairsEnabled = useUIStore((s) => s.crosshairsEnabled);
  const [viewportsReady, setViewportsReady] = useState(false);

  // Track whether we've set up the tool group yet
  const setupDone = useRef(false);
  const readyViewportIds = useRef(new Set<string>());

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
      try {
        pushDebugEvent(`volume:start ${volumeId}`);
        // Re-setup tool group with the actual volume id
        await MPRController.setup(volumeId);
        if (crosshairsEnabled) {
          await MPRController.enableCrosshairs();
        }
        pushDebugEvent(`volume:toolgroup ${volumeId}`);

        await Promise.all([
          ViewportManager.setVolume(VIEWPORT_IDS.AXIAL, volumeId),
          ViewportManager.setVolume(VIEWPORT_IDS.SAGITTAL, volumeId),
          ViewportManager.setVolume(VIEWPORT_IDS.CORONAL, volumeId),
        ]);
        ViewportManager.setWindowLevel(VIEWPORT_IDS.AXIAL, windowLevelPreset);
        ViewportManager.setWindowLevel(VIEWPORT_IDS.SAGITTAL, windowLevelPreset);
        ViewportManager.setWindowLevel(VIEWPORT_IDS.CORONAL, windowLevelPreset);
        pushDebugEvent(`volume:done ${volumeId}`);
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
      className="relative h-full flex-1 bg-[var(--color-border)]"
    >
      <ToolOptions />
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
    </div>
  );
}
