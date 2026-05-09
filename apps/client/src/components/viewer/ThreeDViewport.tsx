import { useEffect, useMemo, useRef, useState } from 'react';
import { logClientDebug } from '../../core/debug/clientDebugLog';
import { useStructureStore } from '../../core/store/structureStore';
import { useVolumeStore } from '../../core/store/volumeStore';
import { createThreeDScene, type ThreeDScene } from '../../core/rendering/threeDScene';

function OverlayLabel({ children, className = '' }: { children: string; className?: string }) {
  return (
    <span
      className={`pointer-events-none absolute left-1 top-1 z-10 bg-black/50 px-1 py-0.5 font-mono text-[10px] text-[#f97316] select-none ${className}`}
    >
      {children}
    </span>
  );
}

export default function ThreeDViewport() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<ThreeDScene | null>(null);
  const renderAttemptRef = useRef(0);
  const lastRenderSignatureRef = useRef<string | null>(null);
  const [showCtSurface, setShowCtSurface] = useState(true);
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [status, setStatus] = useState('Load a series to view 3D anatomy.');
  const [renderError, setRenderError] = useState<string | null>(null);
  const activeSeriesUID = useVolumeStore((state) => state.activeSeriesUID);
  const loadedSeries = useVolumeStore((state) => state.loadedSeries);
  const structureSets = useStructureStore((state) => state.structureSets);
  const activeStructureSetId = useStructureStore((state) => state.activeStructureSetId);

  const activeSeries = useMemo(
    () => loadedSeries.find((series) => series.seriesUID === activeSeriesUID) ?? null,
    [activeSeriesUID, loadedSeries]
  );

  const activeStructureSet = useMemo(() => {
    const activeById = structureSets.find((structureSet) => structureSet.id === activeStructureSetId);
    if (activeById?.referencedSeriesUID === activeSeriesUID) return activeById;
    return structureSets.find((structureSet) => structureSet.referencedSeriesUID === activeSeriesUID) ?? null;
  }, [activeSeriesUID, activeStructureSetId, structureSets]);

  const visibleStructures = useMemo(
    () =>
      (activeStructureSet?.structures ?? []).filter(
        (structure) => structure.isVisible !== false && structure.contours.length > 0
      ),
    [activeStructureSet]
  );

  const pushDebug = (message: string) => {
    logClientDebug('ThreeDViewport', message);
  };

  const scalarLength = activeSeries?.volume.pixelData.length ?? 0;
  const renderSignature = useMemo(() => {
    const structureSignature = visibleStructures
      .map((structure) => {
        const firstContour = structure.contours[0];
        const lastContour = structure.contours[structure.contours.length - 1];
        return [
          structure.id,
          structure.contours.length,
          firstContour?.slicePosition ?? 'none',
          lastContour?.slicePosition ?? 'none',
          firstContour?.points.length ?? 0,
          lastContour?.points.length ?? 0,
        ].join(':');
      })
      .join('|');

    return [
      activeSeries?.seriesUID ?? 'none',
      scalarLength,
      showCtSurface ? 'ct-on' : 'ct-off',
      activeStructureSet?.id ?? 'no-structure-set',
      structureSignature,
      refreshRevision,
    ].join('::');
  }, [activeSeries?.seriesUID, activeStructureSet?.id, refreshRevision, scalarLength, showCtSurface, visibleStructures]);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;

    let observer: ResizeObserver | null = null;

    try {
      const scene = createThreeDScene(element);
      sceneRef.current = scene;
      const { width, height } = element.getBoundingClientRect();
      pushDebug(`init ok size=${Math.round(width)}x${Math.round(height)}`);
      observer = new ResizeObserver(() => {
        try {
          const { width: nextWidth, height: nextHeight } = element.getBoundingClientRect();
          pushDebug(`resize ${Math.round(nextWidth)}x${Math.round(nextHeight)}`);
          scene.resize();
        } catch (error) {
          console.error('3D viewport resize failed', error);
          pushDebug(`resize error ${error instanceof Error ? error.message : String(error)}`);
          setRenderError('3D viewport unavailable.');
          setStatus('3D viewport unavailable.');
        }
      });
      observer.observe(element);
    } catch (error) {
      console.error('3D viewport initialization failed', error);
      pushDebug(`init error ${error instanceof Error ? error.message : String(error)}`);
      sceneRef.current = null;
      setRenderError('3D viewport unavailable.');
      setStatus('3D viewport unavailable.');
      return;
    }

    return () => {
      observer?.disconnect();
      try {
        sceneRef.current?.destroy();
        pushDebug('destroy ok');
      } catch (error) {
        console.error('3D viewport teardown failed', error);
        pushDebug(`destroy error ${error instanceof Error ? error.message : String(error)}`);
      }
      sceneRef.current = null;
      lastRenderSignatureRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (renderError) {
      setRenderError(null);
    }
  }, [activeSeriesUID, refreshRevision]);

  useEffect(() => {
    if (!activeSeries) {
      lastRenderSignatureRef.current = null;
      pushDebug('series cleared');
      return;
    }

    pushDebug(
      `series active uid=${activeSeries.seriesUID} dims=${activeSeries.volume.dimensions.join('x')} scalars=${scalarLength}`
    );
  }, [activeSeries, scalarLength]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (lastRenderSignatureRef.current === renderSignature) {
      return;
    }

    const snapshot = {
      volume: activeSeries?.volume ?? null,
      showCtSurface,
      structures: visibleStructures.map((structure) => ({ structure })),
    };

    const attempt = ++renderAttemptRef.current;
    const contourCount = visibleStructures.reduce(
      (total, structure) => total + structure.contours.length,
      0
    );
    const startedAt = performance.now();

    const renderResult = (() => {
      try {
        return scene.renderSnapshot(snapshot);
      } catch (error) {
        console.error('3D viewport render failed', error);
        pushDebug(
          `render error #${attempt} after=${Math.round(performance.now() - startedAt)}ms ${error instanceof Error ? error.message : String(error)}`
        );
        setRenderError('3D rendering unavailable for this series.');
        setStatus('3D rendering unavailable for this series.');
        return null;
      }
    })();
    if (!renderResult) {
      return;
    }
    lastRenderSignatureRef.current = renderSignature;
    const elapsedMs = Math.round(performance.now() - startedAt);
    if (elapsedMs >= 80) {
      pushDebug(
        `render slow #${attempt} ms=${elapsedMs} series=${activeSeries?.seriesUID ?? 'none'} visibleStructures=${visibleStructures.length} contours=${contourCount} ctReady=${renderResult.ctReady} structureCount=${renderResult.structureCount}`
      );
    }
    if (renderError) {
      setRenderError(null);
    }

    const { ctReady, structureCount } = renderResult;

    if (!activeSeries) {
      setStatus('Load a series to view 3D anatomy.');
      return;
    }

    if (scalarLength === 0 && structureCount === 0) {
      setStatus('CT voxels are still streaming. 3D will populate automatically.');
      return;
    }

    if (structureCount === 0 && !ctReady) {
      setStatus('No visible 3D structures yet.');
      return;
    }

    const ctSummary = showCtSurface ? (ctReady ? 'CT surface ready' : 'CT streaming') : 'CT hidden';
    const structureSummary =
      structureCount === 0 ? 'No visible structures' : `${structureCount} visible structure${structureCount === 1 ? '' : 's'}`;
    setStatus(`${ctSummary} · ${structureSummary}`);
  }, [activeSeries, refreshRevision, renderError, renderSignature, scalarLength, showCtSurface, visibleStructures]);

  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-black">
      <OverlayLabel>3D</OverlayLabel>
      <div className="absolute right-1 top-1 z-10 flex items-center gap-1 rounded border border-[var(--color-border)] bg-black/70 px-1 py-1 text-[10px] text-[var(--color-text-bright)] backdrop-blur">
        <button
          type="button"
          onClick={() => {
            pushDebug('rotate left');
            sceneRef.current?.rotateCamera(-15, 0);
          }}
          disabled={renderError !== null}
          className="rounded px-1.5 py-0.5 text-[var(--color-text-sec)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-bright)] disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Rotate left"
        >
          Left
        </button>
        <button
          type="button"
          onClick={() => {
            pushDebug('rotate right');
            sceneRef.current?.rotateCamera(15, 0);
          }}
          disabled={renderError !== null}
          className="rounded px-1.5 py-0.5 text-[var(--color-text-sec)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-bright)] disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Rotate right"
        >
          Right
        </button>
        <button
          type="button"
          onClick={() => {
            pushDebug('rotate up');
            sceneRef.current?.rotateCamera(0, 10);
          }}
          disabled={renderError !== null}
          className="rounded px-1.5 py-0.5 text-[var(--color-text-sec)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-bright)] disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Rotate up"
        >
          Up
        </button>
        <button
          type="button"
          onClick={() => {
            pushDebug('rotate down');
            sceneRef.current?.rotateCamera(0, -10);
          }}
          disabled={renderError !== null}
          className="rounded px-1.5 py-0.5 text-[var(--color-text-sec)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-bright)] disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Rotate down"
        >
          Down
        </button>
        <button
          type="button"
          onClick={() =>
            setShowCtSurface((value) => {
              const nextValue = !value;
              pushDebug(`toggle ct show=${nextValue}`);
              return nextValue;
            })
          }
          disabled={renderError !== null}
          className={`rounded px-1.5 py-0.5 transition-colors ${
            showCtSurface
              ? 'bg-blue-900/40 text-blue-200'
              : 'text-[var(--color-text-sec)] hover:bg-[var(--color-hover)]'
          } disabled:cursor-not-allowed disabled:opacity-50`}
        >
          {showCtSurface ? 'Hide CT' : 'Show CT'}
        </button>
        <button
          type="button"
          onClick={() =>
            setRefreshRevision((value) => {
              const nextValue = value + 1;
              pushDebug(`manual refresh revision=${nextValue}`);
              return nextValue;
            })
          }
          className="rounded px-1.5 py-0.5 text-[var(--color-text-sec)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-bright)]"
        >
          Refresh 3D
        </button>
        <button
          type="button"
          onClick={() => {
            try {
              pushDebug('reset camera');
              sceneRef.current?.resetCamera();
            } catch (error) {
              console.error('3D viewport camera reset failed', error);
              pushDebug(`reset camera error ${error instanceof Error ? error.message : String(error)}`);
              setRenderError('3D viewport unavailable.');
              setStatus('3D viewport unavailable.');
            }
          }}
          disabled={renderError !== null}
          className="rounded px-1.5 py-0.5 text-[var(--color-text-sec)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-bright)]"
        >
          Reset
        </button>
      </div>
      <div ref={containerRef} className="h-full w-full" aria-label="3D viewport" />
      <div className="pointer-events-none absolute inset-x-2 bottom-2 z-10 flex items-center justify-between rounded border border-[var(--color-border)] bg-black/60 px-2 py-1 text-[10px] text-[var(--color-text-muted)] backdrop-blur">
        <span>{status}</span>
        <span className="font-mono uppercase tracking-wide">
          {activeSeries ? activeSeries.series.seriesDescription || activeSeries.seriesUID : 'No series'}
        </span>
      </div>
    </div>
  );
}
