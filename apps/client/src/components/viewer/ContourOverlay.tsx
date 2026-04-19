import { useEffect, useMemo, useRef, useState } from 'react';
import { ContourEngine } from '../../core/contouring/ContourEngine';
import {
  findContourOnFrame,
  flattenWorldPoints,
  getViewportTransformSignature,
  isContourOnFrame,
  projectContourToCanvasPath,
  type WorldPoint,
} from '../../core/contouring/contourOverlayUtils';
import { buildMprMaskBoundaryPath } from '../../core/contouring/contourMaskReslice';
import { ViewportManager } from '../../core/rendering/ViewportManager';
import { useStructureStore } from '../../core/store/structureStore';
import { useUIStore } from '../../core/store/uiStore';
import { useVolumeStore } from '../../core/store/volumeStore';
import { StructureSetManager } from '../../core/structures/StructureSetManager';
import { logClientDebug } from '../../core/debug/clientDebugLog';
import {
  calculateAngleDeg,
  calculateDistanceMm,
  calculatePolygonAreaMm2,
  sampleNearestVoxelValue,
  type WorldPoint as MeasurementWorldPoint,
} from '../../core/measurement/measurementUtils';

interface VolumeViewportLike {
  canvasToWorld: (canvasPoint: [number, number]) => [number, number, number];
  worldToCanvas: (worldPoint: [number, number, number]) => [number, number];
  getIntensityFromWorld?: (worldPoint: [number, number, number]) => number | undefined;
  getCamera?: () => {
    focalPoint?: [number, number, number];
    position?: [number, number, number];
    parallelScale?: number;
  };
  getZoom?: () => number;
}

interface ContourOverlayProps {
  viewportId: string;
  viewportElement: HTMLDivElement | null;
  orientation: 'AXIAL' | 'SAGITTAL' | 'CORONAL';
}

interface RenderableContour {
  path: string;
  color: string;
  strokeWidth: number;
}

interface EditablePoint {
  index: number;
  canvas: [number, number];
  world: WorldPoint;
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

type MeasurementKind = 'distance' | 'angle' | 'area' | 'hu';

interface MeasurementAnnotation {
  id: string;
  kind: MeasurementKind;
  points: MeasurementWorldPoint[];
  label: string;
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select'
  );
}

