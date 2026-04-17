import { useEffect, useMemo, useState } from 'react';
import { useUIStore, type ViewerTool, type WLPreset } from '../../core/store/uiStore';
import { MPRController, VIEWPORT_IDS } from '../../core/rendering/MPRController';
import { ViewportManager } from '../../core/rendering/ViewportManager';
import { ContourEngine } from '../../core/contouring/ContourEngine';
import { UndoRedoManager } from '../../core/contouring/UndoRedoManager';
import { findContourOnFrame } from '../../core/contouring/contourOverlayUtils';
import { WINDOW_LEVEL_PRESETS } from '../../core/rendering/WindowLevelPresets';
import { useStructureStore } from '../../core/store/structureStore';
import { useVolumeStore } from '../../core/store/volumeStore';
import { StructureSetManager } from '../../core/structures/StructureSetManager';
import { logClientDebug } from '../../core/debug/clientDebugLog';
import WorkspaceContextBar from '../layout/WorkspaceContextBar';

// Map our ViewerTool names to Cornerstone tool names
const TOOL_NAME_MAP: Partial<Record<ViewerTool, string>> = {
  windowLevel: 'WindowLevel',
  zoom: 'Zoom',
  pan: 'Pan',
  scroll: 'StackScroll',
};

const PRESET_OPTIONS: WLPreset[] = ['lung', 'bone', 'softTissue', 'brain', 'abdomen'];

const TOOL_META: Record<ViewerTool, {
  shortLabel: string;
  name: string;
  shortcut?: string;
  description: string;
}> = {
  windowLevel: {
    shortLabel: 'WL',
    name: 'Window / Level',
    shortcut: 'W',
    description: 'Left-drag adjusts window/level. Wheel changes slices. Middle-drag pans. Right-drag zooms.',
  },
  zoom: {
    shortLabel: 'Z',
    name: 'Zoom',
    shortcut: 'Z',
    description: 'Left-drag zooms. Ctrl + wheel also zooms. Right-drag zooms in any tool.',
  },
  pan: {
    shortLabel: 'P',
    name: 'Pan',
    shortcut: 'P',
    description: 'Left-drag pans. Middle-drag pans in any tool.',
  },
  scroll: {
    shortLabel: 'S',
    name: 'Scroll',
    shortcut: 'S',
    description: 'Wheel scrolls slices in any tool. Shift + left-drag also scrolls.',
  },
  crosshairs: {
    shortLabel: 'CH',
    name: 'Crosshairs',
    description: 'Synchronize slice position across viewports.',
  },
  freehand: {
    shortLabel: 'F',
    name: 'Freehand Contour',
    shortcut: 'F',
    description: 'Left-drag draws on the axial slice. Delete removes the current-slice contour.',
  },
  polygon: {
    shortLabel: 'PG',
    name: 'Polygon',
    description: 'Place point-by-point contour vertices.',
  },
  brush: {
    shortLabel: 'B',
    name: 'Brush',
    description: 'Paint a contour region voxel by voxel.',
  },
  eraser: {
    shortLabel: 'E',
    name: 'Eraser',
    description: 'Erase contour content on the current slice.',
  },
};

interface ToolButtonProps {
  label: string;
  description: string;
  tool: ViewerTool;
  activeTool: ViewerTool;
  onClick: (tool: ViewerTool) => void;
  shortcut?: string;
}

