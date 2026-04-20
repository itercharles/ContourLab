import { MPRController } from '../../core/rendering/MPRController';
import { useStructureStore } from '../../core/store/structureStore';
import { useUIStore, type ViewerTool } from '../../core/store/uiStore';
import { useVolumeStore } from '../../core/store/volumeStore';
import { logClientDebug } from '../../core/debug/clientDebugLog';

type ToolIconName =
  | 'pointer'
  | 'pan'
  | 'zoom'
  | 'windowlevel'
  | 'scroll'
  | 'crosshair'
  | 'measure'
  | 'angle'
  | 'area'
  | 'hu'
  | 'edit'
  | 'brush'
  | 'pen'
  | 'polygon'
  | 'eraser'
  | 'livewire'
  | 'threshold'
  | 'interpolate'
  | 'margin'
  | 'boolean'
  | 'ai'
  | 'info';

interface ToolRailItem {
  id: ViewerTool | string;
  name: string;
  icon: ToolIconName;
  shortcut: string;
  implemented: boolean;
}

const CORNERSTONE_TOOL_NAME: Partial<Record<ViewerTool, string>> = {
  windowLevel: 'WindowLevel',
  zoom: 'Zoom',
  pan: 'Pan',
  scroll: 'StackScroll',
};

const CONTOUR_TOOLS = new Set<ViewerTool>(['edit', 'freehand', 'polygon', 'brush', 'eraser']);

const TOOL_GROUPS: Array<{ id: string; items: ToolRailItem[] }> = [
  {
    id: 'nav',
    items: [
      { id: 'pointer', name: 'Select', icon: 'pointer', shortcut: 'V', implemented: false },
      { id: 'pan', name: 'Pan', icon: 'pan', shortcut: 'P', implemented: true },
      { id: 'zoom', name: 'Zoom', icon: 'zoom', shortcut: 'Z', implemented: true },
      { id: 'scroll', name: 'Scroll', icon: 'scroll', shortcut: 'S', implemented: true },
      { id: 'windowLevel', name: 'Window/Level', icon: 'windowlevel', shortcut: 'W', implemented: true },
      { id: 'crosshairs', name: 'Crosshair', icon: 'crosshair', shortcut: 'C', implemented: true },
    ],
  },
  {
    id: 'measure',
    items: [
      { id: 'measureDistance', name: 'Distance', icon: 'measure', shortcut: 'M', implemented: true },
      { id: 'measureAngle', name: 'Angle', icon: 'angle', shortcut: 'A', implemented: true },
      { id: 'measureArea', name: 'Area', icon: 'area', shortcut: 'R', implemented: true },
      { id: 'huProbe', name: 'HU Probe', icon: 'hu', shortcut: 'H', implemented: true },
    ],
  },
  {
    id: 'contour',
    items: [
      { id: 'edit', name: 'Edit contour', icon: 'edit', shortcut: 'D', implemented: true },
      { id: 'freehand', name: 'Freehand', icon: 'pen', shortcut: 'F', implemented: true },
      { id: 'polygon', name: 'Polygon', icon: 'polygon', shortcut: 'G', implemented: true },
      { id: 'brush', name: 'Brush', icon: 'brush', shortcut: 'B', implemented: true },
      { id: 'eraser', name: 'Eraser', icon: 'eraser', shortcut: 'E', implemented: true },
      { id: 'livewire', name: 'Smart Edge', icon: 'livewire', shortcut: 'S', implemented: false },
      { id: 'threshold', name: 'Threshold', icon: 'threshold', shortcut: 'T', implemented: false },
    ],
  },
  {
    id: 'structure',
    items: [
      { id: 'interpolate', name: 'Interpolation controls', icon: 'interpolate', shortcut: 'I', implemented: false },
      { id: 'margin', name: 'Margin', icon: 'margin', shortcut: 'G', implemented: false },
      { id: 'boolean', name: 'Boolean ops', icon: 'boolean', shortcut: 'O', implemented: false },
    ],
  },
  {
    id: 'ai',
    items: [
      { id: 'ai', name: 'AI auto-contour', icon: 'ai', shortcut: 'A', implemented: false },
    ],
  },
];

