import { useEffect, useMemo, useRef, useState } from 'react';
import { logClientDebug } from '../../core/debug/clientDebugLog';
import { useStructureStore } from '../../core/store/structureStore';
import { useVolumeStore } from '../../core/store/volumeStore';
import { createThreeDScene, type ThreeDScene } from '../../core/rendering/threeDScene';
import { VIEWPORT_IDS } from '../../core/rendering/MPRController';

const CT_PRESETS = [
  { key: 'soft', label: 'Soft CT', thresholdHu: 80, opacity: 0.24 },
  { key: 'body', label: 'Body CT', thresholdHu: 120, opacity: 0.3 },
  { key: 'bone', label: 'Bone CT', thresholdHu: 250, opacity: 0.42 },
] as const;

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
  const lastObservedScalarLengthRef = useRef(0);
  const [showCtSurface, setShowCtSurface] = useState(true);
  const [ctPresetKey, setCtPresetKey] = useState<(typeof CT_PRESETS)[number]['key']>('body');
  const [refreshRevision, setRefreshRevision] = useState(0);
  const [streamingScalarLength, setStreamingScalarLength] = useState(0);
  const [ctRevision, setCtRevision] = useState(0);
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

  const ctPreset = CT_PRESETS.find((preset) => preset.key === ctPresetKey) ?? CT_PRESETS[1];

  useEffect(() => {
    const nextScalarLength = activeSeries?.volume.pixelData.length ?? 0;
    lastObservedScalarLengthRef.current = nextScalarLength;
    setStreamingScalarLength(nextScalarLength);
    setCtRevision(0);
  }, [activeSeriesUID, activeSeries]);

  useEffect(() => {
    const viewportElements = [
      document.querySelector(`[data-viewport-id="${VIEWPORT_IDS.AXIAL}"]`),
      document.querySelector(`[data-viewport-id="${VIEWPORT_IDS.SAGITTAL}"]`),
      document.querySelector(`[data-viewport-id="${VIEWPORT_IDS.CORONAL}"]`),
    ].filter((element): element is HTMLDivElement => element instanceof HTMLDivElement);

    if (viewportElements.length === 0 || !activeSeries) return;

    const syncStreamingScalarLength = () => {
      const nextScalarLength = activeSeries.volume.pixelData.length;
      const scalarLengthChanged = nextScalarLength !== lastObservedScalarLengthRef.current;
      lastObservedScalarLengthRef.current = nextScalarLength;
      if (scalarLengthChanged) {
        pushDebug(`stream update scalars=${nextScalarLength}`);
        setStreamingScalarLength(nextScalarLength);
      }
      setCtRevision((value) => value + 1);
    };

    viewportElements.forEach((element) => {
      element.addEventListener('CORNERSTONE_IMAGE_RENDERED', syncStreamingScalarLength);
    });

    return () => {
      viewportElements.forEach((element) => {
        element.removeEventListener('CORNERSTONE_IMAGE_RENDERED', syncStreamingScalarLength);
      });
    };
  }, [activeSeries]);

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
      streamingScalarLength,
      ctRevision,
      showCtSurface ? 'ct-on' : 'ct-off',
      ctPreset.key,
      activeStructureSet?.id ?? 'no-structure-set',
      structureSignature,
      refreshRevision,
    ].join('::');
  }, [
    activeSeries?.seriesUID,
    activeStructureSet?.id,
    ctPreset.key,
    refreshRevision,
    showCtSurface,
    streamingScalarLength,
    ctRevision,
    visibleStructures,
  ]);

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
      `series active uid=${activeSeries.seriesUID} dims=${activeSeries.volume.dimensions.join('x')} scalars=${streamingScalarLength}`
    );
  }, [activeSeries, streamingScalarLength]);

  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (lastRenderSignatureRef.current === renderSignature) {
      return;
    }

    const contourCount = visibleStructures.reduce(
      (total, structure) => total + structure.contours.length,
      0
    );
    pushDebug(
      `render queued series=${activeSeries?.seriesUID ?? 'none'} structures=${visibleStructures.length} contours=${contourCount} scalars=${streamingScalarLength}`
    );

    // Defer the render via setTimeout so React can commit and the browser can paint
    // before the heavy marching-cubes / mask-building work starts on the main thread.
    const attempt = ++renderAttemptRef.current;
    const handle = window.setTimeout(() => {
      const snapshot = {
        volume: activeSeries?.volume ?? null,
        showCtSurface,
        ctIsoThresholdHu: ctPreset.thresholdHu,
        ctOpacity: ctPreset.opacity,
        ctRevision,
        structures: visibleStructures.map((structure) => ({ structure })),
      };

      const renderStart = performance.now();
      const renderResult = (() => {
        try {
          return scene.renderSnapshot(snapshot);
        } catch (error) {
          console.error('3D viewport render failed', error);
          pushDebug(
            `render error #${attempt} ms=${Math.round(performance.now() - renderStart)} ${error instanceof Error ? error.message : String(error)}`
          );
          setRenderError('3D rendering unavailable for this series.');
          setStatus('3D rendering unavailable for this series.');
          return null;
        }
      })();

      if (!renderResult) return;

      lastRenderSignatureRef.current = renderSignature;
      const elapsedMs = Math.round(performance.now() - renderStart);
      pushDebug(
        `render done #${attempt} ms=${elapsedMs} ctReady=${renderResult.ctReady} structureCount=${renderResult.structureCount}`
      );

      // Clear any stale error now that a render has succeeded.
      setRenderError(null);

      const { ctReady, structureCount } = renderResult;

      if (!activeSeries) {
        setStatus('Load a series to view 3D anatomy.');
        return;
      }

      if (streamingScalarLength === 0 && structureCount === 0) {
        setStatus('CT voxels are still streaming. 3D will populate automatically.');
        return;
      }

      if (structureCount === 0 && !ctReady) {
        setStatus('No visible 3D structures yet.');
        return;
      }

      const ctSummary = showCtSurface
        ? ctReady
          ? `CT surface ready (${ctPreset.label})`
          : 'CT streaming'
        : 'CT hidden';
      const structureSummary =
        structureCount === 0 ? 'No visible structures' : `${structureCount} visible structure${structureCount === 1 ? '' : 's'}`;
      setStatus(`${ctSummary} · ${structureSummary}`);
    }, 0);

    return () => window.clearTimeout(handle);
  }, [activeSeries, ctPreset, ctRevision, refreshRevision, renderSignature, showCtSurface, streamingScalarLength, visibleStructures]);

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
            setCtPresetKey((value) => {
              const currentIndex = CT_PRESETS.findIndex((preset) => preset.key === value);
              const nextPreset = CT_PRESETS[(currentIndex + 1) % CT_PRESETS.length];
              pushDebug(`ct preset ${nextPreset.key} threshold=${nextPreset.thresholdHu} opacity=${nextPreset.opacity}`);
              return nextPreset.key;
            })
          }
          disabled={renderError !== null || !showCtSurface}
          className="rounded px-1.5 py-0.5 text-[var(--color-text-sec)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-bright)] disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Cycle CT preset"
        >
          {ctPreset.label}
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
