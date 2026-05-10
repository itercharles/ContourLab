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

  const hasPatient = !!activeLoadedSeries;

  return (
    <div className="flex h-9 flex-none items-stretch border-b border-[var(--color-border)] bg-[var(--color-surface-alt)] text-[10px] text-[var(--color-text-sec)]">
      {/* Patient selector */}
      <div className="flex min-w-0 max-w-64 items-stretch border-r border-[var(--color-border)]">
        <button
          type="button"
          onClick={openPatientSelector}
          title={hasPatient ? 'Switch patient' : 'Load patient — open patient browser'}
          className={`group flex min-w-0 flex-1 items-center gap-2 px-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            hasPatient
              ? 'hover:bg-[var(--color-hover)]'
              : 'bg-blue-950/20 hover:bg-blue-900/30'
          }`}
        >
          <svg aria-hidden="true" className={`flex-none ${hasPatient ? 'text-[var(--color-text-sec)]' : 'text-blue-400'}`} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="10" cy="8" r="4" />
            <path d="M3 21a7 7 0 0 1 14 0" />
            {!hasPatient && <><path d="M19 8v6" /><path d="M16 11h6" /></>}
          </svg>
          {hasPatient ? (
            <>
              <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[var(--color-text-bright)]">
                {formatPatientName(activeLoadedSeries.patient)}
              </span>
              {/* Switch hint — fades in on hover */}
              <svg aria-hidden="true" className="flex-none text-[var(--color-text-muted)] opacity-0 transition-opacity duration-100 group-hover:opacity-70" width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M1 4h11M9 1l3 3-3 3" />
                <path d="M15 12H4M7 9l-3 3 3 3" />
              </svg>
            </>
          ) : (
            <span className="text-[12px] font-medium text-blue-400">
              Load Patient
            </span>
          )}
        </button>
        {hasPatient && (
          <button
            type="button"
            onClick={openWorkspaceSelector}
            title="Choose image set and RTSS"
            aria-label="Choose image set and RTSS"
            className="flex w-7 flex-none items-center justify-center border-l border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-bright)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <svg aria-hidden="true" className="flex-none" width="10" height="10" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6l4 4 4-4" />
            </svg>
          </button>
        )}
      </div>

      {/* Context fields */}
      <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
        <div className="flex items-center gap-1.5 border-r border-[var(--color-border)] px-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">MRN</span>
          <span className="font-mono text-[11px] text-[var(--color-text-bright)]">
            {activeLoadedSeries?.patient.mrn || activeLoadedSeries?.patient.id || '—'}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 border-r border-[var(--color-border)] px-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Study</span>
          <span className="min-w-0 truncate text-[12px] font-medium text-[var(--color-text-bright)]" title={activeLoadedSeries?.study.studyDescription || activeLoadedSeries?.study.studyInstanceUID || 'No active study'}>
            {activeLoadedSeries?.study.studyDescription || activeLoadedSeries?.study.studyDate || 'No active study'}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 border-r border-[var(--color-border)] px-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Image</span>
          <span className="min-w-0 truncate text-[12px] font-medium text-[var(--color-text-bright)]" title={activeLoadedSeries?.series.seriesDescription || activeLoadedSeries?.seriesUID || 'No active image set'}>
            {activeLoadedSeries?.series.seriesDescription || activeLoadedSeries?.seriesUID || 'No active image set'}
          </span>
        </div>
        <div className="flex min-w-0 items-center gap-1.5 px-3">
          <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">RTSS</span>
          <span className="min-w-0 truncate text-[12px] font-medium text-[var(--color-text-bright)]" title={activeSeriesStructureSet?.source?.sopInstanceUID || activeSeriesStructureSet?.label || 'No active RTSS'}>
            {activeSeriesStructureSet?.source?.type === 'rtstruct'
              ? formatRtstructLabel(activeSeriesStructureSet.source)
              : activeSeriesStructureSet?.label || 'No active RTSS'}
          </span>
        </div>
      </div>

      {/* Sync status dot */}
      <div className="flex items-center gap-2 border-l border-[var(--color-border)] px-3">
        <span
          className={`h-1.5 w-1.5 flex-none rounded-full ${
            isRepositoryDirty
              ? 'bg-[#f59e0b] shadow-[0_0_0_3px_rgba(245,158,11,0.15)]'
              : 'bg-[#10b981] shadow-[0_0_0_3px_rgba(16,185,129,0.15)]'
          }`}
        />
        <span className={`text-[11px] ${isRepositoryDirty ? 'text-[#f59e0b]' : 'text-[var(--color-text-sec)]'}`}>
          {isRepositoryDirty ? 'Unsynced' : 'Synced'}
        </span>
      </div>

    </div>
  );
}
