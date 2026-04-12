import { useState, useRef, useEffect } from 'react';
import { useStructureStore } from '../../core/store/structureStore';
import { useVolumeStore } from '../../core/store/volumeStore';
import { StructureSetManager } from '../../core/structures/StructureSetManager';
import type { Structure, StructureType } from '@webtps/shared-types';
import {
  replaceStructureSetsForSeries,
} from '../../core/structures/structurePersistence';
import { exportRtstructBlob } from '../../core/structures/rtstructExport';
import { importRtstructArrayBuffer } from '../../core/structures/rtstructImport';
import {
  loadStructureDraftForSeries,
  saveStructureDraftForSeries,
} from '../../core/structures/structureDraftStore';
import {
  type DicomWebRtstructInstance,
  queryRtstructInstancesForStudy,
  retrieveDicomWebInstance,
  uploadDicomBlobToRepository,
} from '../../core/dicom/dicomWebClient';
import { logClientDebug } from '../../core/debug/clientDebugLog';

const STRUCTURE_TYPES: StructureType[] = [
  'GTV',
  'CTV',
  'PTV',
  'OAR',
  'EXTERNAL',
  'AVOIDANCE',
  'SUPPORT',
];

function rgbToHex([r, g, b]: [number, number, number]): string {
  return `#${[r, g, b]
    .map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0'))
    .join('')}`;
}

function hexToRgb(value: string): [number, number, number] {
  const normalized = value.replace('#', '');
  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
  ];
}

function formatDicomDateTime(date: string, time: string): string {
  const datePart = date.length === 8
    ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
    : 'unknown date';
  const timePart = time.length >= 6
    ? `${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`
    : 'unknown time';

  return `${datePart} ${timePart}`;
}

interface StructureRowProps {
  structure: Structure;
  setId: string;
  isActive: boolean;
  onSelect: () => void;
  onStatus: (message: string) => void;
}

