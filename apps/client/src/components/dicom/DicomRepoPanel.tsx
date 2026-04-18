import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  queryDicomWebSeries,
  uploadDicomWebStudies,
  loadSeriesFromDicomWeb,
  uploadDicomBlobToRepository,
  queryRtstructInstancesForStudy,
  retrieveDicomWebInstance,
  type DicomWebRtstructInstance,
  type DicomWebSeriesSummary,
} from '../../core/dicom/dicomWebClient';
import { useVolumeStore } from '../../core/store/volumeStore';
import { useStructureStore } from '../../core/store/structureStore';
import { exportRtstructObject } from '../../core/structures/rtstructExport';
import { importRtstructArrayBuffer } from '../../core/structures/rtstructImport';
import { replaceStructureSetsForSeries } from '../../core/structures/structurePersistence';
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

export default function DicomRepoPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
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
  const markSeriesClean = useStructureStore((s) => s.markSeriesClean);
  const markSeriesRepositoryClean = useStructureStore((s) => s.markSeriesRepositoryClean);
  const repositoryDirtySeriesUIDs = useStructureStore((s) => s.repositoryDirtySeriesUIDs);

  const [series, setSeries] = useState<DicomWebSeriesSummary[]>([]);
  const [rtstructByStudy, setRtstructByStudy] = useState<Record<string, DicomWebRtstructInstance[]>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isImportingData, setIsImportingData] = useState(false);
  const [isPushingChanges, setIsPushingChanges] = useState(false);
  const [loadingRtstructStudyUIDs, setLoadingRtstructStudyUIDs] = useState<string[]>([]);
  const [loadingSeriesUID, setLoadingSeriesUID] = useState<string | null>(null);
  const [importingRtstructSop, setImportingRtstructSop] = useState<string | null>(null);
  const [status, setStatus] = useState<RepoStatus | null>(null);
  const [patientQuery, setPatientQuery] = useState('');
  const [selectedPatientKey, setSelectedPatientKey] = useState<string | null>(null);
  const [isPatientSelectorOpen, setIsPatientSelectorOpen] = useState(false);

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
          : structureSets.find((structureSet) => structureSet.referencedSeriesUID === activeSeriesUID)
      )
    : undefined;
  const isActiveSeriesRepositoryDirty = !!activeSeriesUID && repositoryDirtySeriesUIDs.includes(activeSeriesUID);
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
  useEffect(() => {
    if (selectedPatientKey && !patientGroups.some((patient) => patient.patientKey === selectedPatientKey)) {
      setSelectedPatientKey(null);
    }
  }, [patientGroups, selectedPatientKey]);

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
      setSeries(next);
      if (!options?.silent) {
        setRtstructByStudy({});
        setStatus({
          tone: 'muted',
          message: next.length > 0 ? `${next.length} planning CT image series available in repository.` : 'No planning CT image series available.',
        });
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
    void refreshRepository();
  }, [refreshRepository]);

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

  const onImportDataClick = useCallback(() => {
    if (!isImportingData) {
      inputRef.current?.click();
    }
  }, [isImportingData]);

  const onImportDataChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(event.target.files ?? []);
      event.target.value = '';

      if (files.length === 0) {
        return;
      }

      setIsImportingData(true);
      setStatus({
        tone: 'muted',
        message: `Importing ${files.length} DICOM file${files.length === 1 ? '' : 's'} into the repository...`,
      });

      try {
        await uploadDicomWebStudies(files);
        await refreshRepository();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to import DICOM files.';
        setStatus({ tone: 'error', message });
      } finally {
        setIsImportingData(false);
      }
    },
    [refreshRepository]
  );

  const onLoadSeries = useCallback(
    async (seriesUID: string, options?: { skipUnsyncedConfirm?: boolean }) => {
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
        setStatus({
          tone: 'muted',
          message: 'Series already loaded. Activated existing viewport volume.',
        });
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
        setStatus({
          tone: 'muted',
          message: `Loaded ${target.seriesDescription || target.seriesInstanceUID}.`,
        });
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
      setLoading,
    ]
  );

  const onPushChanges = useCallback(async () => {
    if (!activeLoadedSeries || !activeSeriesStructureSet || !isActiveSeriesRepositoryDirty) return;

    try {
      setIsPushingChanges(true);
      setStatus({ tone: 'muted', message: `Pushing ${activeSeriesStructureSet.label} changes as RTSTRUCT...` });
      const exported = await exportRtstructObject(activeLoadedSeries, activeSeriesStructureSet);
      await uploadDicomBlobToRepository(exported.blob);
      const pushedStructureSet = {
        ...activeSeriesStructureSet,
        source: {
          type: 'rtstruct' as const,
          label: exported.identifiers.seriesDescription,
          sopInstanceUID: exported.identifiers.sopInstanceUID,
          studyInstanceUID: exported.identifiers.studyInstanceUID,
          seriesInstanceUID: exported.identifiers.seriesInstanceUID,
          importedAt: new Date().toISOString(),
        },
      };
      replaceStructureSets(
        structureSets.map((structureSet) =>
          structureSet.id === activeSeriesStructureSet.id ? pushedStructureSet : structureSet
        )
      );
      setActiveStructureSet(pushedStructureSet.id);
      setActiveStructure(pushedStructureSet.structures[0]?.id ?? null);
      markSeriesClean(activeLoadedSeries.seriesUID);
      markSeriesRepositoryClean(activeLoadedSeries.seriesUID);
      const pushedInstance: DicomWebRtstructInstance = {
        studyInstanceUID: exported.identifiers.studyInstanceUID,
        seriesInstanceUID: exported.identifiers.seriesInstanceUID,
        sopInstanceUID: exported.identifiers.sopInstanceUID,
        seriesDescription: exported.identifiers.seriesDescription,
        seriesDate: exported.identifiers.seriesDate,
        seriesTime: exported.identifiers.seriesTime,
        roiCount: activeSeriesStructureSet.structures.length,
      };
      setRtstructByStudy((current) => ({
        ...current,
        [exported.identifiers.studyInstanceUID]: [
          pushedInstance,
          ...(current[exported.identifiers.studyInstanceUID] ?? []).filter(
            (instance) => instance.sopInstanceUID !== pushedInstance.sopInstanceUID
          ),
        ].sort(compareRtstructInstances),
      }));
      setStatus({ tone: 'muted', message: `Pushed ${activeSeriesStructureSet.label} changes to the DICOM repository.` });
      logClientDebug(
        'DicomRepoPanel',
        `upload:rtstruct series=${activeLoadedSeries.seriesUID} set=${activeSeriesStructureSet.id} sop=${exported.identifiers.sopInstanceUID}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to push structure changes.';
      setStatus({ tone: 'error', message });
      logClientDebug('DicomRepoPanel', `upload:rtstruct:error ${message}`);
    } finally {
      setIsPushingChanges(false);
    }
  }, [
    activeLoadedSeries,
    activeSeriesStructureSet,
    isActiveSeriesRepositoryDirty,
    markSeriesClean,
    markSeriesRepositoryClean,
    replaceStructureSets,
    setActiveStructure,
    setActiveStructureSet,
    structureSets,
  ]);

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
        const imageSetLoaded = await onLoadSeries(targetSeriesUID, { skipUnsyncedConfirm: true });
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
      setActiveStructure,
      setActiveStructureSet,
      structureSets,
    ]
  );

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[#2a2a2a] px-3 py-1">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6b6b6b]">
          DICOM Repository
        </p>
        <button
          type="button"
          onClick={() => void refreshRepository()}
          disabled={isRefreshing || isImportingData}
          className="flex h-5 w-5 items-center justify-center rounded text-[#6b6b6b] hover:bg-[#2e2e2e] hover:text-[#e5e5e5] disabled:cursor-not-allowed disabled:opacity-40 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
          title="Refresh DICOM repository"
          aria-label="Refresh DICOM repository"
        >
          <svg
            className={isRefreshing ? 'animate-spin' : ''}
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 12a9 9 0 0 1-15.5 6.2" />
            <path d="M3 12A9 9 0 0 1 18.5 5.8" />
            <polyline points="18 2 18.5 5.8 22 5" />
            <polyline points="6 22 5.5 18.2 2 19" />
          </svg>
        </button>
      </div>
      <div className="border-b border-[#2a2a2a] px-2 py-2">
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={onImportDataClick}
            disabled={isImportingData || isRefreshing}
            className="h-7 rounded bg-[#242424] px-2 text-[11px] text-[#e5e5e5] hover:bg-[#2e2e2e] disabled:text-[#6b6b6b] disabled:hover:bg-[#242424] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
            title="Import external DICOM files into the DICOM repository"
          >
            {isImportingData ? 'Importing' : 'Import Data'}
          </button>
          <button
            type="button"
            onClick={() => void onPushChanges()}
            disabled={!activeLoadedSeries || !activeSeriesStructureSet || !isActiveSeriesRepositoryDirty || isPushingChanges}
            className="h-7 rounded bg-[#242424] px-2 text-[11px] text-[#e5e5e5] hover:bg-[#2e2e2e] disabled:text-[#6b6b6b] disabled:hover:bg-[#242424] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
            title={
              !activeLoadedSeries || !activeSeriesStructureSet
                ? 'Select a structure set for the active series first'
                : !isActiveSeriesRepositoryDirty
                  ? 'No local structure changes to push'
                  : 'Push active structure changes to the DICOM repository as RTSTRUCT'
            }
          >
            {isPushingChanges ? 'Pushing' : 'Push Changes'}
          </button>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".dcm,*"
          className="sr-only"
          onChange={onImportDataChange}
        />

        <div className="mt-2 flex items-center gap-2">
          <a
            href="http://localhost:8042/"
            target="_blank"
            rel="noreferrer"
            className="text-[10px] uppercase tracking-widest text-[#6b6b6b] hover:text-[#a0a0a0]"
            title="Open Orthanc repository UI"
          >
            Orthanc
          </a>
          {activeLoadedSeries && (
            <span className="min-w-0 truncate text-[10px] text-[#6b6b6b]">
              Active: {activeLoadedSeries.series.seriesDescription || activeLoadedSeries.seriesUID}
            </span>
          )}
        </div>

        {status && (
          <p className={`mt-1 text-[11px] ${status.tone === 'error' ? 'text-red-400' : 'text-[#6b6b6b]'}`}>
            {status.message}
          </p>
        )}
      </div>

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
        {patientGroups.length === 0 ? (
          <p className="px-3 py-2 text-[11px] text-[#6b6b6b]">No planning CT image series available.</p>
        ) : !selectedPatient ? (
          <div className="px-3 py-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6b6b6b]">
              Current Patient
            </p>
            <p className="mt-2 text-[11px] text-[#a0a0a0]">Select a patient to begin.</p>
            <button
              type="button"
              onClick={() => setIsPatientSelectorOpen(true)}
              className="mt-3 h-7 rounded bg-blue-700 px-2 text-[11px] font-semibold text-white hover:bg-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
            >
              Select Patient
            </button>
          </div>
        ) : (
          <>
            <div className="border-b border-[#2a2a2a] bg-[#181818] px-3 py-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6b6b6b]">
                  Current Patient
                </p>
                <button
                  type="button"
                  onClick={() => setIsPatientSelectorOpen(true)}
                  className="h-5 rounded bg-[#242424] px-2 text-[10px] text-[#a0a0a0] hover:bg-[#2e2e2e] hover:text-[#e5e5e5] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
                >
                  Change
                </button>
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <span className="rounded bg-[#2e2e2e] px-1.5 py-0.5 text-[9px] font-semibold tracking-widest text-[#a0a0a0]">
                  PATIENT
                </span>
                <p className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[#e5e5e5]" title={selectedPatient.patientName}>
                  {selectedPatient.patientName}
                </p>
                {activePatientKey === selectedPatient.patientKey ? (
                  <span className="rounded bg-blue-900 px-1.5 py-0.5 text-[9px] font-semibold tracking-widest text-blue-200">
                    ACTIVE
                  </span>
                ) : null}
              </div>
              <p className="mt-0.5 truncate text-[10px] text-[#6b6b6b]">
                MRN {selectedPatient.patientId || 'unknown'} · {selectedPatient.studies.length} studies
              </p>
            </div>

            <div className="bg-[#151515]">
              <div className="border-b border-[#2a2a2a] bg-[#181818] px-2 py-1.5">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6b6b6b]">
                  Image Sets
                </p>
              </div>

              {selectedPatient?.studies.map((study) => (
                <div key={study.studyInstanceUID} className="border-b border-[#2a2a2a]">
                  <div className="bg-[#202020] px-2 py-1">
                    <div className="flex items-center gap-1.5">
                      <span className="rounded bg-[#242424] px-1.5 py-0.5 text-[9px] font-semibold tracking-widest text-[#6b6b6b]">
                        STUDY
                      </span>
                      <p className="min-w-0 flex-1 truncate text-[10px] uppercase tracking-wide text-[#a0a0a0]" title={study.studyDescription}>
                        {study.studyDescription || 'Study'}
                      </p>
                    </div>
                    <p className="mt-0.5 pl-[46px] text-[10px] text-[#6b6b6b]">{formatDicomDate(study.studyDate)}</p>
                  </div>
                  {study.series.map((entry) => {
                    const isLoaded = loadedSeries.some((item) => item.seriesUID === entry.seriesInstanceUID);
                    const isActive = activeSeriesUID === entry.seriesInstanceUID;

                    return (
                      <button
                        key={entry.seriesInstanceUID}
                        type="button"
                        onClick={() => void onLoadSeries(entry.seriesInstanceUID)}
                        disabled={loadingSeriesUID === entry.seriesInstanceUID}
                        className={`block w-full border-t border-[#2a2a2a] px-2 py-1.5 text-left hover:bg-[#2e2e2e] disabled:hover:bg-transparent focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
                          isActive ? 'bg-blue-900/30 border-l-2 border-l-blue-500' : 'border-l-2 border-l-transparent'
                        }`}
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
                          <span>{entry.instanceCount} inst</span>
                          {loadingSeriesUID === entry.seriesInstanceUID && (
                            <span className="text-blue-400">loading</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                  <div className="border-t border-[#2a2a2a] bg-[#171717] px-2 py-1">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6b6b6b]">
                      Structure Sets
                    </p>
                    {loadingRtstructStudyUIDs.includes(study.studyInstanceUID) ? (
                      <p className="mt-1 text-[10px] text-blue-400">Loading RTSTRUCT objects...</p>
                    ) : (rtstructByStudy[study.studyInstanceUID]?.length ?? 0) === 0 ? (
                      <p className="mt-1 text-[10px] text-[#6b6b6b]">No RTSTRUCT in this study.</p>
                    ) : (
                      <div className="mt-1 space-y-1">
                        {[...(rtstructByStudy[study.studyInstanceUID] ?? [])]
                          .sort(compareRtstructInstances)
                          .map((instance, index) => {
                          const isActiveRtstruct =
                            activeSeriesStructureSet?.source?.type === 'rtstruct' &&
                            activeSeriesStructureSet.source.sopInstanceUID === instance.sopInstanceUID;
                          const isLatestRtstruct = index === 0;

                          return (
                            <div
                              key={instance.sopInstanceUID}
                              role="button"
                              tabIndex={!importingRtstructSop && study.series.length > 0 ? 0 : -1}
                              onDoubleClick={() => void onLoadRtstruct(instance, study.series)}
                              onKeyDown={(event) => {
                                if ((event.key === 'Enter' || event.key === ' ') && !importingRtstructSop && study.series.length > 0) {
                                  event.preventDefault();
                                  void onLoadRtstruct(instance, study.series);
                                }
                              }}
                              aria-disabled={study.series.length === 0 || !!importingRtstructSop}
                              className={`border px-2 py-1 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
                                isActiveRtstruct ? 'border-blue-700 bg-blue-950/20' : 'border-[#2a2a2a] bg-[#1a1a1a]'
                              } ${
                                study.series.length > 0 && !importingRtstructSop
                                  ? 'cursor-pointer hover:border-blue-700 hover:bg-blue-950/20'
                                  : 'cursor-not-allowed opacity-60'
                              }`}
                              title={study.series.length > 0 ? 'Double-click to activate this image set and load RTSTRUCT' : 'No planning CT image set is available for this RTSTRUCT'}
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
                                    : 'Double-click to load'}
                                </span>
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
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
