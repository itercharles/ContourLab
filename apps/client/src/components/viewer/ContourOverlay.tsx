import { useEffect, useMemo, useRef, useState } from 'react';
import { ContourEngine } from '../../core/contouring/ContourEngine';
import {
  flattenWorldPoints,
  isContourOnSlice,
  projectContourToCanvasPath,
  type WorldPoint,
} from '../../core/contouring/contourOverlayUtils';
import { ViewportManager } from '../../core/rendering/ViewportManager';
import { useStructureStore } from '../../core/store/structureStore';
import { useUIStore } from '../../core/store/uiStore';
import { useVolumeStore } from '../../core/store/volumeStore';
import { StructureSetManager } from '../../core/structures/StructureSetManager';
import { logClientDebug } from '../../core/debug/clientDebugLog';

interface VolumeViewportLike {
  canvasToWorld: (canvasPoint: [number, number]) => [number, number, number];
  worldToCanvas: (worldPoint: [number, number, number]) => [number, number];
  getCamera?: () => { focalPoint?: [number, number, number] };
}

interface ContourOverlayProps {
  viewportId: string;
  viewportElement: HTMLDivElement | null;
}

interface RenderableContour {
  path: string;
  color: string;
  strokeWidth: number;
}

interface SliceFrame {
  sopInstanceUID: string;
  sliceLocation: number;
}

interface CanvasMetrics {
  viewportWidth: number;
  viewportHeight: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
}

