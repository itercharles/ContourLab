import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  queryDicomWebSeries,
  loadSeriesFromDicomWeb,
  queryRtstructInstancesForStudy,
  retrieveDicomWebInstance,
  type DicomWebRtstructInstance,
  type DicomWebSeriesSummary,
} from '../../core/dicom/dicomWebClient';
import { useVolumeStore } from '../../core/store/volumeStore';
import { useStructureStore } from '../../core/store/structureStore';
import { useUIStore } from '../../core/store/uiStore';
import { importRtstructArrayBuffer } from '../../core/structures/rtstructImport';
import { replaceStructureSetsForSeries } from '../../core/structures/structurePersistence';
import {
  compareStructureSets,
  type StructureSetComparison,
} from '../../core/structures/structureSetCompare';
import { logClientDebug } from '../../core/debug/clientDebugLog';

const WORKLIST_POLL_INTERVAL_MS = 60_000;
const SELECTED_PATIENT_IMAGE_SET_POLL_INTERVAL_MS = 30_000;
const RTSTRUCT_POLL_INTERVAL_MS = 15_000;

interface RepoStatus {
  tone: 'muted' | 'error';
  message: string;
}

interface StudyGroup {
  studyInstanceUID: string;
  studyDate: string;
  studyDescription: string;
  series: DicomWebSeriesSummary[];
}

interface PatientGroup {
  patientKey: string;
  patientName: string;
  patientId: string;
  studies: StudyGroup[];
}

interface RepoRefreshState {
  hasUpdates: boolean;
  isRefreshing: boolean;
}

interface RtstructComparisonState {
  label: string;
  summary: StructureSetComparison;
}

interface DicomRepoPanelProps {
  refreshRequestToken?: number;
  onRefreshStateChange?: (state: RepoRefreshState) => void;
}

function formatDicomDate(date: string): string {
  return date.length === 8 ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : 'unknown date';
}

function formatDicomDateTime(date: string, time: string): string {
  const datePart = formatDicomDate(date);
  const timePart = time.length >= 6
    ? `${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`
    : 'unknown time';

  return `${datePart} ${timePart}`;
}

function formatSopTail(sopInstanceUID: string): string {
  return sopInstanceUID.split('.').at(-1) || sopInstanceUID.slice(-8) || 'unknown';
}

function compareRtstructInstances(a: DicomWebRtstructInstance, b: DicomWebRtstructInstance): number {
  const timeCompare = `${b.seriesDate}${b.seriesTime}`.localeCompare(`${a.seriesDate}${a.seriesTime}`);
  if (timeCompare !== 0) return timeCompare;

  return b.sopInstanceUID.localeCompare(a.sopInstanceUID);
}

function formatPatientName(name: string, patientId: string): string {
  if (!name) return patientId || 'Unknown patient';
  const [family, given] = name.split('^');
  const displayName = [given, family].filter(Boolean).join(' ').trim();
  return displayName || name.replaceAll('^', ' ').trim() || patientId || 'Unknown patient';
}

function groupSeriesByPatient(series: DicomWebSeriesSummary[]): PatientGroup[] {
  const patientMap = new Map<string, PatientGroup>();

  for (const entry of series) {
    const patientKey = entry.patientId || entry.patientName || 'unknown-patient';
    let patient = patientMap.get(patientKey);
    if (!patient) {
      patient = {
        patientKey,
        patientName: formatPatientName(entry.patientName, entry.patientId),
        patientId: entry.patientId,
        studies: [],
      };
      patientMap.set(patientKey, patient);
    }

    let study = patient.studies.find((item) => item.studyInstanceUID === entry.studyInstanceUID);
    if (!study) {
      study = {
        studyInstanceUID: entry.studyInstanceUID,
        studyDate: entry.studyDate,
        studyDescription: entry.studyDescription,
        series: [],
      };
      patient.studies.push(study);
    }

    study.series.push(entry);
  }

  return Array.from(patientMap.values())
    .map((patient) => ({
      ...patient,
      studies: patient.studies
        .map((study) => ({
          ...study,
          series: study.series.sort((a, b) => a.seriesDescription.localeCompare(b.seriesDescription)),
        }))
        .sort((a, b) => b.studyDate.localeCompare(a.studyDate)),
    }))
    .sort((a, b) => a.patientName.localeCompare(b.patientName));
}

function getSeriesSignature(series: DicomWebSeriesSummary[]): string {
  return series
    .map((entry) => [
      entry.studyInstanceUID,
      entry.seriesInstanceUID,
      entry.instanceCount,
      entry.seriesDescription,
    ].join('|'))
    .sort()
    .join('\n');
}

function RepoSectionHeader({ label, meta }: { label: string; meta?: string }) {
  return (
    <div className="flex items-center justify-between border-b border-[#2a2a2a] bg-[#111] px-3 py-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[#8a8a8a]">
        {label}
      </span>
      {meta ? (
        <span className="text-[10px] text-[#5a5a5a]">{meta}</span>
      ) : null}
    </div>
  );
}