export default function ContourOverlay({
  viewportId,
  viewportElement,
  orientation,
}: ContourOverlayProps) {
  const activeTool = useUIStore((state) => state.activeTool);
  const activeSeriesUID = useVolumeStore((state) => state.activeSeriesUID);
  const loadedSeries = useVolumeStore((state) => state.loadedSeries);
  const structureSets = useStructureStore((state) => state.structureSets);
  const activeStructureSetId = useStructureStore((state) => state.activeStructureSetId);
  const activeStructureId = useStructureStore((state) => state.activeStructureId);
  const brushRadius = useUIStore((state) => state.brushRadius);

  const [revision, setRevision] = useState(0);
  const [draftPoints, setDraftPoints] = useState<WorldPoint[]>([]);
  const [measurementDraftPoints, setMeasurementDraftPoints] = useState<MeasurementWorldPoint[]>([]);
  const [measurements, setMeasurements] = useState<MeasurementAnnotation[]>([]);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const drawingRef = useRef(false);
  const editingPointIndexRef = useRef<number | null>(null);
  const editPointsRef = useRef<WorldPoint[]>([]);
  const draftPointsRef = useRef<WorldPoint[]>([]);
  const lastCanvasPointRef = useRef<[number, number] | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const isMeasurementTool = [
    'measureDistance',
    'measureAngle',
    'measureArea',
    'huProbe',
  ].includes(activeTool);

  const clearDraft = (message?: string) => {
    drawingRef.current = false;
    editingPointIndexRef.current = null;
    editPointsRef.current = [];
    lastCanvasPointRef.current = null;
    draftPointsRef.current = [];
    setDraftPoints([]);
    setMeasurementDraftPoints([]);
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

  const viewport = useMemo(() => {
    void revision;
    return ViewportManager.getRenderingEngine()?.getViewport(viewportId) as
      | VolumeViewportLike
      | undefined;
  }, [revision, viewportId]);

  useEffect(() => {
    if (!viewportElement) return;

    let frameId: number | null = null;
    let lastSignature = '';

    const checkTransform = () => {
      const currentViewport = ViewportManager.getRenderingEngine()?.getViewport(viewportId) as
        | VolumeViewportLike
        | undefined;
      const canvas = viewportElement.querySelector('canvas');
      const rect = canvas instanceof HTMLCanvasElement
        ? canvas.getBoundingClientRect()
        : viewportElement.getBoundingClientRect();
      const nextSignature = getViewportTransformSignature(currentViewport, rect);
      if (nextSignature !== lastSignature) {
        lastSignature = nextSignature;
        setRevision((value) => value + 1);
      }
      frameId = window.requestAnimationFrame(checkTransform);
    };

    frameId = window.requestAnimationFrame(checkTransform);

    return () => {
      if (frameId !== null) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [viewportElement, viewportId]);

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

  const activeStructureSet = useMemo(() => {
    return structureSets.find(
      (structureSet) =>
        structureSet.id === activeStructureSetId &&
        structureSet.referencedSeriesUID === activeSeriesUID
    );
  }, [activeSeriesUID, activeStructureSetId, structureSets]);

  const activeStructure = activeStructureSet?.structures.find(
    (structure) => structure.id === activeStructureId
  );

  const focalPoint = useMemo<[number, number, number]>(() => {
    try {
      return viewport?.getCamera?.()?.focalPoint ?? [0, 0, 0];
    } catch {
      return [0, 0, 0];
    }
  }, [viewport, revision]);
  const focalPointZ = focalPoint[2];

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
  const activeContourOnSlice = useMemo(
    () => activeStructure
      ? findContourOnFrame(
          activeStructure.contours,
          currentFrame?.sopInstanceUID,
          currentSlicePosition,
          sliceTolerance
        )
      : undefined,
    [activeStructure, currentFrame?.sopInstanceUID, currentSlicePosition, sliceTolerance]
  );
  const isContourEditTool = ['edit', 'freehand', 'polygon', 'brush', 'eraser'].includes(activeTool);
  const canMeasure = isMeasurementTool && !!viewport && !!activeSeries;

  useEffect(() => {
    if (!isContourEditTool && !isMeasurementTool) {
      clearDraft();
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return;

      if (event.key === 'Escape' && (drawingRef.current || draftPointsRef.current.length > 0)) {
        event.preventDefault();
        logClientDebug('ContourOverlay', `pointercancel:escape viewport=${viewportId}`);
        clearDraft('Contour cancelled.');
        return;
      }

      if (event.key === 'Escape' && measurementDraftPoints.length > 0) {
        event.preventDefault();
        setMeasurementDraftPoints([]);
        setStatusMessage('Measurement cancelled.');
        return;
      }

      if (event.key === 'Enter' && activeTool === 'polygon' && draftPointsRef.current.length >= 3) {
        event.preventDefault();
        finishDrawing();
        return;
      }

      if (event.key === 'Enter' && activeTool === 'measureArea' && measurementDraftPoints.length >= 3) {
        event.preventDefault();
        commitMeasurement('area', measurementDraftPoints);
        setMeasurementDraftPoints([]);
        return;
      }

      if (
        event.key === 'Delete' &&
        !drawingRef.current &&
        activeStructureSet &&
        activeStructure &&
        !(activeStructure.isLocked ?? false) &&
        activeSeries &&
          activeTool !== 'edit' &&
          activeContourOnSlice
      ) {
        event.preventDefault();
        const deleted = ContourEngine.deleteContourOnSlice(
          activeStructureSet.id,
          activeStructure.id,
          activeContourOnSlice.slicePosition
        );
        if (!deleted) {
          setStatusMessage('Unlock the selected structure before deleting contours.');
          return;
        }
        StructureSetManager.refreshVolume(
          activeStructureSet.id,
          activeStructure.id,
          activeSeries.volume.spacing[2] || 1
        );
        setStatusMessage(`Deleted contour on ${activeStructure.name}.`);
        logClientDebug(
          'ContourOverlay',
          `delete:slice viewport=${viewportId} slice=${activeContourOnSlice.slicePosition.toFixed(2)}`
        );
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    activeContourOnSlice,
    activeSeries,
    activeStructure,
    activeStructureSet,
    activeTool,
    isContourEditTool,
    isMeasurementTool,
    measurementDraftPoints,
    viewportId,
  ]);

  const renderableContours = useMemo(() => {
    void revision;
    if (!viewport || !activeStructureSet) {
      return [] as RenderableContour[];
    }

    const worldToOverlayCanvas = (worldPoint: [number, number, number]) => {
      const [x, y] = viewport.worldToCanvas(worldPoint);
      return [x + canvasMetrics.offsetX, y + canvasMetrics.offsetY] as [number, number];
    };

    if (orientation === 'SAGITTAL' || orientation === 'CORONAL') {
      if (!activeSeries) return [] as RenderableContour[];
      const planePosition = focalPoint[orientation === 'SAGITTAL' ? 0 : 1];

      return activeStructureSet.structures
        .filter((structure) => structure.isVisible ?? true)
        .flatMap((structure) => {
          const color = `rgb(${structure.color.join(', ')})`;
          try {
            const path = buildMprMaskBoundaryPath(
              activeSeries.volume,
              structure.contours,
              orientation,
              planePosition,
              worldToOverlayCanvas
            );
            if (!path) return [];
            return [{
              path,
              color,
              strokeWidth: structure.id === activeStructureId ? 2 : 1.25,
            }];
          } catch {
            return [];
          }
        });
    }

    return activeStructureSet.structures
      .filter((structure) => structure.isVisible ?? true)
      .flatMap((structure) => {
        const color = `rgb(${structure.color.join(', ')})`;
        return structure.contours
          .filter((contour) =>
            isContourOnFrame(
              contour,
              currentFrame?.sopInstanceUID,
              currentSlicePosition,
              sliceTolerance
            )
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
    activeSeries,
    activeStructureId,
    activeStructureSet,
    canvasMetrics.offsetX,
    canvasMetrics.offsetY,
    currentFrame?.sopInstanceUID,
    currentSlicePosition,
    focalPoint,
    orientation,
    revision,
    sliceTolerance,
    viewport,
  ]);

  const draftPath = useMemo(() => {
    void revision;
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
  }, [canvasMetrics.offsetX, canvasMetrics.offsetY, draftPoints, revision, viewport]);

  const projectMeasurementPoint = (worldPoint: MeasurementWorldPoint): [number, number] | null => {
    if (!viewport) return null;
    try {
      const [x, y] = viewport.worldToCanvas(worldPoint);
      return [x + canvasMetrics.offsetX, y + canvasMetrics.offsetY];
    } catch {
      return null;
    }
  };

  const renderableMeasurements = useMemo(() => {
    void revision;
    return measurements.flatMap((measurement) => {
      const canvasPoints = measurement.points
        .map(projectMeasurementPoint)
        .filter((point): point is [number, number] => Boolean(point));
      if (canvasPoints.length === 0) return [];
      return [{ ...measurement, canvasPoints }];
    });
  }, [canvasMetrics.offsetX, canvasMetrics.offsetY, measurements, revision, viewport]);

  const measurementDraftCanvasPoints = useMemo(() => {
    void revision;
    return measurementDraftPoints
      .map(projectMeasurementPoint)
      .filter((point): point is [number, number] => Boolean(point));
  }, [canvasMetrics.offsetX, canvasMetrics.offsetY, measurementDraftPoints, revision, viewport]);

  const editablePoints = useMemo(() => {
    void revision;
    if (orientation !== 'AXIAL' || !viewport || activeTool !== 'edit' || !activeContourOnSlice) {
      return [] as EditablePoint[];
    }

    const points: EditablePoint[] = [];
    for (let index = 0; index < activeContourOnSlice.points.length; index += 3) {
      const world: WorldPoint = [
        activeContourOnSlice.points[index],
        activeContourOnSlice.points[index + 1],
        activeContourOnSlice.points[index + 2],
      ];
      try {
        const [x, y] = viewport.worldToCanvas(world);
        points.push({
          index: index / 3,
          canvas: [x, y],
          world,
        });
      } catch {
        // Ignore points that cannot be projected by the active viewport.
      }
    }
    return points;
  }, [activeContourOnSlice, activeTool, orientation, revision, viewport]);

  const isDrawable =
    orientation === 'AXIAL' &&
    isContourEditTool &&
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
    if (orientation !== 'AXIAL' || !isContourEditTool) {
      if (isMeasurementTool) {
        const messageByTool: Partial<Record<typeof activeTool, string>> = {
          measureDistance: 'Measure distance: click two points.',
          measureAngle: 'Measure angle: click three points.',
          measureArea: 'Measure area: click vertices. Enter or double-click closes.',
          huProbe: 'HU probe: click one image point.',
        };
        setStatusMessage(activeSeries ? messageByTool[activeTool] ?? null : 'Load a series to measure.');
        return;
      }
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
      const messageByTool: Partial<Record<typeof activeTool, string>> = {
        freehand: 'Drag on the axial view to draw a contour.',
        edit: activeContourOnSlice
          ? 'Drag vertices. Double-click edge inserts. Shift-click vertex deletes.'
          : 'No active contour on this slice to edit.',
        polygon: 'Click vertices on the axial view. Enter or double-click saves.',
        brush: 'Click to stamp a circular contour on this slice.',
        eraser: 'Click to delete this structure contour on the current slice.',
      };
      setStatusMessage(messageByTool[activeTool] ?? 'Edit contour on the axial view.');
    }
  }, [activeContourOnSlice, activeSeries, activeStructure, activeStructureSet, activeTool, currentFrame, isContourEditTool, isMeasurementTool, orientation]);

  const getCanvasPointFromClient = (clientX: number, clientY: number): [number, number] | null => {
    const svg = svgRef.current;
    if (!svg) return null;

    const rect = svg.getBoundingClientRect();
    const rawX = clientX - rect.left - canvasMetrics.offsetX;
    const rawY = clientY - rect.top - canvasMetrics.offsetY;
    const clampedX = Math.min(Math.max(rawX, 0), canvasMetrics.width);
    const clampedY = Math.min(Math.max(rawY, 0), canvasMetrics.height);

    return [clampedX, clampedY];
  };

  const getCanvasPoint = (event: React.PointerEvent<SVGSVGElement>): [number, number] | null =>
    getCanvasPointFromClient(event.clientX, event.clientY);

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

  const distanceToSegment = (
    point: [number, number],
    start: [number, number],
    end: [number, number]
  ): number => {
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) return Math.hypot(point[0] - start[0], point[1] - start[1]);
    const t = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared));
    return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
  };

  const findNearestEditablePoint = (canvasPoint: [number, number], radius = 8): EditablePoint | null => {
    let nearest: EditablePoint | null = null;
    let nearestDistance = radius;
    for (const point of editablePoints) {
      const distance = Math.hypot(point.canvas[0] - canvasPoint[0], point.canvas[1] - canvasPoint[1]);
      if (distance <= nearestDistance) {
        nearest = point;
        nearestDistance = distance;
      }
    }
    return nearest;
  };

  const findNearestEditableSegment = (canvasPoint: [number, number], radius = 8): number | null => {
    if (editablePoints.length < 3) return null;

    let nearestIndex: number | null = null;
    let nearestDistance = radius;
    for (let index = 0; index < editablePoints.length; index += 1) {
      const start = editablePoints[index].canvas;
      const end = editablePoints[(index + 1) % editablePoints.length].canvas;
      const distance = distanceToSegment(canvasPoint, start, end);
      if (distance <= nearestDistance) {
        nearestIndex = index + 1;
        nearestDistance = distance;
      }
    }
    return nearestIndex;
  };

  const canvasPointToWorld = (canvasPoint: [number, number]): WorldPoint | null => {
    if (!viewport) return null;
    try {
      const worldPoint = viewport.canvasToWorld(canvasPoint);
      return [worldPoint[0], worldPoint[1], currentSlicePosition];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logClientDebug(
        'ContourOverlay',
        `edit:point:error viewport=${viewportId} x=${canvasPoint[0].toFixed(1)} y=${canvasPoint[1].toFixed(1)} ${message}`
      );
      return null;
    }
  };

  const canvasPointToMeasurementWorld = (canvasPoint: [number, number]): MeasurementWorldPoint | null => {
    if (!viewport) return null;
    try {
      const worldPoint = viewport.canvasToWorld(canvasPoint);
      return [worldPoint[0], worldPoint[1], worldPoint[2]];
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logClientDebug(
        'ContourOverlay',
        `measurement:point:error viewport=${viewportId} x=${canvasPoint[0].toFixed(1)} y=${canvasPoint[1].toFixed(1)} ${message}`
      );
      return null;
    }
  };

  const formatMeasurementLabel = (kind: MeasurementKind, points: MeasurementWorldPoint[]): string => {
    if (kind === 'distance' && points.length >= 2) {
      return `${calculateDistanceMm(points[0], points[1]).toFixed(1)} mm`;
    }
    if (kind === 'angle' && points.length >= 3) {
      return `${calculateAngleDeg(points[0], points[1], points[2]).toFixed(1)} deg`;
    }
    if (kind === 'area' && points.length >= 3) {
      return `${calculatePolygonAreaMm2(points).toFixed(1)} mm2`;
    }
    if (kind === 'hu' && points.length >= 1 && activeSeries) {
      let value: number | null | undefined;
      try {
        value = viewport?.getIntensityFromWorld?.(points[0]);
      } catch {
        value = null;
      }
      if (!Number.isFinite(value)) {
        value = sampleNearestVoxelValue(activeSeries.volume, points[0]);
      }
      return Number.isFinite(value) ? `${Math.round(value as number)} HU` : 'HU n/a';
    }
    return '';
  };

  const commitMeasurement = (kind: MeasurementKind, points: MeasurementWorldPoint[]) => {
    const label = formatMeasurementLabel(kind, points);
    if (!label) return;

    setMeasurements((current) => [
      ...current,
      {
        id: `${kind}-${Date.now()}-${current.length}`,
        kind,
        points,
        label,
      },
    ]);
    setStatusMessage(label);
    logClientDebug('ContourOverlay', `measurement:${kind} viewport=${viewportId} ${label}`);
  };

  const handleMeasurementPointerDown = (
    event: React.PointerEvent<SVGSVGElement>,
    canvasPoint: [number, number]
  ) => {
    const worldPoint = canvasPointToMeasurementWorld(canvasPoint);
    if (!worldPoint) return;

    if (activeTool === 'huProbe') {
      commitMeasurement('hu', [worldPoint]);
      setMeasurementDraftPoints([]);
      return;
    }

    if (activeTool === 'measureDistance') {
      const nextPoints = [...measurementDraftPoints, worldPoint];
      if (nextPoints.length >= 2) {
        commitMeasurement('distance', nextPoints.slice(0, 2));
        setMeasurementDraftPoints([]);
      } else {
        setMeasurementDraftPoints(nextPoints);
        setStatusMessage('Distance: click the second point.');
      }
      return;
    }

    if (activeTool === 'measureAngle') {
      const nextPoints = [...measurementDraftPoints, worldPoint];
      if (nextPoints.length >= 3) {
        commitMeasurement('angle', nextPoints.slice(0, 3));
        setMeasurementDraftPoints([]);
      } else {
        setMeasurementDraftPoints(nextPoints);
        setStatusMessage(`Angle: click point ${nextPoints.length + 1} of 3.`);
      }
      return;
    }

    if (activeTool === 'measureArea') {
      const nextPoints = [...measurementDraftPoints, worldPoint];
      setMeasurementDraftPoints(nextPoints);
      setStatusMessage(`${nextPoints.length} area vertices. Enter or double-click closes.`);
      if (event.detail >= 2 && nextPoints.length >= 3) {
        commitMeasurement('area', nextPoints);
        setMeasurementDraftPoints([]);
      }
    }
  };

  const getActiveContourPoints = (): WorldPoint[] => {
    if (!activeContourOnSlice) return [];

    const contourPoints: WorldPoint[] = [];
    for (let index = 0; index < activeContourOnSlice.points.length; index += 3) {
      contourPoints.push([
        activeContourOnSlice.points[index],
        activeContourOnSlice.points[index + 1],
        activeContourOnSlice.points[index + 2],
      ]);
    }
    return contourPoints;
  };

  const commitEditedContour = (message: string) => {
    if (!activeStructureSet || !activeStructure || !activeSeries || !currentFrame || editPointsRef.current.length < 3) {
      setStatusMessage('Edited contour needs at least 3 points.');
      return;
    }

    const saved = ContourEngine.addContour(activeStructureSet.id, activeStructure.id, {
      points: flattenWorldPoints(editPointsRef.current),
      slicePosition: activeContourOnSlice?.slicePosition ?? currentSlicePosition,
      sopInstanceUID: activeContourOnSlice?.referencedSOPInstanceUID ?? currentFrame.sopInstanceUID,
    });
    if (!saved) {
      setStatusMessage('Unlock the selected structure before editing contours.');
      return;
    }
    StructureSetManager.refreshVolume(
      activeStructureSet.id,
      activeStructure.id,
      activeSeries.volume.spacing[2] || 1
    );
    setStatusMessage(message);
  };

  const handleEditPointerDown = (event: React.PointerEvent<SVGSVGElement>, canvasPoint: [number, number]) => {
    if (!activeContourOnSlice) {
      setStatusMessage('No active contour on this slice to edit.');
      return;
    }

    const nearestPoint = findNearestEditablePoint(canvasPoint);
    const contourPoints = getActiveContourPoints();

    if (event.shiftKey && nearestPoint) {
      if (contourPoints.length <= 3) {
        setStatusMessage('Contour needs at least 3 vertices.');
        return;
      }
      editPointsRef.current = contourPoints.filter((_, index) => index !== nearestPoint.index);
      commitEditedContour(`Deleted vertex ${nearestPoint.index + 1}.`);
      return;
    }

    const worldPoint = canvasPointToWorld(canvasPoint);
    if (!worldPoint) return;

    if (nearestPoint) {
      editingPointIndexRef.current = nearestPoint.index;
      editPointsRef.current = contourPoints;
      drawingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setStatusMessage(`Editing vertex ${nearestPoint.index + 1}. Release to save.`);
      return;
    }

    const insertIndex = event.detail >= 2 ? findNearestEditableSegment(canvasPoint) : null;
    if (insertIndex !== null) {
      editPointsRef.current = [
        ...contourPoints.slice(0, insertIndex),
        worldPoint,
        ...contourPoints.slice(insertIndex),
      ];
      commitEditedContour(`Inserted vertex ${insertIndex + 1}.`);
      return;
    }

    setStatusMessage('Drag a vertex, double-click an edge to insert, or Shift-click a vertex to delete.');
  };

  const handleDoubleClick = (event: React.MouseEvent<SVGSVGElement>) => {
    if (activeTool === 'measureArea' && measurementDraftPoints.length >= 3) {
      event.preventDefault();
      event.stopPropagation();
      commitMeasurement('area', measurementDraftPoints);
      setMeasurementDraftPoints([]);
      return;
    }

    if (!isDrawable || activeTool !== 'edit' || !activeContourOnSlice) return;

    event.preventDefault();
    event.stopPropagation();

    const canvasPoint = getCanvasPointFromClient(event.clientX, event.clientY);
    if (!canvasPoint) return;

    const worldPoint = canvasPointToWorld(canvasPoint);
    const insertIndex = findNearestEditableSegment(canvasPoint, 18);
    const contourPoints = getActiveContourPoints();
    if (!worldPoint || insertIndex === null || contourPoints.length < 3) {
      setStatusMessage('Double-click closer to a contour edge to insert a vertex.');
      return;
    }

    editPointsRef.current = [
      ...contourPoints.slice(0, insertIndex),
      worldPoint,
      ...contourPoints.slice(insertIndex),
    ];
    commitEditedContour(`Inserted vertex ${insertIndex + 1}.`);
  };

  const handlePointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (isMeasurementTool) {
      if (!canMeasure) {
        setStatusMessage('Load a series to measure.');
        return;
      }
      const canvasPoint = getCanvasPoint(event);
      if (!canvasPoint) return;
      handleMeasurementPointerDown(event, canvasPoint);
      return;
    }

    if (!isDrawable) {
      logClientDebug('ContourOverlay', `pointerdown:blocked viewport=${viewportId}`);
      return;
    }

    const canvasPoint = getCanvasPoint(event);
    if (!canvasPoint) return;

    logClientDebug(
      'ContourOverlay',
      `pointerdown:start viewport=${viewportId} tool=${activeTool} x=${canvasPoint[0].toFixed(1)} y=${canvasPoint[1].toFixed(1)}`
    );

    if (activeTool === 'edit') {
      handleEditPointerDown(event, canvasPoint);
      return;
    }

    if (activeTool === 'eraser') {
      eraseCurrentSliceContour();
      return;
    }

    if (activeTool === 'brush') {
      stampBrushContour(canvasPoint);
      return;
    }

    if (activeTool === 'polygon') {
      if (draftPointsRef.current.length >= 3 && event.detail >= 2) {
        finishDrawing(canvasPoint);
        return;
      }
      appendPoint(canvasPoint);
      setStatusMessage(`${draftPointsRef.current.length} polygon vertices. Enter or double-click saves.`);
      return;
    }

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
    if (!canvasPoint) return;

    if (activeTool === 'edit') {
      const editIndex = editingPointIndexRef.current;
      const worldPoint = canvasPointToWorld(canvasPoint);
      if (editIndex === null || !worldPoint) return;
      editPointsRef.current = editPointsRef.current.map((point, index) =>
        index === editIndex ? worldPoint : point
      );
      setDraftPoints(editPointsRef.current);
      return;
    }

    const lastPoint = lastCanvasPointRef.current;
    if (!lastPoint) return;

    const dx = canvasPoint[0] - lastPoint[0];
    const dy = canvasPoint[1] - lastPoint[1];
    if (dx * dx + dy * dy < 1) return;

    appendInterpolatedPoints(lastPoint, canvasPoint);
    lastCanvasPointRef.current = canvasPoint;
  };

  const finishDrawing = (canvasPoint?: [number, number]) => {
    if (activeTool === 'edit') {
      drawingRef.current = false;
      lastCanvasPointRef.current = null;
      const editedIndex = editingPointIndexRef.current;
      editingPointIndexRef.current = null;
      setDraftPoints([]);
      if (editedIndex !== null) {
        commitEditedContour(`Moved vertex ${editedIndex + 1}.`);
      }
      return;
    }

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
    const saved = ContourEngine.addContour(activeStructureSet.id, activeStructure.id, {
      points: flattenWorldPoints(draftPointsRef.current),
      slicePosition: currentSlicePosition,
      sopInstanceUID: currentFrame.sopInstanceUID,
    });
    if (!saved) {
      clearDraft('Unlock the selected structure before saving contours.');
      return;
    }
    StructureSetManager.refreshVolume(
      activeStructureSet.id,
      activeStructure.id,
      activeSeries.volume.spacing[2] || 1
    );
    clearDraft(`Saved contour on ${activeStructure.name}.`);
  };

  const stampBrushContour = (canvasPoint: [number, number]) => {
    if (!viewport) return;

    const samples = 48;
    const radius = Math.max(3, brushRadius);
    const points: WorldPoint[] = [];
    for (let index = 0; index < samples; index += 1) {
      const angle = (Math.PI * 2 * index) / samples;
      const samplePoint: [number, number] = [
        canvasPoint[0] + Math.cos(angle) * radius,
        canvasPoint[1] + Math.sin(angle) * radius,
      ];
      try {
        const worldPoint = viewport.canvasToWorld(samplePoint);
        points.push([worldPoint[0], worldPoint[1], currentSlicePosition]);
      } catch {
        // Ignore samples outside the drawable canvas.
      }
    }

    draftPointsRef.current = points;
    setDraftPoints(points);
    finishDrawing();
  };

  const eraseCurrentSliceContour = () => {
    if (!activeStructureSet || !activeStructure || !activeSeries || !activeContourOnSlice) {
      setStatusMessage('No contour on this slice to erase.');
      return;
    }

    const deleted = ContourEngine.deleteContourOnSlice(
      activeStructureSet.id,
      activeStructure.id,
      activeContourOnSlice.slicePosition
    );
    if (!deleted) {
      setStatusMessage('Unlock the selected structure before erasing contours.');
      return;
    }
    StructureSetManager.refreshVolume(
      activeStructureSet.id,
      activeStructure.id,
      activeSeries.volume.spacing[2] || 1
    );
    clearDraft(`Erased contour on ${activeStructure.name}.`);
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
      style={{ pointerEvents: (orientation === 'AXIAL' && isContourEditTool) || isMeasurementTool ? 'auto' : 'none', touchAction: 'none' }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onDoubleClick={handleDoubleClick}
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

      {orientation === 'AXIAL' && activeTool === 'edit' && editablePoints.map((point) => (
        <circle
          key={`edit-point-${point.index}-${point.canvas[0]}-${point.canvas[1]}`}
          cx={point.canvas[0] + canvasMetrics.offsetX}
          cy={point.canvas[1] + canvasMetrics.offsetY}
          r="4"
          fill={activeStructure ? `rgb(${activeStructure.color.join(', ')})` : '#3b82f6'}
          stroke="#000"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {renderableMeasurements.map((measurement) => (
        <g key={measurement.id}>
          {measurement.kind === 'area' && measurement.canvasPoints.length >= 3 ? (
            <polygon
              points={measurement.canvasPoints.map((point) => point.join(',')).join(' ')}
              fill="rgba(234, 179, 8, 0.08)"
              stroke="#eab308"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {measurement.kind !== 'area' && measurement.canvasPoints.length >= 2 ? (
            <polyline
              points={measurement.canvasPoints.map((point) => point.join(',')).join(' ')}
              fill="none"
              stroke="#eab308"
              strokeWidth="1.5"
              vectorEffect="non-scaling-stroke"
            />
          ) : null}
          {measurement.canvasPoints.map((point, index) => (
            <circle
              key={`${measurement.id}-${index}`}
              cx={point[0]}
              cy={point[1]}
              r="2.5"
              fill="#eab308"
              stroke="#000"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <text
            x={measurement.canvasPoints.at(-1)![0] + 6}
            y={measurement.canvasPoints.at(-1)![1] - 6}
            fill="#eab308"
            fontSize="10"
            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
            paintOrder="stroke"
            stroke="rgba(0,0,0,0.75)"
            strokeWidth="3"
          >
            {measurement.label}
          </text>
        </g>
      ))}

      {measurementDraftCanvasPoints.length > 0 && (
        <g>
          <polyline
            points={measurementDraftCanvasPoints.map((point) => point.join(',')).join(' ')}
            fill="none"
            stroke="#eab308"
            strokeWidth="1.5"
            strokeDasharray="4 2"
            vectorEffect="non-scaling-stroke"
          />
          {measurementDraftCanvasPoints.map((point, index) => (
            <circle
              key={`measurement-draft-${index}`}
              cx={point[0]}
              cy={point[1]}
              r="2.5"
              fill="#eab308"
              stroke="#000"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </g>
      )}

      {(isContourEditTool || isMeasurementTool) && statusMessage && (
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