function StructureRow({ structure, setId, isActive, onSelect, onStatus }: StructureRowProps) {
  const updateStructure = useStructureStore((s) => s.updateStructure);
  const deleteStructure = useStructureStore((s) => s.deleteStructure);
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState(structure.name);

  const [r, g, b] = structure.color;
  const colorStyle = `rgb(${r}, ${g}, ${b})`;

  const handleVisibilityToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateStructure(setId, structure.id, { isVisible: !(structure.isVisible ?? true) });
  };

  const handleLockToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateStructure(setId, structure.id, { isLocked: !(structure.isLocked ?? false) });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`Delete structure "${structure.name}"?`)) {
      deleteStructure(setId, structure.id);
    }
  };

  const beginRename = (event: React.MouseEvent) => {
    event.stopPropagation();
    setDraftName(structure.name);
    setIsRenaming(true);
    onSelect();
  };

  const commitRename = () => {
    const nextName = draftName.trim();
    if (!nextName || nextName === structure.name) {
      setIsRenaming(false);
      setDraftName(structure.name);
      return;
    }

    try {
      StructureSetManager.renameStructure(setId, structure.id, nextName);
      setIsRenaming(false);
      onStatus(`Renamed structure to ${nextName}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to rename structure.';
      onStatus(message);
      setDraftName(structure.name);
      setIsRenaming(false);
    }
  };

  const cancelRename = () => {
    setDraftName(structure.name);
    setIsRenaming(false);
  };

  const handleRenameKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      commitRename();
    } else if (event.key === 'Escape') {
      cancelRename();
    }
  };

  return (
    <div
      onClick={onSelect}
      className={`
        h-7 flex items-center gap-1.5 px-2 cursor-pointer group border-b border-[#2a2a2a]/50 transition-colors
        ${isActive
          ? 'bg-blue-900/30 border-l-2 border-l-blue-500'
          : 'border-l-2 border-l-transparent hover:bg-[#2e2e2e]'
        }
      `}
    >
      {/* Color swatch */}
      <span
        className="w-2.5 h-2.5 rounded-sm flex-shrink-0"
        style={{ backgroundColor: colorStyle }}
      />

      {isRenaming ? (
        <input
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          onBlur={commitRename}
          onKeyDown={handleRenameKeyDown}
          onClick={(event) => event.stopPropagation()}
          autoFocus
          className="min-w-0 flex-1 bg-[#111] border border-blue-500 text-[11px] text-[#e5e5e5] rounded px-1 py-0.5 focus:outline-none"
        />
      ) : (
        <button
          type="button"
          onDoubleClick={beginRename}
          title="Double-click to rename"
          className="min-w-0 flex-1 text-left text-[11px] text-[#e5e5e5] truncate focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
        >
          {structure.name}
        </button>
      )}

      {/* Volume */}
      {(structure.volume_cc ?? 0) > 0 && (
        <span className="text-[10px] text-[#6b6b6b] mr-1 flex-none">
          {structure.volume_cc!.toFixed(1)} cc
        </span>
      )}

      {/* Action buttons — visible on row hover or when active */}
      <div className={`flex items-center gap-0.5 ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
        {/* Visibility toggle */}
        <button
          onClick={handleVisibilityToggle}
          title={structure.isVisible ? 'Hide' : 'Show'}
          className="w-4 h-4 flex items-center justify-center text-[#6b6b6b] hover:text-[#e5e5e5]"
        >
          {(structure.isVisible ?? true) ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
              <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
              <line x1="1" y1="1" x2="23" y2="23" />
            </svg>
          )}
        </button>

        {/* Lock toggle */}
        <button
          onClick={handleLockToggle}
          title={structure.isLocked ? 'Unlock' : 'Lock'}
          className="w-4 h-4 flex items-center justify-center text-[#6b6b6b] hover:text-[#e5e5e5]"
        >
          {(structure.isLocked ?? false) ? (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          ) : (
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 9.9-1" />
            </svg>
          )}
        </button>

        {/* Delete */}
        <button
          onClick={handleDelete}
          title="Delete structure"
          className="w-4 h-4 flex items-center justify-center text-[#6b6b6b] hover:text-red-400"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6l-1 14H6L5 6" />
            <path d="M10 11v6M14 11v6" />
            <path d="M9 6V4h6v2" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export default function StructurePanel() {
  const structureSets = useStructureStore((s) => s.structureSets);
  const activeStructureSetId = useStructureStore((s) => s.activeStructureSetId);
  const activeStructureId = useStructureStore((s) => s.activeStructureId);
  const setActiveStructure = useStructureStore((s) => s.setActiveStructure);
  const setActiveStructureSet = useStructureStore((s) => s.setActiveStructureSet);
  const replaceStructureSets = useStructureStore((s) => s.replaceStructureSets);
  const updateStructure = useStructureStore((s) => s.updateStructure);
  const dirtySeriesUIDs = useStructureStore((s) => s.dirtySeriesUIDs);
  const markSeriesDirty = useStructureStore((s) => s.markSeriesDirty);
  const markSeriesClean = useStructureStore((s) => s.markSeriesClean);
  const activeSeriesUID = useVolumeStore((s) => s.activeSeriesUID);
  const loadedSeries = useVolumeStore((s) => s.loadedSeries);

  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [rtstructCandidates, setRtstructCandidates] = useState<DicomWebRtstructInstance[]>([]);
  const [isQueryingRtstruct, setIsQueryingRtstruct] = useState(false);
  const [importingRtstructSop, setImportingRtstructSop] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const attemptedAutoLoadSeriesRef = useRef(new Set<string>());
  const draftSaveTimerRef = useRef<number | null>(null);
  const isActiveSeriesDirty = !!activeSeriesUID && dirtySeriesUIDs.includes(activeSeriesUID);
  const activeLoadedSeries = activeSeriesUID
    ? loadedSeries.find((series) => series.seriesUID === activeSeriesUID)
    : undefined;
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
  const activeStructure = activeSeriesStructureSet?.structures.find(
    (structure) => structure.id === activeStructureId
  );
  const importWouldReplaceActiveStructures = (activeSeriesStructureSet?.structures.length ?? 0) > 0;

  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  useEffect(() => {
    StructureSetManager.syncSelectionToSeries(activeSeriesUID);
  }, [activeSeriesUID, structureSets]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtySeriesUIDs.length === 0) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirtySeriesUIDs]);

  useEffect(() => {
    if (!activeSeriesUID) return;
    if (attemptedAutoLoadSeriesRef.current.has(activeSeriesUID)) return;

    const hasLocalStructures = structureSets.some(
      (structureSet) => structureSet.referencedSeriesUID === activeSeriesUID
    );
    if (hasLocalStructures) {
      attemptedAutoLoadSeriesRef.current.add(activeSeriesUID);
      return;
    }

    attemptedAutoLoadSeriesRef.current.add(activeSeriesUID);
    let cancelled = false;

    const autoLoad = async () => {
      try {
        const imported = await loadStructureDraftForSeries(activeSeriesUID);
        if (cancelled || !imported || imported.structureSets.length === 0) {
          if (!cancelled) {
            logClientDebug('StructurePanel', `draft:empty series=${activeSeriesUID}`);
          }
          return;
        }

        replaceStructureSets(
          replaceStructureSetsForSeries(structureSets, imported.structureSets, activeSeriesUID)
        );
        setActiveStructureSet(imported.activeStructureSetId);
        setActiveStructure(imported.activeStructureId);
        StructureSetManager.syncSelectionToSeries(activeSeriesUID);
        markSeriesClean(activeSeriesUID);
        setStatusMessage(`Restored ${imported.structureSets.length} local draft structure set(s).`);
        logClientDebug('StructurePanel', `draft:load series=${activeSeriesUID} count=${imported.structureSets.length}`);
      } catch (error) {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : 'Failed to restore local draft.';
        setStatusMessage(message);
        logClientDebug('StructurePanel', `draft:load:error ${message}`);
      }
    };

    void autoLoad();

    return () => {
      cancelled = true;
    };
  }, [
    activeSeriesUID,
    markSeriesClean,
    replaceStructureSets,
    setActiveStructure,
    setActiveStructureSet,
    structureSets,
  ]);

  useEffect(() => {
    if (!activeSeriesUID || !isActiveSeriesDirty) return;

    if (draftSaveTimerRef.current !== null) {
      window.clearTimeout(draftSaveTimerRef.current);
    }

    draftSaveTimerRef.current = window.setTimeout(() => {
      void saveStructureDraftForSeries(
        activeSeriesUID,
        structureSets,
        activeStructureSetId,
        activeStructureId
      )
        .then(() => {
          markSeriesClean(activeSeriesUID);
          setStatusMessage('Local draft auto-saved in this browser.');
          logClientDebug('StructurePanel', `draft:save series=${activeSeriesUID}`);
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : 'Failed to auto-save local draft.';
          setStatusMessage(message);
          logClientDebug('StructurePanel', `draft:save:error ${message}`);
        });
    }, 600);

    return () => {
      if (draftSaveTimerRef.current !== null) {
        window.clearTimeout(draftSaveTimerRef.current);
      }
    };
  }, [
    activeSeriesUID,
    activeStructureId,
    activeStructureSetId,
    isActiveSeriesDirty,
    markSeriesClean,
    structureSets,
  ]);

  const handleAddClick = () => {
    if (!activeSeriesUID) return;
    setNewName('');
    setIsAdding(true);
  };

  const handleConfirmAdd = () => {
    const name = newName.trim();
    if (!name) {
      setIsAdding(false);
      return;
    }

    let setId = activeStructureSetId;

    // Create a structure set if none exists
    if (!setId) {
      const ss = StructureSetManager.createStructureSet(activeSeriesUID ?? 'default');
      setId = ss.id;
    }

    try {
      StructureSetManager.createStructure(setId, name);
      setIsAdding(false);
      setNewName('');
      setStatusMessage(`Added structure ${name}.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to add structure.';
      setStatusMessage(message);
    }
  };

  const handleCancelAdd = () => {
    setIsAdding(false);
    setNewName('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleConfirmAdd();
    else if (e.key === 'Escape') handleCancelAdd();
  };

  const handleUploadRtstruct = async () => {
    if (!activeLoadedSeries || !activeSeriesStructureSet) return;

    try {
      const blob = await exportRtstructBlob(activeLoadedSeries, activeSeriesStructureSet);
      await uploadDicomBlobToRepository(blob);
      setStatusMessage(`Uploaded RTSTRUCT for ${activeSeriesStructureSet.label} to DICOM repository.`);
      logClientDebug(
        'StructurePanel',
        `upload:rtstruct series=${activeLoadedSeries.seriesUID} set=${activeSeriesStructureSet.id}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to upload RTSTRUCT.';
      setStatusMessage(message);
      logClientDebug('StructurePanel', `upload:rtstruct:error ${message}`);
    }
  };

  const handleImportRtstructFromRepository = async () => {
    if (!activeLoadedSeries || !activeSeriesUID) return;

    try {
      setIsQueryingRtstruct(true);
      setStatusMessage('Searching DICOM repository for RTSTRUCT...');
      const rtstructInstances = await queryRtstructInstancesForStudy(
        activeLoadedSeries.study.studyInstanceUID
      );
      if (rtstructInstances.length === 0) {
        setRtstructCandidates([]);
        setStatusMessage('No RTSTRUCT found in the DICOM repository for this study.');
        logClientDebug('StructurePanel', `import:rtstruct:none study=${activeLoadedSeries.study.studyInstanceUID}`);
        return;
      }

      setStatusMessage(
        `Found ${rtstructInstances.length} RTSTRUCT object(s). Select one to import.`
      );
      setRtstructCandidates(rtstructInstances);
      logClientDebug(
        'StructurePanel',
        `import:rtstruct:candidates study=${activeLoadedSeries.study.studyInstanceUID} count=${rtstructInstances.length}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to query RTSTRUCT.';
      setStatusMessage(message);
      logClientDebug('StructurePanel', `import:rtstruct:error ${message}`);
    } finally {
      setIsQueryingRtstruct(false);
    }
  };

  const handleImportRtstructCandidate = async (instance: DicomWebRtstructInstance) => {
    if (!activeSeriesUID) return;

    try {
      setImportingRtstructSop(instance.sopInstanceUID);
      setStatusMessage(`Importing RTSTRUCT ${instance.sopInstanceUID}...`);
      const buffer = await retrieveDicomWebInstance(instance);
      const importedStructureSet = await importRtstructArrayBuffer(buffer, activeSeriesUID);
      replaceStructureSets(
        replaceStructureSetsForSeries(structureSets, [importedStructureSet], activeSeriesUID)
      );
      setActiveStructureSet(importedStructureSet.id);
      setActiveStructure(importedStructureSet.structures[0]?.id ?? null);
      markSeriesDirty(activeSeriesUID);
      setRtstructCandidates([]);
      setStatusMessage(
        `Replaced with RTSTRUCT containing ${importedStructureSet.structures.length} structure(s).`
      );
      logClientDebug(
        'StructurePanel',
        `import:rtstruct mode=replace series=${activeSeriesUID} sop=${instance.sopInstanceUID} structures=${importedStructureSet.structures.length}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import RTSTRUCT.';
      setStatusMessage(message);
      logClientDebug('StructurePanel', `import:rtstruct:error ${message}`);
    } finally {
      setImportingRtstructSop(null);
    }
  };

  const handleActiveStructureColorChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!activeSeriesStructureSet || !activeStructure) return;

    updateStructure(activeSeriesStructureSet.id, activeStructure.id, {
      color: hexToRgb(event.target.value),
    });
    setStatusMessage(`Updated ${activeStructure.name} color.`);
  };

  const handleActiveStructureTypeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    if (!activeSeriesStructureSet || !activeStructure) return;

    const nextType = event.target.value as StructureType;
    updateStructure(activeSeriesStructureSet.id, activeStructure.id, {
      type: nextType,
    });
    setStatusMessage(`Updated ${activeStructure.name} type to ${nextType}.`);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Panel header */}
      <div className="px-3 py-1.5 flex items-center justify-between border-b border-[#2a2a2a] flex-none">
        <span className="text-[10px] font-semibold tracking-widest uppercase text-[#6b6b6b]">Structures</span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleUploadRtstruct}
            title={
              activeLoadedSeries && activeSeriesStructureSet
                ? 'Upload active structure set as RTSTRUCT to DICOM repository'
                : 'Select a structure set for the active series first'
            }
            disabled={!activeLoadedSeries || !activeSeriesStructureSet}
            className="w-5 h-5 flex items-center justify-center rounded bg-[#2e2e2e] text-[#a0a0a0] hover:bg-[#3a3a3a] hover:text-[#22c55e] text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 1.5h6.5L10.5 3v7.5H2z" />
              <path d="M6 8V3" />
              <polyline points="3.5 5.5 6 3 8.5 5.5" />
            </svg>
          </button>
          <button
            onClick={handleImportRtstructFromRepository}
            title={
              activeLoadedSeries
                ? 'Find RTSTRUCT objects in DICOM repository for this study'
                : 'Load a series before importing RTSTRUCT'
            }
            disabled={!activeLoadedSeries || isQueryingRtstruct}
            className="w-5 h-5 flex items-center justify-center rounded bg-[#2e2e2e] text-[#a0a0a0] hover:bg-[#3a3a3a] hover:text-[#e5e5e5] text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 1.5h6.5L10.5 3v7.5H2z" />
              <path d="M6 3v5.5" />
              <polyline points="3.5 6 6 8.5 8.5 6" />
            </svg>
          </button>
          <button
            onClick={handleAddClick}
            title={activeSeriesUID ? 'Add new structure' : 'Load a series first'}
            disabled={!activeSeriesUID}
            className="w-5 h-5 flex items-center justify-center rounded bg-[#2e2e2e] text-[#a0a0a0] hover:bg-blue-600 hover:text-white text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#2e2e2e] disabled:hover:text-[#a0a0a0]"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="6" y1="1" x2="6" y2="11" />
              <line x1="1" y1="6" x2="11" y2="6" />
            </svg>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className="px-3 py-1 border-b border-[#2a2a2a] bg-[#242424] text-[10px] text-[#a0a0a0]">
          {statusMessage}
        </div>
      )}

      {isActiveSeriesDirty && (
        <div className="px-3 py-1 border-b border-[#2a2a2a] bg-[#2a2112] text-[10px] text-[#f59e0b]">
          Local draft pending auto-save.
        </div>
      )}

      {rtstructCandidates.length > 0 && (
        <div className="border-b border-[#2a2a2a] bg-[#202020] px-3 py-2 flex-none">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] uppercase tracking-widest text-[#6b6b6b]">
              Repository RTSTRUCT
            </p>
            <button
              type="button"
              onClick={() => setRtstructCandidates([])}
              className="text-[10px] text-[#6b6b6b] hover:text-[#e5e5e5] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
            >
              Cancel
            </button>
          </div>
          <p className="mt-1 text-[10px] leading-snug text-[#a0a0a0]">
            Import replaces the current active-series structures and updates the local browser draft.
          </p>
          <div className="mt-1.5 space-y-1">
            {rtstructCandidates.map((instance) => (
              <div
                key={instance.sopInstanceUID}
                className="flex items-center gap-2 border border-[#2a2a2a] bg-[#1a1a1a] px-2 py-1"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[11px] text-[#e5e5e5]" title={instance.seriesDescription}>
                    {instance.seriesDescription || 'RTSTRUCT'}
                  </p>
                  <p className="truncate text-[10px] text-[#6b6b6b]" title={instance.sopInstanceUID}>
                    {formatDicomDateTime(instance.seriesDate, instance.seriesTime)}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleImportRtstructCandidate(instance)}
                  disabled={!!importingRtstructSop}
                  className={`h-5 px-2 text-[10px] rounded bg-[#2e2e2e] text-[#a0a0a0] disabled:opacity-40 disabled:cursor-not-allowed focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
                    importWouldReplaceActiveStructures
                      ? 'hover:bg-[#7f1d1d] hover:text-white'
                      : 'hover:bg-blue-600 hover:text-white'
                  }`}
                >
                  {importingRtstructSop === instance.sopInstanceUID ? 'Replacing' : 'Replace'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeSeriesStructureSet && activeStructure && (
        <div className="px-3 py-2 border-b border-[#2a2a2a] bg-[#202020] flex-none">
          <div className="flex items-center gap-2">
            <span
              className="w-2.5 h-2.5 rounded-sm flex-none"
              style={{ backgroundColor: rgbToHex(activeStructure.color) }}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-widest text-[#6b6b6b]">
                Drawing target
              </p>
              <p className="truncate text-[11px] text-[#e5e5e5]" title={activeStructure.name}>
                {activeStructure.name}
                {activeStructure.isLocked ? (
                  <span className="ml-1 text-[#f59e0b]">(locked)</span>
                ) : null}
              </p>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-1">
            <label htmlFor="active-structure-color" className="text-[10px] text-[#6b6b6b]">
              Color
            </label>
            <input
              id="active-structure-color"
              aria-label="Active structure color"
              type="color"
              value={rgbToHex(activeStructure.color)}
              onChange={handleActiveStructureColorChange}
              className="h-6 w-full cursor-pointer rounded border border-[#3a3a3a] bg-[#2e2e2e]"
            />

            <label htmlFor="active-structure-type" className="text-[10px] text-[#6b6b6b]">
              Type
            </label>
            <select
              id="active-structure-type"
              aria-label="Active structure type"
              value={activeStructure.type}
              onChange={handleActiveStructureTypeChange}
              className="h-6 rounded border border-[#3a3a3a] bg-[#2e2e2e] px-1 text-[11px] text-[#e5e5e5] focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {STRUCTURE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Inline add form */}
      {isAdding && (
        <div className="px-2 py-1.5 border-b border-[#2a2a2a] bg-[#242424] flex-none">
          <input
            ref={inputRef}
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g. PTV, Brainstem…"
            className="bg-[#1a1a1a] border border-[#3a3a3a] text-[11px] text-[#e5e5e5] rounded px-2 py-1 w-full placeholder-[#6b6b6b] focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          <div className="flex gap-1.5 mt-1.5">
            <button
              onClick={handleConfirmAdd}
              className="flex-1 text-[11px] text-blue-400 hover:text-blue-300 py-0.5 transition-colors"
            >
              Add
            </button>
            <button
              onClick={handleCancelAdd}
              className="flex-1 text-[11px] text-[#6b6b6b] hover:text-[#a0a0a0] py-0.5 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Structure sets and structures */}
      <div className="flex-1 overflow-y-auto">
        {structureSets.length === 0 ? (
          <p className="text-[11px] text-[#6b6b6b] px-3 py-3">No structures yet. Click "+" to add one.</p>
        ) : (
          structureSets.map((ss) => (
            <div key={ss.id}>
              {/* Structure set label */}
              <div className="px-3 py-1 text-[10px] uppercase tracking-widest text-[#6b6b6b] bg-[#242424] border-b border-[#2a2a2a] truncate" title={ss.label}>
                {ss.label}
              </div>

              {/* Structures list */}
              <div>
                {ss.structures.length === 0 ? (
                  <p className="text-[11px] text-[#6b6b6b] px-3 py-3">No structures in this set</p>
                ) : (
                  ss.structures.map((structure) => (
                    <StructureRow
                      key={structure.id}
                      structure={structure}
                      setId={ss.id}
                      isActive={structure.id === activeStructureId}
                      onSelect={() => setActiveStructure(structure.id)}
                      onStatus={setStatusMessage}
                    />
                  ))
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
