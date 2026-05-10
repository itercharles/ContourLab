import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { logClientDebug } from '../../core/debug/clientDebugLog';
import { useStructureStore } from '../../core/store/structureStore';
import { useVolumeStore } from '../../core/store/volumeStore';
import {
  createThreeDScene,
  GpuContextLostError,
  GpuUnavailableError,
  ThreeDInitError,
  type ThreeDScene,
} from '../../core/rendering/threeDScene';

function formatThreeDError(error: unknown, context: 'init' | 'resize' | 'render' | 'reset', seriesUID?: string | null): string {
  if (error instanceof GpuUnavailableError) {
    if (error.rendererName) {
      return `3D rendering disabled: GPU unavailable (running on ${error.rendererName}).`;
    }
    return `3D rendering needs a GPU. ${error.message}.`;
  }
  if (error instanceof ThreeDInitError) {
    return `3D viewport init failed at ${error.step}: ${error.message}`;
  }
  if (error instanceof GpuContextLostError) {
    return '3D viewport lost its GPU context (WebGL context lost). Reload to recover.';
  }
  const message = error instanceof Error ? error.message : String(error);
  switch (context) {
    case 'render':
      return `3D rendering failed for series ${seriesUID ?? 'unknown'}: ${message}`;
    case 'resize':
      return `3D viewport resize failed: ${message}`;
    case 'reset':
      return `3D camera reset failed: ${message}`;
    case 'init':
    default:
      return `3D viewport init failed: ${message}`;
  }
}

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
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [status, setStatus] = useState('Load a series to view 3D structures.');
  const [renderError, setRenderError] = useState<string | null>(null);
  const [ctReady, setCtReady] = useState(false);
  const [ctVisible, setCtVisible] = useState(true);
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

  const pushDebug = useCallback((message: string) => {
    logClientDebug('ThreeDViewport', message);
  }, []);

  const renderSignature = useMemo(() => {
    const structureSignature = visibleStructures
      .map((structure) => {
        const contourSig = structure.contours
          .map((c) => `${c.slicePosition}:${c.points.length}`)
          .join(',');
        return `${structure.id}:${contourSig}`;
      })
      .join('|');

    return [
      activeSeries?.seriesUID ?? 'none',
      activeStructureSet?.id ?? 'no-structure-set',
      structureSignature,
      refreshRevision,
    ].join('::');
  }, [activeSeries?.seriesUID, activeStructureSet?.id, refreshRevision, visibleStructures]);

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
          const message = formatThreeDError(error, 'resize');
          setRenderError(message);
          setStatus(message);
        }
      });
      observer.observe(element);
    } catch (error) {
      console.error('3D viewport initialization failed', error);
      pushDebug(`init error ${error instanceof Error ? error.message : String(error)}`);
      sceneRef.current = null;
      const message = formatThreeDError(error, 'init');
      setRenderError(message);
      setStatus(message);
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
    setCtReady(false);
  }, [activeSeriesUID, refreshRevision]);

  useEffect(() => {
    if (!activeSeries) {
      lastRenderSignatureRef.current = null;
      pushDebug('series cleared');
      return;
    }

    pushDebug(
      `series active uid=${activeSeries.seriesUID} dims=${activeSeries.volume.dimensions.join('x')} structures=${visibleStructures.length}`
    );
  }, [activeSeries, visibleStructures.length]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (lastRenderSignatureRef.current === renderSignature) {
      pushDebug(`render skipped signature=${renderSignature}`);
      return;
    }

    const contourCount = visibleStructures.reduce(
      (total, structure) => total + structure.contours.length,
      0
    );
    const attempt = renderAttemptRef.current + 1;
    pushDebug(
      `render queued #${attempt} series=${activeSeries?.seriesUID ?? 'none'} structures=${visibleStructures.length} contours=${contourCount}`
    );

    // Defer the render until the browser is idle so the 2D viewports
    // (axial/sagittal/coronal) commit their first frame before we start the
    // heavy marching-cubes work. requestIdleCallback is the right primitive —
    // it fires after layout/paint, never on the same tick as React's commit.
    // The 2-second timeout is the fail-safe so we still render even on a
    // page that never goes idle (e.g. continuous animations elsewhere). The
    // AbortController lets us cancel an in-flight render if the user
    // switches series mid-flight; the async renderSnapshot checks the
    // signal between structures.
    renderAttemptRef.current = attempt;
    const abort = new AbortController();
    let scheduleHandle: number | null = null;
    let timeoutHandle: number | null = null;
    const ric = window.requestIdleCallback;
    const cic = window.cancelIdleCallback;

    const startSnapshot = () => {
      if (abort.signal.aborted) return;
      const snapshot = {
        volume: activeSeries?.volume ?? null,
        structures: visibleStructures.map((structure) => ({ structure })),
      };
      pushDebug(
        `render start #${attempt} volume=${snapshot.volume?.seriesUID ?? 'none'} structures=${snapshot.structures.length}`
      );

      const renderStart = performance.now();
      scene
        .renderSnapshot(snapshot, { signal: abort.signal })
        .then((renderResult) => {
          if (abort.signal.aborted) {
            pushDebug(`render aborted #${attempt}`);
            return;
          }
          lastRenderSignatureRef.current = renderSignature;
          const elapsedMs = Math.round(performance.now() - renderStart);
          pushDebug(
            `render done #${attempt} ms=${elapsedMs} structureCount=${renderResult.structureCount} ctReady=${renderResult.ctReady}${
              renderResult.cancelled ? ' cancelled=true' : ''
            }`
          );

          setRenderError(null);
          setCtReady(renderResult.ctReady);

          const { structureCount, ctReady: newCtReady } = renderResult;
          if (!activeSeries) {
            setStatus('Load a series to view 3D structures.');
            return;
          }
          const structPart =
            structureCount === 0
              ? 'No visible 3D structures yet.'
              : `${structureCount} visible structure${structureCount === 1 ? '' : 's'}`;
          setStatus(newCtReady ? `CT surface ready · ${structPart}` : structPart);
        })
        .catch((error: unknown) => {
          if (abort.signal.aborted) return;
          console.error('3D viewport render failed', error);
          pushDebug(
            `render error #${attempt} ms=${Math.round(performance.now() - renderStart)} ${error instanceof Error ? error.message : String(error)}`
          );
          const message = formatThreeDError(error, 'render', activeSeries?.seriesUID ?? null);
          setRenderError(message);
          setStatus(message);
        });
    };

    if (typeof ric === 'function') {
      scheduleHandle = ric(startSnapshot, { timeout: 2000 });
    } else {
      // Older Safari and the jsdom test runner don't expose
      // requestIdleCallback. Use a small setTimeout — gives React's commit
      // and a paint a chance, then fires.
      timeoutHandle = window.setTimeout(startSnapshot, 16);
    }

    return () => {
      abort.abort();
      if (scheduleHandle != null && typeof cic === 'function') cic(scheduleHandle);
      if (timeoutHandle != null) window.clearTimeout(timeoutHandle);
    };
  }, [activeSeries, refreshRevision, renderSignature, visibleStructures]);

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
        {ctReady && (
          <button
            type="button"
            onClick={() => {
              const next = !ctVisible;
              pushDebug(`ct visible=${next}`);
              setCtVisible(next);
              sceneRef.current?.setCTVisible(next);
            }}
            disabled={renderError !== null}
            className="rounded px-1.5 py-0.5 text-[var(--color-text-sec)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-bright)] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {ctVisible ? 'Hide CT' : 'Show CT'}
          </button>
        )}
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
              const message = formatThreeDError(error, 'reset');
              setRenderError(message);
              setStatus(message);
            }
          }}
          disabled={renderError !== null}
          className="rounded px-1.5 py-0.5 text-[var(--color-text-sec)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-bright)] disabled:cursor-not-allowed disabled:opacity-50"
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
