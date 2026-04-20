import { useStructureStore } from '../../core/store/structureStore';
import { useUIStore, type ViewerTool } from '../../core/store/uiStore';
import { useVolumeStore } from '../../core/store/volumeStore';

const TOOL_LABELS: Record<ViewerTool, string> = {
  windowLevel: 'Window/Level',
  zoom: 'Zoom',
  pan: 'Pan',
  scroll: 'Scroll',
  crosshairs: 'Crosshair',
  measureDistance: 'Distance',
  measureAngle: 'Angle',
  measureArea: 'Area',
  huProbe: 'HU Probe',
  edit: 'Edit contour',
  freehand: 'Freehand',
  polygon: 'Polygon',
  brush: 'Brush',
  eraser: 'Eraser',
};

function StatusItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5 border-r border-[#24292f] px-2">
      <span className="font-semibold uppercase tracking-widest text-[#6b7280]">{label}</span>
      <span className="font-mono text-[#a0a7b0]">{value}</span>
    </div>
  );
}

export default function StatusBar() {
  const activeTool = useUIStore((s) => s.activeTool);
  const brushRadius = useUIStore((s) => s.brushRadius);
  const activeViewport = useUIStore((s) => s.activeViewport);
  const activeSeriesUID = useVolumeStore((s) => s.activeSeriesUID);
  const loadedSeries = useVolumeStore((s) => s.loadedSeries);
  const repositoryDirtySeriesUIDs = useStructureStore((s) => s.repositoryDirtySeriesUIDs);
  const activeLoadedSeries = activeSeriesUID
    ? loadedSeries.find((series) => series.seriesUID === activeSeriesUID)
    : undefined;
  const instanceCount = activeLoadedSeries?.series.instances.length ?? 0;
  const isRepositoryDirty = !!activeSeriesUID && repositoryDirtySeriesUIDs.includes(activeSeriesUID);

  return (
    <footer className="flex h-6 flex-none items-center border-t border-[#24292f] bg-[#111] text-[10px] text-[#a0a7b0]">
      <StatusItem label="tool" value={TOOL_LABELS[activeTool]} />
      <StatusItem label="view" value={activeViewport ?? 'n/a'} />
      <StatusItem label="slice" value={instanceCount > 0 ? `1/${instanceCount}` : 'n/a'} />
      <StatusItem label="hu" value="n/a" />
      <StatusItem label="x,y,z" value="n/a" />
      {(activeTool === 'brush' || activeTool === 'eraser') && (
        <StatusItem label="brush" value={`${brushRadius}px`} />
      )}
      <div className="flex-1" />
      <StatusItem label="fps" value="n/a" />
      <StatusItem label="gpu" value="n/a" />
      <div className="flex items-center gap-1.5 px-2">
        <span className="font-semibold uppercase tracking-widest text-[#6b7280]">repo</span>
        <span className={isRepositoryDirty ? 'text-[#f59e0b]' : 'text-[#22c55e]'}>
          {isRepositoryDirty ? 'unsynced' : 'synced'}
        </span>
      </div>
    </footer>
  );
}
