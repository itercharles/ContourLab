import type { ReactNode } from 'react';
import { WINDOW_LEVEL_PRESETS } from '../../core/rendering/WindowLevelPresets';
import { useUIStore, type WLPreset } from '../../core/store/uiStore';

const WL_PRESETS: WLPreset[] = ['softTissue', 'lung', 'bone', 'brain', 'mediastinum', 'custom'];

function OptionButton({
  children,
  active = false,
  disabled = false,
  onClick,
}: {
  children: ReactNode;
  active?: boolean;
  disabled?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      data-active={active}
      onClick={onClick}
      className={`flex h-6 items-center gap-1 rounded px-2 text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
        active
          ? 'bg-blue-900/40 text-blue-200'
          : 'text-[#a0a7b0] hover:bg-[#1f242b] hover:text-[#e6e9ed]'
      } disabled:cursor-not-allowed disabled:text-[#404040] disabled:hover:bg-transparent`}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="mx-1 h-4 w-px bg-[#24292f]" />;
}

function Label({ children }: { children: ReactNode }) {
  return (
    <div className="border-r border-[#24292f] px-2 text-[10px] font-semibold uppercase tracking-widest text-[#6b7280]">
      {children}
    </div>
  );
}

export default function ToolOptions() {
  const activeTool = useUIStore((s) => s.activeTool);
  const brushRadius = useUIStore((s) => s.brushRadius);
  const setBrushRadius = useUIStore((s) => s.setBrushRadius);
  const windowLevelPreset = useUIStore((s) => s.windowLevelPreset);
  const setWindowLevelPreset = useUIStore((s) => s.setWindowLevelPreset);

  if (activeTool === 'windowLevel') {
    const activePreset = WINDOW_LEVEL_PRESETS[windowLevelPreset];
    return (
      <div className="absolute left-1/2 top-2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded border border-[#24292f] bg-[#13161a]/95 px-1 py-1 text-[11px] text-[#e6e9ed] backdrop-blur" role="toolbar" aria-label="Window level options">
        <Label>Window</Label>
        {WL_PRESETS.map((preset) => (
          <OptionButton
            key={preset}
            active={windowLevelPreset === preset}
            onClick={() => setWindowLevelPreset(preset)}
          >
            {WINDOW_LEVEL_PRESETS[preset].label}
          </OptionButton>
        ))}
        <Divider />
        <span className="px-2 font-mono text-[10px] text-[#6b7280]">
          W {activePreset.windowWidth} · L {activePreset.windowCenter}
        </span>
      </div>
    );
  }

  if (activeTool === 'brush' || activeTool === 'eraser') {
    const label = activeTool === 'brush' ? 'Brush' : 'Eraser';
    return (
      <div className="absolute left-1/2 top-2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded border border-[#24292f] bg-[#13161a]/95 px-1 py-1 text-[11px] text-[#e6e9ed] backdrop-blur" role="toolbar" aria-label={`${label} options`}>
        <Label>{label}</Label>
        <OptionButton active>Circle</OptionButton>
        <OptionButton disabled>Square</OptionButton>
        <Divider />
        <div className="flex items-center gap-2 px-2">
          <span className="text-[10px] text-[#6b7280]">Size</span>
          <input
            aria-label={`${label} size`}
            type="range"
            min={1}
            max={30}
            value={brushRadius}
            onChange={(event) => setBrushRadius(Number(event.target.value))}
            className="w-24 accent-blue-500"
          />
          <span className="min-w-[34px] font-mono text-[10px] text-[#e6e9ed]">{brushRadius}px</span>
        </div>
        <Divider />
        <OptionButton disabled>3D mode</OptionButton>
      </div>
    );
  }

  if (activeTool === 'freehand' || activeTool === 'polygon') {
    const label = activeTool === 'freehand' ? 'Freehand' : 'Polygon';
    return (
      <div className="absolute left-1/2 top-2 z-20 flex -translate-x-1/2 items-center gap-0.5 rounded border border-[#24292f] bg-[#13161a]/95 px-1 py-1 text-[11px] text-[#e6e9ed] backdrop-blur" role="toolbar" aria-label={`${label} options`}>
        <Label>{label}</Label>
        <OptionButton active>New contour</OptionButton>
        <OptionButton disabled>Add to</OptionButton>
        <OptionButton disabled>Subtract</OptionButton>
        <Divider />
        <OptionButton active>Close on click start</OptionButton>
      </div>
    );
  }

  return null;
}
