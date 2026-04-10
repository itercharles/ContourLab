import { useUIStore, type ViewerTool, type WLPreset } from '../../core/store/uiStore';
import { MPRController, VIEWPORT_IDS } from '../../core/rendering/MPRController';
import { ViewportManager } from '../../core/rendering/ViewportManager';
import { UndoRedoManager } from '../../core/contouring/UndoRedoManager';
import { WINDOW_LEVEL_PRESETS } from '../../core/rendering/WindowLevelPresets';

// Map our ViewerTool names to Cornerstone tool names
const TOOL_NAME_MAP: Partial<Record<ViewerTool, string>> = {
  windowLevel: 'WindowLevelTool',
  zoom: 'ZoomTool',
  pan: 'PanTool',
  scroll: 'StackScrollTool',
};

const PRESET_OPTIONS: WLPreset[] = ['lung', 'bone', 'softTissue', 'brain', 'abdomen'];

interface ToolButtonProps {
  label: string;
  tool: ViewerTool;
  activeTool: ViewerTool;
  onClick: (tool: ViewerTool) => void;
  title?: string;
}

function ToolButton({ label, tool, activeTool, onClick, title }: ToolButtonProps) {
  const isActive = activeTool === tool;
  return (
    <button
      onClick={() => onClick(tool)}
      title={title ?? label}
      className={`
        px-3 py-1 rounded text-xs font-medium transition-colors
        ${isActive
          ? 'bg-blue-600 text-white ring-1 ring-blue-400'
          : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
        }
      `}
    >
      {label}
    </button>
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

  const handleToolClick = async (tool: ViewerTool) => {
    setActiveTool(tool);
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
    <div className="flex items-center gap-2 px-4 py-2 bg-gray-800 border-b border-gray-700 flex-none flex-wrap">
      {/* Tool buttons */}
      <div className="flex items-center gap-1">
        <ToolButton label="WL" tool="windowLevel" activeTool={activeTool} onClick={handleToolClick} title="Window/Level" />
        <ToolButton label="Zoom" tool="zoom" activeTool={activeTool} onClick={handleToolClick} title="Zoom" />
        <ToolButton label="Pan" tool="pan" activeTool={activeTool} onClick={handleToolClick} title="Pan" />
        <ToolButton label="Scroll" tool="scroll" activeTool={activeTool} onClick={handleToolClick} title="Stack Scroll" />
      </div>

      <div className="h-4 w-px bg-gray-600 mx-1" />

      {/* Window level preset */}
      <select
        value={windowLevelPreset}
        onChange={(e) => handlePresetChange(e.target.value as WLPreset)}
        className="bg-gray-700 text-gray-200 text-xs rounded px-2 py-1 border border-gray-600 hover:border-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 cursor-pointer"
        title="Window/Level Preset"
      >
        {PRESET_OPTIONS.map((preset) => (
          <option key={preset} value={preset}>
            {WINDOW_LEVEL_PRESETS[preset].label}
          </option>
        ))}
      </select>

      <div className="h-4 w-px bg-gray-600 mx-1" />

      {/* Crosshairs toggle */}
      <button
        onClick={handleCrosshairsToggle}
        title={crosshairsEnabled ? 'Disable crosshairs' : 'Enable crosshairs'}
        className={`
          flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium transition-colors
          ${crosshairsEnabled
            ? 'bg-teal-700 text-teal-100 ring-1 ring-teal-500'
            : 'bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white'
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
        Crosshairs
      </button>

      <div className="h-4 w-px bg-gray-600 mx-1" />

      {/* Undo / Redo */}
      <div className="flex items-center gap-1">
        <button
          onClick={handleUndo}
          disabled={!UndoRedoManager.canUndo()}
          title="Undo (Ctrl+Z / Cmd+Z)"
          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M1 4h6a4 4 0 0 1 0 8H3" />
            <polyline points="4 1 1 4 4 7" />
          </svg>
          Undo
        </button>
        <button
          onClick={handleRedo}
          disabled={!UndoRedoManager.canRedo()}
          title="Redo (Ctrl+Shift+Z / Cmd+Shift+Z)"
          className="flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Redo
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 4H5a4 4 0 0 0 0 8h4" />
            <polyline points="8 1 11 4 8 7" />
          </svg>
        </button>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Sidebar toggle */}
      <button
        onClick={toggleRightSidebar}
        title="Toggle structure panel"
        className="flex items-center gap-1.5 px-3 py-1 rounded text-xs font-medium bg-gray-700 text-gray-300 hover:bg-gray-600 hover:text-white transition-colors"
      >
        <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="1" y="1" width="11" height="11" rx="1" />
          <line x1="8.5" y1="1" x2="8.5" y2="12" />
        </svg>
        Panel
      </button>
    </div>
  );
}
