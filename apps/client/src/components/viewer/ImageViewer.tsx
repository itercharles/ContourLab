import { useEffect, useRef } from 'react';
import { ViewportManager } from '../../core/rendering/ViewportManager';
import { MPRController, VIEWPORT_IDS } from '../../core/rendering/MPRController';
import { useVolumeStore } from '../../core/store/volumeStore';
import { useUIStore } from '../../core/store/uiStore';

interface ViewportPanelProps {
  id: string;
  label: string;
  orientation: 'AXIAL' | 'SAGITTAL' | 'CORONAL';
  onReady: (id: string, el: HTMLDivElement) => void;
}

function ViewportPanel({ id, label, orientation, onReady }: ViewportPanelProps) {
  const elRef = useRef<HTMLDivElement>(null);
  const setActiveViewport = useUIStore((s) => s.setActiveViewport);

  useEffect(() => {
    if (elRef.current) {
      onReady(id, elRef.current);
    }
    // onReady is stable (created with useCallback in parent)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative bg-black">
      <div
        ref={elRef}
        className="w-full h-full"
        onClick={() => setActiveViewport(orientation)}
      />
      <span className="absolute top-1 left-2 text-xs font-mono text-gray-400 pointer-events-none select-none z-10">
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

  // Track whether we've set up the tool group yet
  const setupDone = useRef(false);

  const handleViewportReady = async (id: string, el: HTMLDivElement) => {
    try {
      await ViewportManager.init();
      const orientation = id === VIEWPORT_IDS.AXIAL
        ? 'AXIAL'
        : id === VIEWPORT_IDS.SAGITTAL
          ? 'SAGITTAL'
          : 'CORONAL';
      await ViewportManager.enableElement(id, el, orientation as 'AXIAL' | 'SAGITTAL' | 'CORONAL');
    } catch (err) {
      console.error(`Failed to enable viewport ${id}:`, err);
    }
  };

  // After all three viewports are ready, set up tool group once
  const readyCount = useRef(0);
  const onReady = async (id: string, el: HTMLDivElement) => {
    await handleViewportReady(id, el);
    readyCount.current += 1;
    if (readyCount.current === 3 && !setupDone.current) {
      setupDone.current = true;
      try {
        // MPRController.setup requires a volumeId; pass empty string for initial setup
        // It will be re-called when a volume is loaded
        await MPRController.setup('');
      } catch (err) {
        console.error('MPRController setup failed:', err);
      }
    }
  };

  // When active series changes, load volume into viewports
  useEffect(() => {
    if (!activeSeriesUID) return;

    const series = loadedSeries.find((s) => s.seriesUID === activeSeriesUID);
    if (!series) return;

    const volumeId = series.cornerstoneVolumeId;

    const applyVolume = async () => {
      try {
        // Re-setup tool group with the actual volume id
        await MPRController.setup(volumeId);

        await Promise.all([
          ViewportManager.setVolume(VIEWPORT_IDS.AXIAL, volumeId, windowLevelPreset),
          ViewportManager.setVolume(VIEWPORT_IDS.SAGITTAL, volumeId, windowLevelPreset),
          ViewportManager.setVolume(VIEWPORT_IDS.CORONAL, volumeId, windowLevelPreset),
        ]);
      } catch (err) {
        console.error('Failed to set volume on viewports:', err);
      }
    };

    void applyVolume();
  // windowLevelPreset intentionally omitted — preset changes handled separately below
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSeriesUID, loadedSeries]);

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

  return (
    <div
      ref={containerRef}
      className="grid grid-cols-2 grid-rows-2 h-full bg-black gap-px flex-1"
    >
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

      {/* 4th quadrant: 3D placeholder */}
      <div className="relative bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <svg
            width="40"
            height="40"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-gray-700 mx-auto mb-2"
          >
            <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
            <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
            <line x1="12" y1="22.08" x2="12" y2="12" />
          </svg>
          <p className="text-xs text-gray-600 font-mono">3D View</p>
          <p className="text-xs text-gray-700 mt-1">Not yet implemented</p>
        </div>
        <span className="absolute top-1 left-2 text-xs font-mono text-gray-700 pointer-events-none select-none">
          3D
        </span>
      </div>
    </div>
  );
}