function ToolIcon({ name }: { name: ToolIconName }) {
  const props = {
    width: 15,
    height: 15,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'pointer':
      return <svg {...props}><path d="M3 2l4 11 2-5 5-2z" /></svg>;
    case 'pan':
      return <svg {...props}><path d="M8 2v6M8 8l-2-2M8 8l2-2M8 8v5a3 3 0 0 1-3-3V6M8 8l2 2v3a3 3 0 0 0 3-3V6" /></svg>;
    case 'zoom':
      return <svg {...props}><circle cx="7" cy="7" r="4" /><path d="M10 10l4 4M5 7h4M7 5v4" /></svg>;
    case 'windowlevel':
      return <svg {...props}><circle cx="8" cy="8" r="5.5" /><path d="M8 2.5v11M3 8a5 5 0 0 1 5-5v10a5 5 0 0 1-5-5z" fill="currentColor" stroke="none" opacity="0.35" /></svg>;
    case 'scroll':
      return <svg {...props}><rect x="5" y="2" width="6" height="12" rx="1.5" /><path d="M8 4.5v2.2M3 5 1.5 6.5 3 8M13 8l1.5 1.5L13 11" /></svg>;
    case 'crosshair':
      return <svg {...props}><path d="M8 1v4M8 11v4M1 8h4M11 8h4" /><circle cx="8" cy="8" r="2" /></svg>;
    case 'measure':
      return <svg {...props}><path d="M2 10l8-8 4 4-8 8z" /><path d="M4 8l1 1M6 6l1 1M8 4l1 1M10 6l1 1" /></svg>;
    case 'angle':
      return <svg {...props}><path d="M2.5 13 7 6l6 3" /><path d="M5.7 8.1c.9.8 1.8 1.2 3.1 1.3" /></svg>;
    case 'area':
      return <svg {...props}><path d="M3 4 8 2.5 13 6.5 10 13 3.5 11 2 7z" /><path d="M3 4 10 13" opacity=".45" /></svg>;
    case 'hu':
      return <svg {...props}><circle cx="8" cy="8" r="2.5" /><path d="M8 1.5v2M8 12.5v2M1.5 8h2M12.5 8h2" /></svg>;
    case 'edit':
      return <svg {...props}><path d="M3 5 8 2.5 13 6 10 13 4 11z" /><circle cx="3" cy="5" r="1" fill="currentColor" /><circle cx="8" cy="2.5" r="1" fill="currentColor" /><circle cx="13" cy="6" r="1" fill="currentColor" /></svg>;
    case 'brush':
      return <svg {...props}><path d="M11 2l3 3-6 6-3-3z" /><path d="M5 8l-2 6 6-2" /></svg>;
    case 'pen':
      return <svg {...props}><path d="M10 2l4 4-9 9H2v-3z" /></svg>;
    case 'polygon':
      return <svg {...props}><path d="M8 2l5 3v6l-5 3-5-3V5z" /><circle cx="8" cy="2" r="1" fill="currentColor" /><circle cx="13" cy="5" r="1" fill="currentColor" /><circle cx="3" cy="11" r="1" fill="currentColor" /></svg>;
    case 'eraser':
      return <svg {...props}><path d="M3 11l5-5 4 4-5 5H4z" /><path d="M8 6l4 4M2 14h10" /></svg>;
    case 'livewire':
      return <svg {...props}><path d="M2 13c2-6 5-6 6-3s4 3 6-3" /><circle cx="2" cy="13" r="1.2" fill="currentColor" /><circle cx="14" cy="7" r="1.2" fill="currentColor" /></svg>;
    case 'threshold':
      return <svg {...props}><rect x="2" y="2" width="12" height="12" rx="1" /><path d="M2 8h12M5 5l2 2M9 9l2 2" /></svg>;
    case 'interpolate':
      return <svg {...props}><path d="M2 4h4M10 4h4M2 8h12M2 12h4M10 12h4" strokeDasharray="2 1.5" /></svg>;
    case 'margin':
      return <svg {...props}><rect x="4" y="4" width="8" height="8" rx="1" /><rect x="2" y="2" width="12" height="12" rx="1" strokeDasharray="2 1.5" /></svg>;
    case 'boolean':
      return <svg {...props}><circle cx="6" cy="8" r="4" /><circle cx="10" cy="8" r="4" /></svg>;
    case 'ai':
      return <svg {...props}><path d="M5 2l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM11 7l.6 1.4L13 9l-1.4.6L11 11l-.6-1.4L9 9l1.4-.6z" fill="currentColor" stroke="none" /></svg>;
    default:
      return <svg {...props}><circle cx="8" cy="8" r="6" /><path d="M8 7v4M8 5v.01" /></svg>;
  }
}

