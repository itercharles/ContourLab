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

  return (
    <div className="flex h-8 flex-none items-stretch border-b border-[#2a2a2a] bg-[#111] text-[10px] text-[#a0a0a0]">
      <button
        type="button"
        onClick={openPatientSelector}
        title="Select patient, image set, and RTSS"
        className="flex min-w-48 max-w-64 items-center gap-2 border-r border-[#2a2a2a] px-2 text-left hover:bg-[#1f242b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="10" cy="8" r="4" />
          <path d="M3 21a7 7 0 0 1 14 0" />
          <path d="M19 8v6" />
          <path d="M16 11h6" />
        </svg>
        <span className="min-w-0 truncate text-[11px] font-semibold text-[#e5e5e5]">
          {formatPatientName(activeLoadedSeries?.patient)}
        </span>
      </button>
      <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
        <div className="flex items-center gap-1 border-r border-[#2a2a2a] px-2">
          <span className="font-semibold uppercase tracking-widest text-[#6b6b6b]">MRN</span>
          <span className="font-mono text-[#e5e5e5]">
            {activeLoadedSeries?.patient.mrn || activeLoadedSeries?.patient.id || 'none'}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-1 border-r border-[#2a2a2a] px-2">
          <span className="font-semibold uppercase tracking-widest text-[#6b6b6b]">Study</span>
          <span className="min-w-0 truncate text-[#e5e5e5]" title={activeLoadedSeries?.study.studyDescription || activeLoadedSeries?.study.studyInstanceUID || 'No active study'}>
            {activeLoadedSeries?.study.studyDescription || activeLoadedSeries?.study.studyDate || 'No active study'}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-1 border-r border-[#2a2a2a] px-2">
          <span className="font-semibold uppercase tracking-widest text-[#6b6b6b]">Image</span>
          <span className="min-w-0 truncate text-[#e5e5e5]" title={activeLoadedSeries?.series.seriesDescription || activeLoadedSeries?.seriesUID || 'No active image set'}>
            {activeLoadedSeries?.series.seriesDescription || activeLoadedSeries?.seriesUID || 'No active image set'}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-1 px-2">
          <span className="font-semibold uppercase tracking-widest text-[#6b6b6b]">RTSS</span>
          <span className="min-w-0 truncate text-[#e5e5e5]" title={activeSeriesStructureSet?.source?.sopInstanceUID || activeSeriesStructureSet?.label || 'No active RTSS'}>
            {activeSeriesStructureSet?.source?.type === 'rtstruct'
              ? formatRtstructLabel(activeSeriesStructureSet.source)
              : activeSeriesStructureSet?.label || 'No active RTSS'}
          </span>
        </div>
      </div>
      {isRepositoryDirty ? (
        <span className="m-1 flex-none border border-[#854d0e] bg-[#2a2112] px-1.5 py-0.5 font-semibold uppercase tracking-widest text-[#f59e0b]">
          Unsynced
        </span>
      ) : (
        <span className="m-1 flex-none border border-[#2a2a2a] bg-[#171717] px-1.5 py-0.5 font-semibold uppercase tracking-widest text-[#6b6b6b]">
          Synced
        </span>
      )}
    </div>
  );
}