function ToolButton({ label, description, tool, activeTool, onClick, shortcut }: ToolButtonProps) {
  const isActive = activeTool === tool;
  return (
    <div className="relative group">
      <button
        onClick={() => onClick(tool)}
        aria-label={`${TOOL_META[tool].name}${shortcut ? ` (${shortcut})` : ''}: ${description}`}
        className={`
          w-7 h-7 flex items-center justify-center rounded text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none
          ${isActive
            ? 'bg-blue-600 text-white'
            : 'bg-[#2e2e2e] text-[#a0a0a0] hover:bg-[#3a3a3a] hover:text-[#e5e5e5]'
          }
        `}
      >
        <ToolIcon tool={tool} fallback={label} />
      </button>
      <div className="pointer-events-none absolute left-0 top-[calc(100%+6px)] z-20 hidden min-w-40 rounded border border-[#3a3a3a] bg-[#111] px-2 py-1.5 text-left shadow-none group-hover:block">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-[#e5e5e5]">{TOOL_META[tool].name}</span>
          {shortcut && (
            <span className="rounded border border-[#3a3a3a] px-1 text-[10px] font-mono text-[#a0a0a0]">
              {shortcut}
            </span>
          )}
        </div>
        <p className="mt-1 max-w-48 text-[10px] leading-snug text-[#a0a0a0]">{description}</p>
      </div>
    </div>
  );
}

function ToolIcon({ tool, fallback }: { tool: ViewerTool; fallback: string }) {
  switch (tool) {
    case 'windowLevel':
      return <span className="font-semibold">WL</span>;
    case 'zoom':
      return (
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="6" cy="6" r="4" />
          <path d="M9.2 9.2 12.5 12.5" />
          <path d="M6 4.2v3.6M4.2 6h3.6" />
        </svg>
      );
    case 'pan':
      return (
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4.5 7.2V3.4a1 1 0 0 1 2 0V7" />
          <path d="M6.5 6V2.6a1 1 0 0 1 2 0V7" />
          <path d="M8.5 6.2V3.4a1 1 0 0 1 2 0v4.8" />
          <path d="M4.5 7.2 3.7 6.4a1 1 0 0 0-1.4 1.4l2.6 2.8A3.4 3.4 0 0 0 7.4 12h.9a2.2 2.2 0 0 0 2.2-2.2V8.2" />
        </svg>
      );
    case 'scroll':
      return (
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <rect x="4" y="2" width="6" height="10" rx="1.4" />
          <path d="M7 4.2v2.2" />
          <path d="M2.2 4.2 1 5.4l1.2 1.2" />
          <path d="M11.8 7.4 13 8.6l-1.2 1.2" />
        </svg>
      );
    case 'freehand':
      return (
        <svg aria-hidden="true" width="15" height="14" viewBox="0 0 15 14" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
          <path d="M2 10.8c2.4-6.4 3.8 1.8 6.2-4.5 1.2-3.2 2.5-2.5 4.8-1" />
          <path d="M10.6 3.3 12.7 1.2l1.1 1.1-2.1 2.1" />
        </svg>
      );
    default:
      return <span>{fallback}</span>;
  }
}

interface AxialViewportLike {
  getCamera?: () => { focalPoint?: [number, number, number] };
}

interface SliceFrame {
  sopInstanceUID: string;
  sliceLocation: number;
}

export default function Toolbar() {
  const [axialRevision, setAxialRevision] = useState(0);
  const [undoRedoRevision, setUndoRedoRevision] = useState(0);
  const activeTool = useUIStore((s) => s.activeTool);
  const setActiveTool = useUIStore((s) => s.setActiveTool);
  const windowLevelPreset = useUIStore((s) => s.windowLevelPreset);
  const setWindowLevelPreset = useUIStore((s) => s.setWindowLevelPreset);
  const crosshairsEnabled = useUIStore((s) => s.crosshairsEnabled);
  const setCrosshairsEnabled = useUIStore((s) => s.setCrosshairsEnabled);
  const toggleLeftSidebar = useUIStore((s) => s.toggleLeftSidebar);
  const toggleRightSidebar = useUIStore((s) => s.toggleRightSidebar);
  const setRightSidebarOpen = useUIStore((s) => s.setRightSidebarOpen);
  const setActiveViewport = useUIStore((s) => s.setActiveViewport);
  const activeSeriesUID = useVolumeStore((s) => s.activeSeriesUID);
  const loadedSeries = useVolumeStore((s) => s.loadedSeries);
  const structureSets = useStructureStore((s) => s.structureSets);
  const activeStructureSetId = useStructureStore((s) => s.activeStructureSetId);
  const activeStructureId = useStructureStore((s) => s.activeStructureId);
  const activeStructureSetById = structureSets.find(
    (structureSet) => structureSet.id === activeStructureSetId
  );
  const activeStructureSet =
    activeStructureSetById?.referencedSeriesUID === activeSeriesUID
      ? activeStructureSetById
      : structureSets.find((structureSet) => structureSet.referencedSeriesUID === activeSeriesUID);
  const activeStructure = activeStructureSet?.structures.find(
    (structure) => structure.id === activeStructureId
  );
  useEffect(() => {
    const axialElement = document.querySelector<HTMLDivElement>(
      `[data-viewport-id="${VIEWPORT_IDS.AXIAL}"]`
    );
    if (!axialElement) return;

    const update = () => setAxialRevision((value) => value + 1);
    axialElement.addEventListener('CORNERSTONE_IMAGE_RENDERED', update);
    axialElement.addEventListener('CORNERSTONE_CAMERA_MODIFIED', update);

    return () => {
      axialElement.removeEventListener('CORNERSTONE_IMAGE_RENDERED', update);
      axialElement.removeEventListener('CORNERSTONE_CAMERA_MODIFIED', update);
    };
  }, []);

  useEffect(() => {
    return UndoRedoManager.subscribe(() => {
      setUndoRedoRevision((value) => value + 1);
    });
  }, []);

  const axialViewport = useMemo(() => {
    void axialRevision;
    return ViewportManager.getRenderingEngine()?.getViewport(VIEWPORT_IDS.AXIAL) as
      | AxialViewportLike
      | undefined;
  }, [axialRevision]);

  const axialSlicePosition = axialViewport?.getCamera?.()?.focalPoint?.[2] ?? 0;
  const activeLoadedSeries = loadedSeries.find((series) => series.seriesUID === activeSeriesUID);
  const currentFrame = useMemo(() => {
    const instances: SliceFrame[] = (activeLoadedSeries?.series.instances ?? []).flatMap((instance) => (
      Number.isFinite(instance.sliceLocation)
        ? [{
            sopInstanceUID: instance.sopInstanceUID,
            sliceLocation: instance.sliceLocation as number,
          }]
        : []
    ));
    if (instances.length === 0) return undefined;

    const [firstFrame, ...restFrames] = instances;
    return restFrames.reduce((closest, frame) => (
      Math.abs(frame.sliceLocation - axialSlicePosition) < Math.abs(closest.sliceLocation - axialSlicePosition)
        ? frame
        : closest
    ), firstFrame);
  }, [activeLoadedSeries?.series.instances, axialSlicePosition]);
  const axialSliceTolerance = Math.max(activeLoadedSeries?.volume.spacing[2] ?? 1, 1) / 2;
  const currentSlicePosition = currentFrame?.sliceLocation ?? axialSlicePosition;
  const activeContourOnSlice = activeStructure
    ? findContourOnFrame(
        activeStructure.contours,
        currentFrame?.sopInstanceUID,
        currentSlicePosition,
        axialSliceTolerance
      )
    : undefined;
  void undoRedoRevision;
  const canUndo = UndoRedoManager.canUndo();
  const canRedo = UndoRedoManager.canRedo();
  const canUseFreehand =
    !!activeSeriesUID &&
    !!activeStructureSet &&
    !!activeStructure &&
    !(activeStructure.isLocked ?? false);
  const freehandBlockedReason = !activeSeriesUID
    ? 'Load a series before drawing.'
    : !activeStructureSet || !activeStructure
      ? 'Create or select a structure in the right panel before drawing.'
      : activeStructure.isLocked
        ? 'Unlock the selected structure before drawing.'
        : null;
  const canDeleteContour =
    !!activeStructureSet &&
    !!activeStructure &&
    !(activeStructure.isLocked ?? false) &&
    !!activeContourOnSlice;

  const handleToolClick = async (tool: ViewerTool) => {
    if (tool === 'freehand' && !canUseFreehand) {
      setRightSidebarOpen(true);
      setActiveViewport('AXIAL');
      return;
    }

    setActiveTool(tool);
    if (tool === 'freehand') {
      setActiveViewport('AXIAL');
    }
    const csToolName = TOOL_NAME_MAP[tool];
    if (csToolName) {
      try {
        await MPRController.setActiveTool(csToolName);
      } catch (err) {
        console.warn('setActiveTool failed:', err);
      }
    }
  };

  const handlePresetChange = (preset: WLPreset) => {
    setWindowLevelPreset(preset);
    const allViewports = Object.values(VIEWPORT_IDS);
    for (const vpId of allViewports) {
      try {
        ViewportManager.setWindowLevel(vpId, preset);
      } catch (err) {
        console.warn(`setWindowLevel failed for ${vpId}:`, err);
      }
    }
  };

  const handleCrosshairsToggle = async () => {
    const next = !crosshairsEnabled;
    setCrosshairsEnabled(next);
    try {
      if (next) {
        await MPRController.enableCrosshairs();
      } else {
        await MPRController.disableCrosshairs();
      }
    } catch (err) {
      console.warn('Crosshairs toggle failed:', err);
    }
  };

  const handleUndo = () => {
    if (UndoRedoManager.canUndo()) UndoRedoManager.undo();
  };

  const handleRedo = () => {
    if (UndoRedoManager.canRedo()) UndoRedoManager.redo();
  };

  const handleDeleteContour = () => {
    if (!activeStructureSet || !activeStructure || !activeContourOnSlice || !activeSeriesUID) return;
    if (activeStructure.isLocked ?? false) return;

    const deleted = ContourEngine.deleteContourOnSlice(
      activeStructureSet.id,
      activeStructure.id,
      activeContourOnSlice.slicePosition
    );
    if (!deleted) return;
    StructureSetManager.refreshVolume(
      activeStructureSet.id,
      activeStructure.id,
      activeLoadedSeries?.volume.spacing[2] || 1
    );
    setActiveViewport('AXIAL');
    logClientDebug(
      'Toolbar',
      `delete:slice slice=${activeContourOnSlice.slicePosition.toFixed(2)} structure=${activeStructure.id}`
    );
  };

  return (
    <div className="flex flex-none flex-col border-b border-[#2a2a2a] bg-[#111]">
      <WorkspaceContextBar />
      <div className="flex h-9 items-center gap-1 px-2 bg-[#1a1a1a]">
        <button
          onClick={toggleLeftSidebar}
          title="Toggle workspace navigator"
          className="w-7 h-7 flex items-center justify-center rounded bg-[#2e2e2e] text-[#a0a0a0] transition-colors hover:bg-[#3a3a3a] hover:text-[#e5e5e5]"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="1" width="11" height="11" rx="1" />
            <line x1="4.5" y1="1" x2="4.5" y2="12" />
          </svg>
        </button>
        <div className="w-px h-4 bg-[#3a3a3a] mx-1" />
        <span className="mr-1 rounded bg-[#242424] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-[#6b6b6b]">
          View
        </span>
        <div className="flex items-center gap-1">
          {(['zoom', 'pan', 'scroll'] as ViewerTool[]).map((tool) => (
            <ToolButton
              key={tool}
              label={TOOL_META[tool].shortLabel}
              description={TOOL_META[tool].description}
              tool={tool}
              activeTool={activeTool}
              onClick={handleToolClick}
              shortcut={TOOL_META[tool].shortcut}
            />
          ))}
        </div>

        {/* Separator */}
        <div className="w-px h-4 bg-[#3a3a3a] mx-1" />

        <span className="mr-1 rounded bg-[#242424] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-[#6b6b6b]">
          Window
        </span>
        <ToolButton
          label={TOOL_META.windowLevel.shortLabel}
          description={TOOL_META.windowLevel.description}
          tool="windowLevel"
          activeTool={activeTool}
          onClick={handleToolClick}
          shortcut={TOOL_META.windowLevel.shortcut}
        />

        {/* Window level preset */}
        <select
          value={windowLevelPreset}
          onChange={(e) => handlePresetChange(e.target.value as WLPreset)}
          className="bg-[#2e2e2e] border border-[#3a3a3a] text-[11px] text-[#e5e5e5] rounded h-6 px-1 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
          title="Window/Level Preset"
        >
          {PRESET_OPTIONS.map((preset) => (
            <option key={preset} value={preset}>
              {WINDOW_LEVEL_PRESETS[preset].label}
            </option>
          ))}
        </select>

        {/* Separator */}
        <div className="w-px h-4 bg-[#3a3a3a] mx-1" />

        <button
          onClick={handleCrosshairsToggle}
          title="Crosshair sync: link slice position across axial, sagittal, and coronal views"
          aria-label="Crosshair sync: link slice position across axial, sagittal, and coronal views"
          className={`
          h-7 flex items-center gap-1 rounded px-2 text-[10px] font-medium transition-colors
          ${crosshairsEnabled
            ? 'bg-blue-600 text-white'
            : 'bg-[#2e2e2e] text-[#a0a0a0] hover:bg-[#3a3a3a] hover:text-[#e5e5e5]'
          }
        `}
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <line x1="6.5" y1="0" x2="6.5" y2="4" />
            <line x1="6.5" y1="9" x2="6.5" y2="13" />
            <line x1="0" y1="6.5" x2="4" y2="6.5" />
            <line x1="9" y1="6.5" x2="13" y2="6.5" />
            <circle cx="6.5" cy="6.5" r="2" />
          </svg>
          Sync
        </button>

        {/* Separator */}
        <div className="w-px h-4 bg-[#3a3a3a] mx-1" />

        <span className="mr-1 rounded bg-[#242424] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-[#6b6b6b]">
          Contour
        </span>
        <ToolButton
          label={TOOL_META.freehand.shortLabel}
          description={
            freehandBlockedReason
              ? `${TOOL_META.freehand.description} ${freehandBlockedReason}`
              : TOOL_META.freehand.description
          }
          tool="freehand"
          activeTool={activeTool}
          onClick={handleToolClick}
          shortcut={TOOL_META.freehand.shortcut}
        />
        <div className="flex items-center gap-1">
          <button
            onClick={handleUndo}
            disabled={!canUndo}
            title={canUndo ? `Undo: ${UndoRedoManager.getUndoDescription()} [Ctrl+Z]` : 'Undo [Ctrl+Z]'}
            className="h-7 rounded bg-[#2e2e2e] px-2 text-[10px] font-medium text-[#a0a0a0] transition-colors hover:bg-[#3a3a3a] hover:text-[#e5e5e5] disabled:cursor-not-allowed disabled:opacity-30"
          >
            Undo
          </button>
          <button
            onClick={handleRedo}
            disabled={!canRedo}
            title={canRedo ? `Redo: ${UndoRedoManager.getRedoDescription()} [Ctrl+Shift+Z]` : 'Redo [Ctrl+Shift+Z]'}
            className="h-7 rounded bg-[#2e2e2e] px-2 text-[10px] font-medium text-[#a0a0a0] transition-colors hover:bg-[#3a3a3a] hover:text-[#e5e5e5] disabled:cursor-not-allowed disabled:opacity-30"
          >
            Redo
          </button>
          <button
            onClick={handleDeleteContour}
            disabled={!canDeleteContour}
            title={
              canDeleteContour
                ? `Delete contour on z=${activeContourOnSlice.slicePosition.toFixed(1)} [Delete]`
                : 'No active contour on current slice'
            }
            className="h-7 rounded bg-[#2e2e2e] px-2 text-[10px] font-medium text-[#a0a0a0] transition-colors hover:bg-[#3a3a3a] hover:text-[#ef4444] disabled:cursor-not-allowed disabled:opacity-30"
          >
            Delete Slice
          </button>
        </div>

        {activeTool === 'freehand' && activeStructure && (
          <div className="ml-1 min-w-0 max-w-44 text-[10px] leading-none">
            <p className="truncate text-[#a0a0a0]" title={activeStructure.name}>
              ROI: {activeStructure.name}
            </p>
            <p className={activeContourOnSlice ? 'mt-0.5 text-[#22c55e]' : 'mt-0.5 text-[#6b6b6b]'}>
              {activeContourOnSlice ? 'Current slice has contour' : 'No contour on current slice'}
            </p>
          </div>
        )}

        {/* Spacer - pushes panel toggle to the right */}
        <div className="ml-auto" />

        {/* Sidebar toggle */}
        <button
          onClick={toggleRightSidebar}
          title="Toggle structure panel"
          className="w-7 h-7 flex items-center justify-center rounded bg-[#2e2e2e] text-[#a0a0a0] hover:bg-[#3a3a3a] hover:text-[#e5e5e5] transition-colors"
        >
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <rect x="1" y="1" width="11" height="11" rx="1" />
            <line x1="8.5" y1="1" x2="8.5" y2="12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