export default function ToolRail() {
  const activeTool = useUIStore((s) => s.activeTool);
  const setActiveTool = useUIStore((s) => s.setActiveTool);
  const setActiveViewport = useUIStore((s) => s.setActiveViewport);
  const setRightSidebarOpen = useUIStore((s) => s.setRightSidebarOpen);
  const crosshairsEnabled = useUIStore((s) => s.crosshairsEnabled);
  const setCrosshairsEnabled = useUIStore((s) => s.setCrosshairsEnabled);
  const activeSeriesUID = useVolumeStore((s) => s.activeSeriesUID);
  const structureSets = useStructureStore((s) => s.structureSets);
  const activeStructureSetId = useStructureStore((s) => s.activeStructureSetId);
  const activeStructureId = useStructureStore((s) => s.activeStructureId);

  const activeStructureSet = structureSets.find(
    (structureSet) =>
      structureSet.id === activeStructureSetId &&
      structureSet.referencedSeriesUID === activeSeriesUID
  );
  const activeStructure = activeStructureSet?.structures.find(
    (structure) => structure.id === activeStructureId
  );
  const canUseContourTool =
    !!activeSeriesUID &&
    !!activeStructureSet &&
    !!activeStructure &&
    !(activeStructure.isLocked ?? false);

  const activateTool = async (tool: ViewerTool) => {
    if (tool === 'crosshairs') {
      const next = !crosshairsEnabled;
      setCrosshairsEnabled(next);
      try {
        if (next) {
          await MPRController.enableCrosshairs();
        } else {
          await MPRController.disableCrosshairs();
        }
      } catch {
        // The tool group may not exist yet while the viewer is initializing.
      }
      return;
    }

    if (CONTOUR_TOOLS.has(tool) && !canUseContourTool) {
      setRightSidebarOpen(true);
      setActiveViewport('AXIAL');
      logClientDebug('ToolRail', `${tool}:blocked missing drawable structure`);
      return;
    }

    setActiveTool(tool);
    if (CONTOUR_TOOLS.has(tool)) {
      setActiveViewport('AXIAL');
    }

    const cornerstoneTool = CORNERSTONE_TOOL_NAME[tool];
    if (cornerstoneTool) {
      try {
        await MPRController.setActiveTool(cornerstoneTool);
      } catch {
        // The tool group may not exist yet while the viewer is initializing.
      }
    }
  };

  return (
    <nav className="flex w-10 flex-none flex-col items-center gap-1 border-r border-[#24292f] bg-[#13161a] py-1.5" aria-label="Tools">
      {TOOL_GROUPS.map((group, groupIndex) => (
        <div key={group.id} className="flex flex-col items-center gap-0.5">
          {groupIndex > 0 && <div className="my-1 h-px w-5 bg-[#24292f]" />}
          {group.items.map((tool) => {
            const isActive =
              tool.id === 'crosshairs' ? crosshairsEnabled : tool.id === activeTool;
            const title = tool.implemented ? `${tool.name} (${tool.shortcut})` : 'Not implemented';
            return (
              <button
                key={tool.id}
                type="button"
                title={title}
                aria-label={title}
                disabled={!tool.implemented}
                data-active={isActive}
                onClick={() => tool.implemented && void activateTool(tool.id as ViewerTool)}
                className={`relative flex h-7 w-7 items-center justify-center rounded text-[#a0a7b0] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                  isActive
                    ? 'bg-[rgba(59,130,246,0.12)] text-[#3b82f6] ring-1 ring-[rgba(59,130,246,0.35)]'
                    : 'hover:bg-[#1f242b] hover:text-[#e6e9ed]'
                } disabled:cursor-not-allowed disabled:text-[#404040] disabled:hover:bg-transparent`}
              >
                {isActive && <span className="absolute -left-[7px] top-1.5 bottom-1.5 w-0.5 rounded bg-[#3b82f6]" />}
                <ToolIcon name={tool.icon} />
                <span className="pointer-events-none absolute bottom-0 right-0.5 font-mono text-[8px] leading-none text-[#6b7280]">
                  {tool.shortcut[0]}
                </span>
              </button>
            );
          })}
        </div>
      ))}
      <div className="flex-1" />
      <button
        type="button"
        title="Not implemented"
        aria-label="Not implemented"
        disabled
        className="flex h-7 w-7 cursor-not-allowed items-center justify-center rounded text-[#404040]"
      >
        <ToolIcon name="info" />
      </button>
    </nav>
  );
}
