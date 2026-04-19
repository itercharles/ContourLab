import { useStructureStore } from '../../core/store/structureStore';
import { useVolumeStore } from '../../core/store/volumeStore';

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

  return (
    <div className="flex h-8 flex-none items-center gap-2 border-b border-[#2a2a2a] bg-[#111] px-2 text-[10px] text-[#a0a0a0]">
      <span className="rounded bg-[#242424] px-1.5 py-0.5 font-semibold uppercase tracking-widest text-[#6b6b6b]">
        Active
      </span>
      <div className="min-w-0 flex flex-1 items-center gap-2 overflow-hidden">
        <span className="min-w-0 truncate" title={formatPatientName(activeLoadedSeries?.patient)}>
          Patient: <span className="text-[#e5e5e5]">{formatPatientName(activeLoadedSeries?.patient)}</span>
        </span>
        <span className="text-[#3a3a3a]">|</span>
        <span
          className="min-w-0 truncate"
          title={activeLoadedSeries?.series.seriesDescription || activeLoadedSeries?.seriesUID || 'No active image set'}
        >
          Image: <span className="text-[#e5e5e5]">
            {activeLoadedSeries?.series.seriesDescription || activeLoadedSeries?.seriesUID || 'No active image set'}
          </span>
        </span>
        <span className="text-[#3a3a3a]">|</span>
        <span
          className="min-w-0 truncate"
          title={activeSeriesStructureSet?.source?.sopInstanceUID || activeSeriesStructureSet?.label || 'No active RTSS'}
        >
          RTSS: <span className="text-[#e5e5e5]">
            {activeSeriesStructureSet?.source?.type === 'rtstruct'
              ? formatRtstructLabel(activeSeriesStructureSet.source)
              : activeSeriesStructureSet?.label || 'No active RTSS'}
          </span>
        </span>
      </div>
      {isRepositoryDirty ? (
        <span className="flex-none rounded border border-[#854d0e] bg-[#2a2112] px-1.5 py-0.5 font-semibold uppercase tracking-widest text-[#f59e0b]">
          Unsynced
        </span>
      ) : (
        <span className="flex-none rounded border border-[#2a2a2a] bg-[#171717] px-1.5 py-0.5 font-semibold uppercase tracking-widest text-[#6b6b6b]">
          Synced
        </span>
      )}
    </div>
  );
}