export default function ContourOverlay({
  viewportId,
  viewportElement,
}: ContourOverlayProps) {
  const activeTool = useUIStore((state) => state.activeTool);
  const activeSeriesUID = useVolumeStore((state) => state.activeSeriesUID);
  const loadedSeries = useVolumeStore((state) => state.loadedSeries);
  const structureSets = useStructureStore((state) => state.structureSets);
  const activeStructureSetId = useStructureStore((state) => state.activeStructureSetId);
  const activeStructureId = useStructureStore((state) => state.activeStructureId);

  const [revision, setRevision] = useState(0);
  const [draftPoints, setDraftPoints] = useState<WorldPoint[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const drawingRef = useRef(false);
  const draftPointsRef = useRef<WorldPoint[]>([]);
  const lastCanvasPointRef = useRef<[number, number] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const clearDraft = (message?: string) => {
    drawingRef.current = false;
    lastCanvasPointRef.current = null;
    draftPointsRef.current = [];
    setDraftPoints([]);
    if (message) {
      setStatusMessage(message);
    }
  };

  useEffect(() => {
    if (!viewportElement) return;

    const update = () => setRevision((value) => value + 1);
    viewportElement.addEventListener('CORNERSTONE_IMAGE_RENDERED', update);
    viewportElement.addEventListener('CORNERSTONE_CAMERA_MODIFIED', update);

    return () => {
      viewportElement.removeEventListener('CORNERSTONE_IMAGE_RENDERED', update);
      viewportElement.removeEventListener('CORNERSTONE_CAMERA_MODIFIED', update);
    };
  }, [viewportElement]);

  useEffect(() => {
    if (activeTool !== 'freehand') {
      clearDraft();
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !drawingRef.current) return;
      event.preventDefault();
      logClientDebug('ContourOverlay', `pointercancel:escape viewport=${viewportId}`);
      clearDraft('Contour cancelled.');
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTool, viewportId]);

  const viewport = useMemo(() => {
    void revision;
    return ViewportManager.getRenderingEngine()?.getViewport(viewportId) as
      | VolumeViewportLike
      | undefined;
  }, [revision, viewportId]);

  const canvasMetrics = useMemo<CanvasMetrics>(() => {
    if (!viewportElement) {
      return {
        viewportWidth: 0,
        viewportHeight: 0,
        offsetX: 0,
        offsetY: 0,
        width: 0,
        height: 0,
      };
    }

    const canvas = viewportElement.querySelector('canvas');
    if (!(canvas instanceof HTMLCanvasElement)) {
      return {
        viewportWidth: viewportElement.clientWidth,
        viewportHeight: viewportElement.clientHeight,
        offsetX: 0,
        offsetY: 0,
        width: viewportElement.clientWidth,
        height: viewportElement.clientHeight,
      };
    }

    const viewportRect = viewportElement.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();

    return {
      viewportWidth: viewportRect.width,
      viewportHeight: viewportRect.height,
      offsetX: canvasRect.left - viewportRect.left,
      offsetY: canvasRect.top - viewportRect.top,
      width: canvasRect.width,
      height: canvasRect.height,
    };
  }, [revision, viewportElement]);

  const activeSeries = activeSeriesUID
    ? loadedSeries.find((series) => series.seriesUID === activeSeriesUID)
    : undefined;

  const activeStructureSet =
    structureSets.find((structureSet) => structureSet.id === activeStructureSetId) ??
    structureSets.find((structureSet) => structureSet.referencedSeriesUID === activeSeriesUID);

  const activeStructure = activeStructureSet?.structures.find(
    (structure) => structure.id === activeStructureId
  );

  const focalPointZ = useMemo(() => {
    try {
      return viewport?.getCamera?.()?.focalPoint?.[2] ?? 0;
    } catch {
      return 0;
    }
  }, [viewport, revision]);

  const currentFrame = useMemo(() => {
    const sourceInstances = activeSeries?.series.instances ?? [];
    const instances: SliceFrame[] = sourceInstances.flatMap((instance) => (
      Number.isFinite(instance.sliceLocation)
        ? [{
            sopInstanceUID: instance.sopInstanceUID,
            sliceLocation: instance.sliceLocation as number,
          }]
        : []
    ));
    if (instances.length === 0) return undefined;

    const [firstFrame, ...restFrames] = instances;
    return restFrames.reduce((closest, frame) => {
      return Math.abs(frame.sliceLocation - focalPointZ) < Math.abs(closest.sliceLocation - focalPointZ)
        ? frame
        : closest;
    }, firstFrame);
  }, [activeSeries, focalPointZ]);

  const currentSlicePosition = currentFrame?.sliceLocation ?? focalPointZ;
  const sliceTolerance = Math.max(activeSeries?.volume.spacing[2] ?? 1, 1) / 2;

  const renderableContours = useMemo(() => {
    if (!viewport || !activeStructureSet) {
      return [] as RenderableContour[];
    }

    const worldToOverlayCanvas = (worldPoint: [number, number, number]) => {
      const [x, y] = viewport.worldToCanvas(worldPoint);
      return [x + canvasMetrics.offsetX, y + canvasMetrics.offsetY] as [number, number];
    };

    return activeStructureSet.structures
      .filter((structure) => structure.isVisible ?? true)
      .flatMap((structure) => {
        const color = `rgb(${structure.color.join(', ')})`;
        return structure.contours
          .filter((contour) =>
            isContourOnSlice(contour.slicePosition, currentSlicePosition, sliceTolerance)
          )
          .flatMap((contour) => {
            try {
              return [{
                path: `${projectContourToCanvasPath(contour.points, worldToOverlayCanvas)} Z`,
                color,
                strokeWidth: structure.id === activeStructureId ? 2 : 1.25,
              }];
            } catch {
              return [];
            }
          });
      });
  }, [
    activeStructureId,
    activeStructureSet,
    canvasMetrics.offsetX,
    canvasMetrics.offsetY,
    currentSlicePosition,
    sliceTolerance,
    viewport,
  ]);

  const draftPath = useMemo(() => {
    if (!viewport || draftPoints.length < 2) return '';

    try {
      const worldToOverlayCanvas = (worldPoint: [number, number, number]) => {
        const [x, y] = viewport.worldToCanvas(worldPoint);
        return [x + canvasMetrics.offsetX, y + canvasMetrics.offsetY] as [number, number];
      };

      return `${projectContourToCanvasPath(
        flattenWorldPoints(draftPoints),
        worldToOverlayCanvas
      )} Z`;
    } catch {
      return '';
    }
  }, [canvasMetrics.offsetX, canvasMetrics.offsetY, draftPoints, viewport]);

  const isDrawable =
    activeTool === 'freehand' &&
    !!viewport &&
    !!activeSeries &&
    !!currentFrame &&
    !!activeStructureSet &&
    !!activeStructure &&
    !(activeStructure.isLocked ?? false);

  useEffect(() => {
    logClientDebug(
      'ContourOverlay',
      [
        `viewport=${viewportId}`,
        `tool=${activeTool}`,
        `drawable=${isDrawable ? 'yes' : 'no'}`,
        `series=${activeSeriesUID ?? 'none'}`,
        `set=${activeStructureSet?.id ?? 'none'}`,
        `structure=${activeStructure?.id ?? 'none'}`,
        `locked=${activeStructure?.isLocked ? 'yes' : 'no'}`,
        `slice=${currentSlicePosition.toFixed(2)}`,
        `frame=${currentFrame?.sopInstanceUID ?? 'none'}`,
        `viewport=${canvasMetrics.viewportWidth.toFixed(1)}x${canvasMetrics.viewportHeight.toFixed(1)}`,
        `canvas=${canvasMetrics.width.toFixed(1)}x${canvasMetrics.height.toFixed(1)}`,
        `offset=${canvasMetrics.offsetX.toFixed(1)},${canvasMetrics.offsetY.toFixed(1)}`,
      ].join(' ')
    );
  }, [
    canvasMetrics.viewportHeight,
    canvasMetrics.viewportWidth,
    activeSeriesUID,
    canvasMetrics.height,
    canvasMetrics.offsetX,
    canvasMetrics.offsetY,
    canvasMetrics.width,
    currentFrame?.sopInstanceUID,
    currentSlicePosition,
    activeStructure?.id,
    activeStructure?.isLocked,
    activeStructureSet?.id,
    activeTool,
    isDrawable,
    viewportId,
  ]);

  useEffect(() => {
    if (activeTool !== 'freehand') {
      setStatusMessage(null);
      return;
    }

    if (!activeSeries) {
      setStatusMessage('Load a series to draw.');
    } else if (!currentFrame) {
      setStatusMessage('Current slice metadata is unavailable.');
    } else if (!activeStructureSet || !activeStructure) {
      setStatusMessage('Create or select a structure to draw.');
    } else if (activeStructure.isLocked ?? false) {
      setStatusMessage('Unlock the selected structure to draw.');
    } else {
      setStatusMessage('Drag on the axial view to draw a contour.');
    }
  }, [activeSeries, activeStructure, activeStructureSet, activeTool, currentFrame]);

  const getCanvasPoint = (event: React.PointerEvent<SVGSVGElement>): [number, number] | null => {
    const svg = svgRef.current;
    if (!svg) return null;

    const rect = svg.getBoundingClientRect();
    const rawX = event.clientX - rect.left - canvasMetrics.offsetX;
    const rawY = event.clientY - rect.top - canvasMetrics.offsetY;
    const clampedX = Math.min(Math.max(rawX, 0), canvasMetrics.width);
    const clampedY = Math.min(Math.max(rawY, 0), canvasMetrics.height);

    return [clampedX, clampedY];
  };

  const appendPoint = (canvasPoint: [number, number]) => {
    if (!viewport) return;

    try {
      const worldPoint = viewport.canvasToWorld(canvasPoint);
      const point: WorldPoint = [worldPoint[0], worldPoint[1], currentSlicePosition];
      draftPointsRef.current = [...draftPointsRef.current, point];
      setDraftPoints(draftPointsRef.current);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logClientDebug(
        'ContourOverlay',
        `appendPoint:error viewport=${viewportId} x=${canvasPoint[0].toFixed(1)} y=${canvasPoint[1].toFixed(1)} ${message}`
      );
    }
  };

  const appendInterpolatedPoints = (from: [number, number], to: [number, number]) => {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const distance = Math.sqrt(dx * dx + dy * dy);
    const stepSize = 3;
    const steps = Math.max(1, Math.ceil(distance / stepSize));

    for (let step = 1; step <= steps; step += 1) {
      const t = step / steps;
      appendPoint([
        from[0] + dx * t,
        from[1] + dy * t,
      ]);
    }
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!isDrawable) {
      logClientDebug('ContourOverlay', `pointerdown:blocked viewport=${viewportId}`);
      return;
    }

    const canvasPoint = getCanvasPoint(event);
    if (!canvasPoint) return;

    logClientDebug(
      'ContourOverlay',
      `pointerdown:start viewport=${viewportId} x=${canvasPoint[0].toFixed(1)} y=${canvasPoint[1].toFixed(1)}`
    );
    drawingRef.current = true;
    lastCanvasPointRef.current = canvasPoint;
    draftPointsRef.current = [];
    setDraftPoints([]);
    setStatusMessage('Drawing contour... Release to save. Esc cancels.');
    appendPoint(canvasPoint);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!drawingRef.current || !isDrawable) return;

    const canvasPoint = getCanvasPoint(event);
    const lastPoint = lastCanvasPointRef.current;
    if (!canvasPoint || !lastPoint) return;

    const dx = canvasPoint[0] - lastPoint[0];
    const dy = canvasPoint[1] - lastPoint[1];
    if (dx * dx + dy * dy < 1) return;

    appendInterpolatedPoints(lastPoint, canvasPoint);
    lastCanvasPointRef.current = canvasPoint;
  };

  const finishDrawing = (canvasPoint?: [number, number]) => {
    drawingRef.current = false;
    lastCanvasPointRef.current = null;

    if (canvasPoint) {
      appendPoint(canvasPoint);
    }

    if (
      !activeStructureSet ||
      !activeStructure ||
      !activeSeries ||
      !currentFrame ||
      draftPointsRef.current.length < 3
    ) {
      logClientDebug('ContourOverlay', `pointerup:discard viewport=${viewportId}`);
      clearDraft('Contour too short. Drag a larger closed shape.');
      return;
    }

    logClientDebug(
      'ContourOverlay',
      `pointerup:commit viewport=${viewportId} points=${draftPointsRef.current.length} slice=${currentSlicePosition.toFixed(2)}`
    );
    ContourEngine.addContour(activeStructureSet.id, activeStructure.id, {
      points: flattenWorldPoints(draftPointsRef.current),
      slicePosition: currentSlicePosition,
      sopInstanceUID: currentFrame.sopInstanceUID,
    });
    StructureSetManager.refreshVolume(
      activeStructureSet.id,
      activeStructure.id,
      activeSeries.volume.spacing[2] || 1
    );
    clearDraft(`Saved contour on ${activeStructure.name}.`);
  };

  const handlePointerUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!drawingRef.current) return;
    const canvasPoint = getCanvasPoint(event);
    event.currentTarget.releasePointerCapture(event.pointerId);
    finishDrawing(canvasPoint ?? undefined);
  };

  const handlePointerCancel = () => {
    clearDraft('Contour cancelled.');
  };

  return (
    <svg
      ref={svgRef}
      className="absolute inset-0 z-10"
      width={canvasMetrics.viewportWidth || undefined}
      height={canvasMetrics.viewportHeight || undefined}
      viewBox={
        canvasMetrics.viewportWidth > 0 && canvasMetrics.viewportHeight > 0
          ? `0 0 ${canvasMetrics.viewportWidth} ${canvasMetrics.viewportHeight}`
          : undefined
      }
      preserveAspectRatio="none"
      style={{ pointerEvents: activeTool === 'freehand' ? 'auto' : 'none', touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
    >
      {renderableContours.map((contour, index) => (
        <path
          key={`${index}-${contour.path}`}
          d={contour.path}
          fill="none"
          stroke={contour.color}
          strokeWidth={contour.strokeWidth}
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      ))}

      {draftPath && (
        <path
          d={draftPath}
          fill="none"
          stroke={activeStructure ? `rgb(${activeStructure.color.join(', ')})` : '#3b82f6'}
          strokeWidth={2}
          strokeDasharray="4 2"
          vectorEffect="non-scaling-stroke"
          strokeLinejoin="round"
        />
      )}

      {activeTool === 'freehand' && statusMessage && (
        <g>
          <rect
            x="8"
            y="8"
            width={Math.max(180, statusMessage.length * 6.5)}
            height="22"
            rx="4"
            fill="rgba(0, 0, 0, 0.72)"
          />
          <text
            x="16"
            y="22"
            fill="#e5e5e5"
            fontSize="10"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
          >
            {statusMessage}
          </text>
        </g>
      )}
    </svg>
  );
}
