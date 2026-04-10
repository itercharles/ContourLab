import { useUIStore, type ViewerTool, type WLPreset } from '../../core/store/uiStore';
import { MPRController, VIEWPORT_IDS } from '../../core/rendering/MPRController';
import { ViewportManager } from '../../core/rendering/ViewportManager';
import { UndoRedoManager } from '../../core/contouring/UndoRedoManager';
import { WINDOW_LEVEL_PRESETS } from '../../core/rendering/WindowLevelPresets';
import { useStructureStore } from '../../core/store/structureStore';
import { useVolumeStore } from '../../core/store/volumeStore';

// Map our ViewerTool names to Cornerstone tool names
const TOOL_NAME_MAP: Partial<Record<ViewerTool, string>> = {
  windowLevel: 'WindowLevelTool',
  zoom: 'ZoomTool',
  pan: 'PanTool',
  scroll: 'StackScrollTool',
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
    description: 'Adjust image brightness and contrast. Wheel changes slices.',
  },
  zoom: {
    shortLabel: 'Z',
    name: 'Zoom',
    shortcut: 'Z',
    description: 'Magnify or reduce the viewport. Ctrl + wheel also zooms.',
  },
  pan: {
    shortLabel: 'P',
    name: 'Pan',
    shortcut: 'P',
    description: 'Move the image within the viewport.',
  },
  scroll: {
    shortLabel: 'S',
    name: 'Scroll',
    shortcut: 'S',
    description: 'Move through image slices. Mouse wheel also scrolls slices.',
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
    description: 'Draw a contour on the axial slice.',
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
        aria-label={`${label}${shortcut ? ` (${shortcut})` : ''}: ${description}`}
        className={`
          w-7 h-7 rounded text-[11px] font-medium transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none
          ${isActive
            ? 'bg-blue-600 text-white'
            : 'bg-[#2e2e2e] text-[#a0a0a0] hover:bg-[#3a3a3a] hover:text-[#e5e5e5]'
          }
        `}
      >
        {label}
      </button>
      <div className="pointer-events-none absolute left-0 top-[calc(100%+6px)] z-20 hidden min-w-40 rounded border border-[#3a3a3a] bg-[#111] px-2 py-1.5 text-left shadow-none group-hover:block">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-[#e5e5e5]">{label}</span>
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

export default function Toolbar() {
  const activeTool = useUIStore((s) => s.activeTool);
  const setActiveTool = useUIStore((s) => s.setActiveTool);
  const windowLevelPreset = useUIStore((s) => s.windowLevelPreset);
  const setWindowLevelPreset = useUIStore((s) => s.setWindowLevelPreset);
  const crosshairsEnabled = useUIStore((s) => s.crosshairsEnabled);
  const setCrosshairsEnabled = useUIStore((s) => s.setCrosshairsEnabled);
  const toggleRightSidebar = useUIStore((s) => s.toggleRightSidebar);
  const setRightSidebarOpen = useUIStore((s) => s.setRightSidebarOpen);
  const setActiveViewport = useUIStore((s) => s.setActiveViewport);
  const activeSeriesUID = useVolumeStore((s) => s.activeSeriesUID);
  const structureSets = useStructureStore((s) => s.structureSets);
  const activeStructureSetId = useStructureStore((s) => s.activeStructureSetId);
  const activeStructureId = useStructureStore((s) => s.activeStructureId);
  const activeToolMeta = TOOL_META[activeTool];
  const activeStructureSet =
    structureSets.find((structureSet) => structureSet.id === activeStructureSetId) ??
    structureSets.find((structureSet) => structureSet.referencedSeriesUID === activeSeriesUID);
  const activeStructure = activeStructureSet?.structures.find(
    (structure) => structure.id === activeStructureId
  );
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
  const activeToolDescription =
    activeTool === 'freehand' && freehandBlockedReason
      ? freehandBlockedReason
      : activeToolMeta.description;

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

  return (
    <div className="h-9 flex items-center gap-1 px-2 bg-[#1a1a1a] border-b border-[#2a2a2a] flex-none">
      {/* Tool buttons */}
      <div className="flex items-center gap-1">
        {(['windowLevel', 'zoom', 'pan', 'scroll', 'freehand'] as ViewerTool[]).map((tool) => (
          <ToolButton
            key={tool}
            label={TOOL_META[tool].shortLabel}
            description={
              tool === 'freehand' && freehandBlockedReason
                ? `${TOOL_META[tool].description} ${freehandBlockedReason}`
                : TOOL_META[tool].description
            }
            tool={tool}
            activeTool={activeTool}
            onClick={handleToolClick}
            shortcut={TOOL_META[tool].shortcut}
          />
        ))}
      </div>

      {/* Separator */}
      <div className="w-px h-4 bg-[#3a3a3a] mx-1" />

      <div className="min-w-0 max-w-56 text-[10px] leading-none">
        <p className="truncate text-[#e5e5e5]">
          {activeToolMeta.name}
          {activeToolMeta.shortcut ? (
            <span className="ml-1 font-mono text-[#6b6b6b]">[{activeToolMeta.shortcut}]</span>
          ) : null}
        </p>
        <p className={`mt-0.5 truncate ${activeTool === 'freehand' && freehandBlockedReason ? 'text-[#f59e0b]' : 'text-[#6b6b6b]'}`}>
          {activeToolDescription}
        </p>
      </div>

      {/* Separator */}
      <div className="w-px h-4 bg-[#3a3a3a] mx-1" />

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

      {/* Crosshairs toggle */}
      <button
        onClick={handleCrosshairsToggle}
        title="Crosshairs"
        className={`
          w-7 h-7 flex items-center justify-center rounded transition-colors
          ${crosshairsEnabled
            ? 'bg-blue-600 text-white'
            : 'bg-[#2e2e2e] text-[#a0a0a0] hover:bg-[#3a3a3a] hover:text-[#e5e5e5]'
          }
        `}
      >
        {/* Crosshair icon */}
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <line x1="6.5" y1="0" x2="6.5" y2="4" />
          <line x1="6.5" y1="9" x2="6.5" y2="13" />
          <line x1="0" y1="6.5" x2="4" y2="6.5" />
          <line x1="9" y1="6.5" x2="13" y2="6.5" />
          <circle cx="6.5" cy="6.5" r="2" />
        </svg>
      </button>

      {/* Separator */}
      <div className="w-px h-4 bg-[#3a3a3a] mx-1" />

      {/* Undo / Redo */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleUndo}
          disabled={!UndoRedoManager.canUndo()}
          title="Undo [Ctrl+Z]"
          className="w-7 h-7 flex items-center justify-center rounded text-[11px] font-medium bg-[#2e2e2e] text-[#a0a0a0] hover:bg-[#3a3a3a] hover:text-[#e5e5e5] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 4h6a4 4 0 0 1 0 8H3" />
            <polyline points="4 1 1 4 4 7" />
          </svg>
        </button>
        <button
          onClick={handleRedo}
          disabled={!UndoRedoManager.canRedo()}
          title="Redo [Ctrl+Shift+Z]"
          className="w-7 h-7 flex items-center justify-center rounded text-[11px] font-medium bg-[#2e2e2e] text-[#a0a0a0] hover:bg-[#3a3a3a] hover:text-[#e5e5e5] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H5a4 4 0 0 0 0 8h4" />
            <polyline points="8 1 11 4 8 7" />
          </svg>
        </button>
      </div>

      {/* Spacer — pushes panel toggle to the right */}
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
  );
}