function RtstructCompareSummary({ comparison }: { comparison: RtstructComparisonState }) {
  const changedRows = comparison.summary.rows
    .filter((row) => row.status !== 'unchanged')
    .slice(0, 3);

  return (
    <div className="border-b border-[#2a2a2a] bg-[#181818] px-3 py-2">
      <div className="flex items-center gap-2">
        <span className="rounded bg-[#242424] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest text-[#a0a0a0]">
          RTSS Compare
        </span>
        <p className="min-w-0 flex-1 truncate text-[11px] text-[#e5e5e5]" title={comparison.label}>
          {comparison.label}
        </p>
      </div>
      <p className="mt-1 text-[10px] text-[#a0a0a0]">
        +{comparison.summary.addedCount} / -{comparison.summary.removedCount} / Δ{comparison.summary.changedCount}
      </p>
      {changedRows.length === 0 ? (
        <p className="mt-1 text-[10px] text-[#6b6b6b]">No ROI volume or slice-count differences detected.</p>
      ) : (
        <div className="mt-1 space-y-0.5">
          {changedRows.map((row) => (
            <p key={row.name} className="truncate text-[10px] text-[#a0a0a0]" title={row.name}>
              <span className="font-semibold text-[#e5e5e5]">{row.name}</span>
              {' '}
              {row.status}
              {' · '}
              Δvol {row.volumeDeltaCc.toFixed(1)} cc
              {' · '}
              Δslices {row.sliceDelta >= 0 ? '+' : ''}{row.sliceDelta}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DicomRepoPanel({ refreshRequestToken = 0, onRefreshStateChange }: DicomRepoPanelProps) {
  const lastRefreshRequestTokenRef = useRef(refreshRequestToken);
  const lastSeriesSignatureRef = useRef('');
  const addSeries = useVolumeStore((s) => s.addSeries);
  const loadedSeries = useVolumeStore((s) => s.loadedSeries);
  const activeSeriesUID = useVolumeStore((s) => s.activeSeriesUID);
  const setActiveSeries = useVolumeStore((s) => s.setActiveSeries);
  const setLoading = useVolumeStore((s) => s.setLoading);
  const setError = useVolumeStore((s) => s.setError);
  const structureSets = useStructureStore((s) => s.structureSets);
  const activeStructureSetId = useStructureStore((s) => s.activeStructureSetId);
  const replaceStructureSets = useStructureStore((s) => s.replaceStructureSets);
  const setActiveStructureSet = useStructureStore((s) => s.setActiveStructureSet);
  const setActiveStructure = useStructureStore((s) => s.setActiveStructure);
  const markSeriesDraftDirty = useStructureStore((s) => s.markSeriesDraftDirty);
  const repositoryDirtySeriesUIDs = useStructureStore((s) => s.repositoryDirtySeriesUIDs);
  const setLeftSidebarOpen = useUIStore((s) => s.setLeftSidebarOpen);

  const [series, setSeries] = useState<DicomWebSeriesSummary[]>([]);
  const [rtstructByStudy, setRtstructByStudy] = useState<Record<string, DicomWebRtstructInstance[]>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [hasRepositoryUpdates, setHasRepositoryUpdates] = useState(false);
  const [loadingRtstructStudyUIDs, setLoadingRtstructStudyUIDs] = useState<string[]>([]);
  const [loadingSeriesUID, setLoadingSeriesUID] = useState<string | null>(null);
  const [importingRtstructSop, setImportingRtstructSop] = useState<string | null>(null);
  const [status, setStatus] = useState<RepoStatus | null>(null);
  const [patientQuery, setPatientQuery] = useState('');
  const [selectedPatientKey, setSelectedPatientKey] = useState<string | null>(null);
  const [isPatientSelectorOpen, setIsPatientSelectorOpen] = useState(false);
  const [expandedImageSetUIDs, setExpandedImageSetUIDs] = useState<string[]>([]);
  const [comparingRtstructSop, setComparingRtstructSop] = useState<string | null>(null);
  const [rtstructComparison, setRtstructComparison] = useState<RtstructComparisonState | null>(null);

  const activeLoadedSeries = activeSeriesUID
    ? loadedSeries.find((entry) => entry.seriesUID === activeSeriesUID)
    : undefined;
  const activePatientKey = activeLoadedSeries?.patient.mrn || activeLoadedSeries?.patient.id || null;
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
  const confirmUnsyncedWorkspaceChange = useCallback((target: string) => {
    if (!activeSeriesUID || !repositoryDirtySeriesUIDs.includes(activeSeriesUID)) return true;

    const activeLabel =
      activeSeriesStructureSet?.source?.label ||
      activeSeriesStructureSet?.label ||
      activeLoadedSeries?.series.seriesDescription ||
      activeSeriesUID;

    return window.confirm(
      `The active structure set has local changes that have not been pushed to the DICOM repository.\n\n` +
      `Active: ${activeLabel}\n` +
      `Continue to ${target}?`
    );
  }, [activeLoadedSeries, activeSeriesStructureSet, activeSeriesUID, repositoryDirtySeriesUIDs]);
  const patientGroups = useMemo(() => groupSeriesByPatient(series), [series]);
  const filteredPatientGroups = useMemo(() => {
    const query = patientQuery.trim().toLowerCase();
    if (!query) return patientGroups;

    return patientGroups.filter((patient) =>
      [
        patient.patientName,
        patient.patientId,
        ...patient.studies.map((study) => study.studyDescription),
        ...patient.studies.flatMap((study) => study.series.map((entry) => entry.seriesDescription)),
      ].some((value) => value.toLowerCase().includes(query))
    );
  }, [patientGroups, patientQuery]);
  const selectedPatient = useMemo(() => {
    if (selectedPatientKey) {
      const selected = patientGroups.find((patient) => patient.patientKey === selectedPatientKey);
      if (selected) return selected;
    }

    if (!selectedPatientKey && activePatientKey) {
      const activePatient = patientGroups.find((patient) => patient.patientKey === activePatientKey);
      if (activePatient) return activePatient;
    }

    if (!selectedPatientKey && patientGroups.length === 1) {
      return patientGroups[0];
    }

    return null;
  }, [activePatientKey, patientGroups, selectedPatientKey]);
  const shownPatients = filteredPatientGroups.slice(0, 12);
  const selectedPatientStudyUIDs = useMemo(
    () => selectedPatient?.studies.map((study) => study.studyInstanceUID) ?? [],
    [selectedPatient]
  );
  const selectedPatientSeriesCount = selectedPatient?.studies.reduce(
    (count, study) => count + study.series.length,
    0
  ) ?? 0;
  const selectedPatientRtstructCount = selectedPatient?.studies.reduce(
    (count, study) => count + (rtstructByStudy[study.studyInstanceUID]?.length ?? 0),
    0
  ) ?? 0;
  useEffect(() => {
    if (selectedPatientKey && !patientGroups.some((patient) => patient.patientKey === selectedPatientKey)) {
      setSelectedPatientKey(null);
    }
  }, [patientGroups, selectedPatientKey]);

  useEffect(() => {
    if (!activeSeriesUID) return;

    setExpandedImageSetUIDs((current) =>
      current.includes(activeSeriesUID) ? current : [...current, activeSeriesUID]
    );
  }, [activeSeriesUID]);

  const queryRtstructForStudies = useCallback(async (studyUIDs: string[], options?: { force?: boolean }) => {
    const targetStudyUIDs = options?.force
      ? studyUIDs
      : studyUIDs.filter((studyUID) => !(studyUID in rtstructByStudy));
    if (targetStudyUIDs.length === 0) return;

    setLoadingRtstructStudyUIDs((current) => Array.from(new Set([...current, ...targetStudyUIDs])));

    await Promise.all(
      targetStudyUIDs.map(async (studyUID) => {
        try {
          const instances = await queryRtstructInstancesForStudy(studyUID);
          setRtstructByStudy((current) => ({
            ...current,
            [studyUID]: [
              ...instances,
              ...(current[studyUID] ?? []).filter(
                (currentInstance) => !instances.some(
                  (instance) => instance.sopInstanceUID === currentInstance.sopInstanceUID
                )
              ),
            ].sort(compareRtstructInstances),
          }));
          logClientDebug('DicomRepoPanel', `query:rtstruct:auto study=${studyUID} count=${instances.length}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to query RTSTRUCT.';
          setRtstructByStudy((current) => ({
            ...current,
            [studyUID]: [],
          }));
          setStatus({ tone: 'error', message });
          logClientDebug('DicomRepoPanel', `query:rtstruct:auto:error ${message}`);
        } finally {
          setLoadingRtstructStudyUIDs((current) =>
            current.filter((studyUIDInFlight) => studyUIDInFlight !== studyUID)
          );
        }
      })
    );
  }, [rtstructByStudy]);

  useEffect(() => {
    if (selectedPatientStudyUIDs.length === 0) return;

    void queryRtstructForStudies(selectedPatientStudyUIDs);
  }, [queryRtstructForStudies, selectedPatientStudyUIDs]);

  useEffect(() => {
    if (selectedPatientStudyUIDs.length === 0) return;

    const intervalId = window.setInterval(() => {
      void queryRtstructForStudies(selectedPatientStudyUIDs, { force: true });
    }, RTSTRUCT_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [queryRtstructForStudies, selectedPatientStudyUIDs]);

  const refreshRepository = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setIsRefreshing(true);
      setStatus(null);
    }

    try {
      const next = await queryDicomWebSeries();
      const nextSignature = getSeriesSignature(next);
      const hasKnownSignature = lastSeriesSignatureRef.current.length > 0;
      const hasChanged = hasKnownSignature && lastSeriesSignatureRef.current !== nextSignature;
      setSeries(next);
      lastSeriesSignatureRef.current = nextSignature;
      if (!options?.silent) {
        setHasRepositoryUpdates(false);
        setRtstructByStudy({});
        setStatus({
          tone: 'muted',
          message: next.length > 0 ? `${next.length} planning CT image series available in repository.` : 'No planning CT image series available.',
        });
      } else if (hasChanged) {
        setHasRepositoryUpdates(true);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to query repository.';
      if (!options?.silent) {
        setStatus({ tone: 'error', message });
      }
    } finally {
      if (!options?.silent) {
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    onRefreshStateChange?.({ hasUpdates: hasRepositoryUpdates, isRefreshing });
  }, [hasRepositoryUpdates, isRefreshing, onRefreshStateChange]);

  useEffect(() => {
    void refreshRepository();
  }, [refreshRepository]);

  useEffect(() => {
    const openPatientSelector = () => setIsPatientSelectorOpen(true);
    window.addEventListener('webtps:open-patient-selector', openPatientSelector);
    return () => window.removeEventListener('webtps:open-patient-selector', openPatientSelector);
  }, []);

  useEffect(() => {
    if (lastRefreshRequestTokenRef.current === refreshRequestToken) return;
    lastRefreshRequestTokenRef.current = refreshRequestToken;
    void refreshRepository();
  }, [refreshRepository, refreshRequestToken]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshRepository({ silent: true });
    }, WORKLIST_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [refreshRepository]);

  useEffect(() => {
    if (!selectedPatient) return;

    const intervalId = window.setInterval(() => {
      void refreshRepository({ silent: true });
    }, SELECTED_PATIENT_IMAGE_SET_POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [refreshRepository, selectedPatient]);

  const onLoadSeries = useCallback(
    async (seriesUID: string, options?: { keepNavigatorOpen?: boolean; skipUnsyncedConfirm?: boolean }) => {
      if (
        !options?.skipUnsyncedConfirm &&
        activeSeriesUID !== seriesUID &&
        !confirmUnsyncedWorkspaceChange('load another image set')
      ) {
        setStatus({ tone: 'muted', message: 'Kept the current workspace active. Push changes before switching image sets.' });
        return false;
      }

      const target = series.find((entry) => entry.seriesInstanceUID === seriesUID);
      if (target) {
        setSelectedPatientKey(target.patientId || target.patientName || 'unknown-patient');
      }

      const existing = loadedSeries.find((entry) => entry.seriesUID === seriesUID);

      if (existing) {
        setActiveSeries(seriesUID);
        setExpandedImageSetUIDs((current) =>
          current.includes(seriesUID) ? current : [...current, seriesUID]
        );
        setStatus({
          tone: 'muted',
          message: 'Series already loaded. Activated existing viewport volume.',
        });
        if (!options?.keepNavigatorOpen) {
          setLeftSidebarOpen(false);
        }
        return true;
      }

      if (!target) {
        return false;
      }

      setLoading(true);
      setError(null);
      setLoadingSeriesUID(seriesUID);
      setStatus({
        tone: 'muted',
        message: `Loading ${target.seriesDescription || target.seriesInstanceUID} from repository...`,
      });

      try {
        const loaded = await loadSeriesFromDicomWeb(target);
        addSeries(loaded);
        setExpandedImageSetUIDs((current) =>
          current.includes(seriesUID) ? current : [...current, seriesUID]
        );
        setStatus({
          tone: 'muted',
          message: `Loaded ${target.seriesDescription || target.seriesInstanceUID}.`,
        });
        if (!options?.keepNavigatorOpen) {
          setLeftSidebarOpen(false);
        }
        return true;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load series from repository.';
        setError(message);
        setStatus({ tone: 'error', message });
        return false;
      } finally {
        setLoading(false);
        setLoadingSeriesUID(null);
      }
    },
    [
      activeSeriesUID,
      addSeries,
      confirmUnsyncedWorkspaceChange,
      loadedSeries,
      series,
      setActiveSeries,
      setError,
      setLeftSidebarOpen,
      setLoading,
    ]
  );

  const onLoadRtstruct = useCallback(
    async (instance: DicomWebRtstructInstance, imageSeries: DicomWebSeriesSummary[]) => {
      const activeSeriesInStudy = activeSeriesUID
        ? imageSeries.some((entry) => entry.seriesInstanceUID === activeSeriesUID)
        : false;
      const targetSeriesUID = activeSeriesInStudy
        ? activeSeriesUID
        : imageSeries[0]?.seriesInstanceUID;

      if (!targetSeriesUID) {
        setStatus({ tone: 'error', message: 'No planning CT image set is available for this RTSTRUCT.' });
        return;
      }

      if (!confirmUnsyncedWorkspaceChange('load another RTSTRUCT')) {
        setStatus({ tone: 'muted', message: 'Kept the current structure set active. Push changes before loading another RTSTRUCT.' });
        return;
      }

      try {
        setImportingRtstructSop(instance.sopInstanceUID);
        setStatus({ tone: 'muted', message: `Loading image set and structures from RTSTRUCT ${instance.sopInstanceUID}...` });
        const imageSetLoaded = await onLoadSeries(targetSeriesUID, {
          keepNavigatorOpen: true,
          skipUnsyncedConfirm: true,
        });
        if (!imageSetLoaded) return;

        const buffer = await retrieveDicomWebInstance(instance);
        const importedStructureSet = await importRtstructArrayBuffer(buffer, targetSeriesUID);
        const sourcedStructureSet = {
          ...importedStructureSet,
          source: {
            type: 'rtstruct' as const,
            label: instance.seriesDescription || importedStructureSet.label || 'RTSTRUCT',
            sopInstanceUID: instance.sopInstanceUID,
            studyInstanceUID: instance.studyInstanceUID,
            seriesInstanceUID: instance.seriesInstanceUID,
            importedAt: new Date().toISOString(),
          },
        };
        replaceStructureSets(
          replaceStructureSetsForSeries(structureSets, [sourcedStructureSet], targetSeriesUID)
        );
        setActiveStructureSet(sourcedStructureSet.id);
        setActiveStructure(sourcedStructureSet.structures[0]?.id ?? null);
        markSeriesDraftDirty(targetSeriesUID);
        setStatus({
          tone: 'muted',
          message: `Loaded ${sourcedStructureSet.label} into the active image set.`,
        });
        setLeftSidebarOpen(false);
        logClientDebug(
          'DicomRepoPanel',
          `import:rtstruct mode=replace series=${targetSeriesUID} sop=${instance.sopInstanceUID} structures=${sourcedStructureSet.structures.length}`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load RTSTRUCT.';
        setStatus({ tone: 'error', message });
        logClientDebug('DicomRepoPanel', `import:rtstruct:error ${message}`);
      } finally {
        setImportingRtstructSop(null);
      }
    },
    [
      activeSeriesUID,
      confirmUnsyncedWorkspaceChange,
      markSeriesDraftDirty,
      onLoadSeries,
      replaceStructureSets,
      setLeftSidebarOpen,
      setActiveStructure,
      setActiveStructureSet,
      structureSets,
    ]
  );

  const onCompareRtstruct = useCallback(
    async (instance: DicomWebRtstructInstance, targetSeriesUID: string) => {
      if (!activeSeriesStructureSet || activeSeriesStructureSet.referencedSeriesUID !== targetSeriesUID) {
        setStatus({ tone: 'error', message: 'Load an active RTSTRUCT for this image set before comparing versions.' });
        return;
      }

      try {
        setComparingRtstructSop(instance.sopInstanceUID);
        const buffer = await retrieveDicomWebInstance(instance);
        const repositoryStructureSet = await importRtstructArrayBuffer(buffer, targetSeriesUID);
        const summary = compareStructureSets(repositoryStructureSet, activeSeriesStructureSet);
        setRtstructComparison({
          label: `${instance.seriesDescription || 'RTSTRUCT'} vs active workspace`,
          summary,
        });
        setStatus({
          tone: 'muted',
          message: `Compared ${instance.seriesDescription || 'RTSTRUCT'} with active workspace structures.`,
        });
        logClientDebug(
          'DicomRepoPanel',
          `compare:rtstruct series=${targetSeriesUID} sop=${instance.sopInstanceUID} added=${summary.addedCount} removed=${summary.removedCount} changed=${summary.changedCount}`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to compare RTSTRUCT.';
        setStatus({ tone: 'error', message });
        logClientDebug('DicomRepoPanel', `compare:rtstruct:error ${message}`);
      } finally {
        setComparingRtstructSop(null);
      }
    },
    [activeSeriesStructureSet]
  );

  const isRepositoryRtstructActive = useCallback(
    (
      instance: DicomWebRtstructInstance,
      imageSeriesUID: string
    ) => {
      if (!activeSeriesStructureSet || activeSeriesStructureSet.referencedSeriesUID !== imageSeriesUID) {
        return false;
      }

      const source = activeSeriesStructureSet.source;
      if (source?.type === 'rtstruct') {
        return (
          source.sopInstanceUID === instance.sopInstanceUID ||
          source.seriesInstanceUID === instance.seriesInstanceUID
        );
      }

      return false;
    },
    [activeSeriesStructureSet]
  );

  return (
    <div className="relative flex h-full flex-col">
      {isPatientSelectorOpen && (
        <div className="absolute inset-0 z-20 flex flex-col bg-[#111]">
          <div className="flex items-center justify-between border-b border-[#2a2a2a] px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#a0a0a0]">
              Select Patient
            </p>
            <button
              type="button"
              onClick={() => setIsPatientSelectorOpen(false)}
              className="h-6 rounded bg-[#242424] px-2 text-[11px] text-[#a0a0a0] hover:bg-[#2e2e2e] hover:text-[#e5e5e5] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
            >
              Close
            </button>
          </div>
          <div className="border-b border-[#2a2a2a] px-2 py-2">
            <input
              type="search"
              value={patientQuery}
              onChange={(event) => setPatientQuery(event.target.value)}
              placeholder="Search patient, MRN, study, series"
              className="h-7 w-full rounded border border-[#3a3a3a] bg-[#111] px-2 text-[11px] text-[#e5e5e5] placeholder:text-[#6b6b6b] focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {shownPatients.length === 0 ? (
              <p className="px-3 py-2 text-[11px] text-[#6b6b6b]">No matching patients.</p>
            ) : (
              shownPatients.map((patient) => {
                const isSelected = selectedPatient?.patientKey === patient.patientKey;
                const isActivePatient = activePatientKey === patient.patientKey;
                const seriesCount = patient.studies.reduce((count, study) => count + study.series.length, 0);

                return (
                  <button
                    key={patient.patientKey}
                    type="button"
                    onClick={() => {
                      if (
                        patient.patientKey !== activePatientKey &&
                        !confirmUnsyncedWorkspaceChange('select another patient')
                      ) {
                        setStatus({
                          tone: 'muted',
                          message: 'Kept the current patient active. Push changes before switching patients.',
                        });
                        return;
                      }
                      setSelectedPatientKey(patient.patientKey);
                      setIsPatientSelectorOpen(false);
                    }}
                    className={`block w-full border-b border-[#2a2a2a] px-3 py-2 text-left last:border-b-0 hover:bg-[#2e2e2e] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
                      isSelected ? 'bg-blue-900/30 border-l-2 border-l-blue-500' : 'border-l-2 border-l-transparent'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-[#2e2e2e] px-1.5 py-0.5 text-[9px] font-semibold tracking-widest text-[#a0a0a0]">
                        PATIENT
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[#e5e5e5]">
                        {patient.patientName}
                      </span>
                      {isActivePatient ? (
                        <span className="rounded bg-blue-900 px-1.5 py-0.5 text-[9px] font-semibold tracking-widest text-blue-200">
                          ACTIVE
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[#6b6b6b]">
                      <span className="truncate">MRN {patient.patientId || 'unknown'}</span>
                      <span>{patient.studies.length} studies</span>
                      <span>{seriesCount} image sets</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
          {filteredPatientGroups.length > shownPatients.length && (
            <p className="border-t border-[#2a2a2a] px-3 py-1 text-[10px] text-[#6b6b6b]">
              Showing first {shownPatients.length} of {filteredPatientGroups.length}; narrow the search.
            </p>
          )}
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {status && status.tone === 'error' && (
          <p className="border-b border-[#2a2a2a] px-3 py-1 text-[11px] text-red-400">
            {status.message}
          </p>
        )}
        {rtstructComparison ? <RtstructCompareSummary comparison={rtstructComparison} /> : null}
        {patientGroups.length === 0 ? (
          <p className="px-3 py-2 text-[11px] text-[#6b6b6b]">No planning CT image series available.</p>
        ) : !selectedPatient ? (
          <>
            <div className="border-b border-[#2a2a2a] bg-[#181818] px-3 py-3">
              <p className="text-[11px] text-[#a0a0a0]">Select a patient to begin.</p>
              <button
                type="button"
                onClick={() => setIsPatientSelectorOpen(true)}
                className="mt-3 h-7 rounded bg-blue-700 px-2 text-[11px] font-semibold text-white hover:bg-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
              >
                Select Patient
              </button>
            </div>
            <RepoSectionHeader label="Image Sets" meta="choose patient first" />
            <p className="border-b border-[#2a2a2a] px-3 py-2 text-[11px] text-[#6b6b6b]">
              Image sets appear after patient selection.
            </p>
            <p className="px-3 py-2 text-[11px] text-[#6b6b6b]">
              Structure sets appear under an active or expanded image set.
            </p>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-[#2a2a2a] bg-[#181818] px-3 py-1.5">
              <p className="min-w-0 truncate text-[10px] text-[#6b6b6b]">
                {selectedPatient.studies.length} studies · {selectedPatientSeriesCount} images · {selectedPatientRtstructCount} RTSS
              </p>
            </div>

            <div className="bg-[#151515]">
              <RepoSectionHeader label="Image Sets" meta={`${selectedPatientSeriesCount} CT series`} />

              {selectedPatient?.studies.map((study) => (
                <div key={study.studyInstanceUID} className="border-b border-[#2a2a2a]">
                  <div className="bg-[#202020] px-3 py-1">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-[#242424] px-1.5 py-0.5 text-[9px] font-semibold tracking-widest text-[#6b6b6b]">
                        STUDY
                      </span>
                      <p className="min-w-0 flex-1 truncate text-[10px] uppercase tracking-wide text-[#a0a0a0]" title={study.studyDescription}>
                        {study.studyDescription || 'Study'}
                      </p>
                    </div>
                    <p className="mt-0.5 pl-[46px] text-[10px] text-[#6b6b6b]">
                      {formatDicomDate(study.studyDate)} · {study.series.length} image set{study.series.length === 1 ? '' : 's'}
                    </p>
                  </div>
                  {study.series.map((entry) => {
                    const isLoaded = loadedSeries.some((item) => item.seriesUID === entry.seriesInstanceUID);
                    const isActive = activeSeriesUID === entry.seriesInstanceUID;
                    const isExpanded = isActive || expandedImageSetUIDs.includes(entry.seriesInstanceUID);
                    const studyRtstructs = [...(rtstructByStudy[study.studyInstanceUID] ?? [])]
                      .sort(compareRtstructInstances);
                    const rtstructsForImageSet = studyRtstructs.filter((instance) => (
                      instance.referencedSeriesInstanceUIDs.length > 0
                        ? instance.referencedSeriesInstanceUIDs.includes(entry.seriesInstanceUID)
                        : study.series.length === 1
                    ));
                    const rtstructMeta = loadingRtstructStudyUIDs.includes(study.studyInstanceUID)
                      ? 'loading RTSS'
                      : `${rtstructsForImageSet.length} RTSS`;

                    return (
                      <div key={entry.seriesInstanceUID} className="border-t border-[#2a2a2a]">
                        <div
                          className={`flex items-stretch ${
                            isActive ? 'bg-blue-900/30 border-l-4 border-l-blue-500' : 'border-l-4 border-l-transparent'
                          }`}
                        >
                          <button
                            type="button"
                            aria-label={`Load image set ${entry.seriesDescription || entry.seriesInstanceUID}`}
                            onClick={() => void onLoadSeries(entry.seriesInstanceUID)}
                            disabled={loadingSeriesUID === entry.seriesInstanceUID}
                            className="min-w-0 flex-1 py-1.5 pl-4 pr-2 text-left hover:bg-[#2e2e2e] disabled:hover:bg-transparent focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
                          >
                            <div className="flex items-center gap-2">
                              <span
                                className={`inline-flex min-w-8 justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                                  isActive ? 'bg-blue-950 text-blue-200' : 'bg-[#242424] text-[#a0a0a0]'
                                }`}
                              >
                                {entry.modality}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-xs text-[#e5e5e5]">
                                {entry.seriesDescription || entry.seriesInstanceUID}
                              </span>
                              {isActive ? (
                                <span className="rounded bg-blue-900 px-1.5 py-0.5 text-[9px] font-semibold tracking-widest text-blue-200">
                                  ACTIVE
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-[#6b6b6b]">
                              <span>Image Set · {entry.instanceCount} inst</span>
                              <span>{rtstructMeta}</span>
                              {isLoaded && !isActive ? <span>loaded</span> : null}
                              {loadingSeriesUID === entry.seriesInstanceUID && (
                                <span className="text-blue-400">loading</span>
                              )}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setExpandedImageSetUIDs((current) =>
                                current.includes(entry.seriesInstanceUID)
                                  ? current.filter((seriesUID) => seriesUID !== entry.seriesInstanceUID)
                                  : [...current, entry.seriesInstanceUID]
                              );
                            }}
                            className="flex w-8 items-center justify-center border-l border-[#2a2a2a] text-[#a0a0a0] hover:bg-[#2e2e2e] hover:text-[#e5e5e5] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
                            title={isExpanded ? 'Hide structure sets for this image set' : 'Show structure sets for this image set'}
                            aria-label={`${isExpanded ? 'Hide' : 'Show'} structure sets for ${entry.seriesDescription || entry.seriesInstanceUID}`}
                          >
                            <span className="text-[11px]" aria-hidden="true">
                              {isExpanded ? '-' : '+'}
                            </span>
                          </button>
                        </div>
                        {isExpanded ? (
                          <div className="border-t border-[#2a2a2a] bg-[#171717]">
                            <RepoSectionHeader
                              label="Structure Sets / RTSS"
                              meta={loadingRtstructStudyUIDs.includes(study.studyInstanceUID) ? 'loading' : `${studyRtstructs.length} objects`}
                            />
                            {loadingRtstructStudyUIDs.includes(study.studyInstanceUID) ? (
                              <p className="px-3 py-2 text-[10px] text-blue-400">Loading RTSTRUCT objects...</p>
                            ) : rtstructsForImageSet.length === 0 ? (
                              <p className="px-3 py-2 text-[10px] text-[#6b6b6b]">No RTSTRUCT for this image set context.</p>
                            ) : (
                              <div>
                                {rtstructsForImageSet.map((instance, index) => {
                                  const isActiveRtstruct = isRepositoryRtstructActive(
                                    instance,
                                    entry.seriesInstanceUID
                                  );
                                  const isLatestRtstruct = index === 0;

                                  return (
                                    <div
                                      key={instance.sopInstanceUID}
                                      role="button"
                                      tabIndex={!importingRtstructSop ? 0 : -1}
                                      onDoubleClick={() => {
                                        if (!importingRtstructSop) {
                                          void onLoadRtstruct(instance, [entry]);
                                        }
                                      }}
                                      onKeyDown={(event) => {
                                        if ((event.key === 'Enter' || event.key === ' ') && !importingRtstructSop) {
                                          event.preventDefault();
                                          void onLoadRtstruct(instance, [entry]);
                                        }
                                      }}
                                      aria-disabled={!!importingRtstructSop}
                                      className={`border-t border-[#2a2a2a] py-1.5 pl-7 pr-2 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
                                        isActiveRtstruct ? 'border-l-4 border-l-blue-500 bg-blue-950/20' : 'border-l-4 border-l-transparent bg-[#1a1a1a]'
                                      } ${
                                        !importingRtstructSop
                                          ? 'cursor-pointer hover:bg-blue-950/20'
                                          : 'cursor-not-allowed opacity-60'
                                      }`}
                                      title="Double-click or use Load to activate this image set and load RTSTRUCT"
                                    >
                                      <div className="flex items-center gap-2">
                                        <span className="rounded bg-[#242424] px-1.5 py-0.5 text-[10px] font-semibold text-[#a0a0a0]">
                                          RTSS
                                        </span>
                                        <p className="min-w-0 flex-1 truncate text-[11px] text-[#e5e5e5]" title={instance.seriesDescription}>
                                          {instance.seriesDescription || 'RTSTRUCT'}
                                        </p>
                                        {isActiveRtstruct && (
                                          <span className="rounded bg-blue-900 px-1.5 py-0.5 text-[9px] font-semibold tracking-widest text-blue-200">
                                            ACTIVE
                                          </span>
                                        )}
                                        {isLatestRtstruct && !isActiveRtstruct && (
                                          <span className="rounded bg-[#2a2a2a] px-1.5 py-0.5 text-[9px] font-semibold tracking-widest text-[#c8c8c8]">
                                            LATEST
                                          </span>
                                        )}
                                      </div>
                                      <div className="mt-0.5 flex items-center gap-2">
                                        <span className="min-w-0 flex-1 truncate text-[10px] text-[#6b6b6b]" title={instance.sopInstanceUID}>
                                          {formatDicomDateTime(instance.seriesDate, instance.seriesTime)}
                                          {' · '}
                                          SOP …{formatSopTail(instance.sopInstanceUID)}
                                          {typeof instance.roiCount === 'number' ? ` · ${instance.roiCount} ROI` : ''}
                                        </span>
                                        <span className="text-[10px] text-[#6b6b6b]">
                                          {importingRtstructSop === instance.sopInstanceUID
                                            ? 'Loading'
                                            : isActiveRtstruct
                                              ? 'Active in workspace'
                                              : 'Ready'}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            void onLoadRtstruct(instance, [entry]);
                                          }}
                                          disabled={!!importingRtstructSop}
                                          className="h-5 rounded border border-blue-700 bg-blue-950/30 px-1.5 text-[10px] font-medium text-blue-200 hover:bg-blue-900/60 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
                                          title="Load this RTSTRUCT into the active workspace"
                                        >
                                          {importingRtstructSop === instance.sopInstanceUID ? 'Loading' : 'Load'}
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(event) => {
                                            event.stopPropagation();
                                            void onCompareRtstruct(instance, entry.seriesInstanceUID);
                                          }}
                                          disabled={!!comparingRtstructSop}
                                          className="h-5 rounded border border-[#3a3a3a] px-1.5 text-[10px] text-[#a0a0a0] hover:bg-[#2e2e2e] hover:text-[#e5e5e5] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
                                          title="Compare this repository RTSTRUCT with the active workspace RTSTRUCT"
                                        >
                                          {comparingRtstructSop === instance.sopInstanceUID ? 'Comparing' : 'Compare'}
                                        </button>
                                      </div>
                                      <div className="mt-1 border-t border-[#2a2a2a] pt-1">
                                        <div className="flex items-center gap-2 text-[10px] text-[#6b6b6b]">
                                          <span className="font-semibold uppercase tracking-widest">Plans</span>
                                          <span>No plans yet</span>
                                        </div>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
