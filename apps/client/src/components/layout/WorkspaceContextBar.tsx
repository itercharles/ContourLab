import { useStructureStore } from '../../core/store/structureStore';
import { useVolumeStore } from '../../core/store/volumeStore';
import { useUIStore } from '../../core/store/uiStore';

function formatPatientName(patient?: { name?: { given?: string; family?: string }; mrn?: string; id?: string }): string {
  if (!patient) return 'No active patient';

  const displayName = [patient.name?.given, patient.name?.family].filter(Boolean).join(' ').trim();
  return displayName || patient.mrn || patient.id || 'Unknown patient';
}

function formatRtstructLabel(source: { label?: string; sopInstanceUID?: string } | undefined): string {
  if (!source) return 'No active RTSS';
  if (source.label) return source.label;
  if (source.sopInstanceUID) return `SOP ...${source.sopInstanceUID.split('.').at(-1) ?? source.sopInstanceUID}`;
  return 'RTSTRUCT';
}

export default function WorkspaceContextBar() {
  const loadedSeries = useVolumeStore((s) => s.loadedSeries);
  const activeSeriesUID = useVolumeStore((s) => s.activeSeriesUID);
  const structureSets = useStructureStore((s) => s.structureSets);
  const activeStructureSetId = useStructureStore((s) => s.activeStructureSetId);
  const repositoryDirtySeriesUIDs = useStructureStore((s) => s.repositoryDirtySeriesUIDs);
  const setLeftSidebarOpen = useUIStore((s) => s.setLeftSidebarOpen);

  const activeLoadedSeries = activeSeriesUID
    ? loadedSeries.find((entry) => entry.seriesUID === activeSeriesUID)
    : undefined;
  const activeStructureSetById = structureSets.find(
    (structureSet) => structureSet.id === activeStructureSetId
  );
  const activeSeriesStructureSet = activeSeriesUID
    ? (
        activeStructureSetById?.referencedSeriesUID === activeSeriesUID
          ? activeStructureSetById
          : undefined
      )
    : undefined;
  const isRepositoryDirty = !!activeSeriesUID && repositoryDirtySeriesUIDs.includes(activeSeriesUID);
  const openPatientSelector = () => {
    setLeftSidebarOpen(true);
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent('webtps:open-patient-selector'));
    }, 0);
  };
  const openWorkspaceSelector = () => {
    setLeftSidebarOpen(true);
  };

  return (
    <div className="flex h-9 flex-none items-stretch border-b border-[#24292f] bg-[#13161a] text-[10px] text-[#a0a7b0]">
      {/* Patient selector */}
      <div className="flex min-w-0 max-w-64 items-stretch border-r border-[#24292f]">
        <button
          type="button"
          onClick={openPatientSelector}
          title="Select patient"
          className="flex min-w-0 items-center gap-2 px-3 text-left hover:bg-[#1f242b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <svg aria-hidden="true" className="flex-none" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="10" cy="8" r="4" />
            <path d="M3 21a7 7 0 0 1 14 0" />
            <path d="M19 8v6M16 11h6" />
          </svg>
          <span className="min-w-0 truncate text-[12px] font-semibold text-[#e6e9ed]">
            {formatPatientName(activeLoadedSeries?.patient)}
          </span>
        </button>
        <button
          type="button"
          onClick={openWorkspaceSelector}
          title="Choose image set and RTSS"
          aria-label="Choose image set and RTSS"
          className="flex w-7 flex-none items-center justify-center border-l border-[#24292f] text-[#6b7280] hover:bg-[#1f242b] hover:text-[#e6e9ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <svg aria-hidden="true" className="flex-none" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6l4 4 4-4" />
          </svg>
        </button>
      </div>

      {/* Context fields */}
      <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
        <div className="flex items-center gap-1.5 border-r border-[#24292f] px-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[#6b7280]">MRN</span>
          <span className="font-mono text-[11px] text-[#c4c9d0]">
            {activeLoadedSeries?.patient.mrn || activeLoadedSeries?.patient.id || '—'}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 border-r border-[#24292f] px-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[#6b7280]">Study</span>
          <span className="min-w-0 truncate text-[12px] font-medium text-[#e6e9ed]" title={activeLoadedSeries?.study.studyDescription || activeLoadedSeries?.study.studyInstanceUID || 'No active study'}>
            {activeLoadedSeries?.study.studyDescription || activeLoadedSeries?.study.studyDate || 'No active study'}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 border-r border-[#24292f] px-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[#6b7280]">Image</span>
          <span className="min-w-0 truncate text-[12px] font-medium text-[#e6e9ed]" title={activeLoadedSeries?.series.seriesDescription || activeLoadedSeries?.seriesUID || 'No active image set'}>
            {activeLoadedSeries?.series.seriesDescription || activeLoadedSeries?.seriesUID || 'No active image set'}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 px-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[#6b7280]">RTSS</span>
          <span className="min-w-0 truncate text-[12px] font-medium text-[#e6e9ed]" title={activeSeriesStructureSet?.source?.sopInstanceUID || activeSeriesStructureSet?.label || 'No active RTSS'}>
            {activeSeriesStructureSet?.source?.type === 'rtstruct'
              ? formatRtstructLabel(activeSeriesStructureSet.source)
              : activeSeriesStructureSet?.label || 'No active RTSS'}
          </span>
        </div>
      </div>

      {/* Sync status dot */}
      <div className="flex items-center gap-2 border-l border-[#24292f] px-3">
        <span
          className={`h-1.5 w-1.5 flex-none rounded-full ${
            isRepositoryDirty
              ? 'bg-[#f59e0b] shadow-[0_0_0_3px_rgba(245,158,11,0.15)]'
              : 'bg-[#10b981] shadow-[0_0_0_3px_rgba(16,185,129,0.15)]'
          }`}
        />
        <span className={`text-[11px] ${isRepositoryDirty ? 'text-[#f59e0b]' : 'text-[#a0a7b0]'}`}>
          {isRepositoryDirty ? 'Unsynced' : 'Synced'}
        </span>
      </div>

      {/* AI CTA */}
      <div className="flex items-center border-l border-[#24292f] px-2">
        <button
          type="button"
          disabled
          title="AI auto-contour (not yet implemented)"
          className="flex h-7 flex-none items-center gap-1.5 rounded border border-[rgba(59,130,246,0.4)] bg-gradient-to-b from-[rgba(59,130,246,0.95)] to-[#3b82f6] px-2.5 font-[inherit] text-[12px] font-semibold text-white shadow-[0_1px_0_rgba(255,255,255,0.15)_inset,0_1px_2px_rgba(0,0,0,0.2)] transition-[filter] hover:brightness-110 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50 whitespace-nowrap"
        >
          {/* sparkle */}
          <svg aria-hidden="true" className="flex-none" width="13" height="13" viewBox="0 0 16 16" fill="currentColor" stroke="none">
            <path d="M5 2l1 2 2 1-2 1-1 2-1-2-2-1 2-1zM11 7l.6 1.4L13 9l-1.4.6L11 11l-.6-1.4L9 9l1.4-.6z" />
          </svg>
          Run AI auto-contour
          <span className="rounded bg-white/20 px-1 font-mono text-[10px] font-bold">A</span>
        </button>
      </div>
    </div>
  );
}
