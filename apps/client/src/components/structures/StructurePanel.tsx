import { useState, useRef, useEffect } from 'react';
import { useStructureStore } from '../../core/store/structureStore';
import { useVolumeStore } from '../../core/store/volumeStore';
import { StructureSetManager } from '../../core/structures/StructureSetManager';
import type { Structure, StructureType } from '@webtps/shared-types';
import {
  exportStructureSets,
  importStructureSets,
  replaceStructureSetsForSeries,
} from '../../core/structures/structurePersistence';
import { exportRtstructBlob } from '../../core/structures/rtstructExport';
import {
  loadStructureDraftForSeries,
  saveStructureDraftForSeries,
} from '../../core/structures/structureDraftStore';
import { uploadDicomBlobToRepository } from '../../core/dicom/dicomWebClient';
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
  const inputRef = useRef<HTMLInputElement>(null);
  const importInputRef = useRef<HTMLInputElement>(null);
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

  const handleExport = () => {
    if (structureSets.length === 0) return;

    const payload = exportStructureSets(
      structureSets,
      activeStructureSetId,
      activeStructureId
    );
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const dateLabel = new Date().toISOString().replace(/[:.]/g, '-');

    anchor.href = objectUrl;
    anchor.download = `webtps-structures-${dateLabel}.json`;
    anchor.click();
    URL.revokeObjectURL(objectUrl);
    setStatusMessage(`Exported ${payload.structureSets.length} structure set(s).`);
    logClientDebug('StructurePanel', `export count=${payload.structureSets.length}`);
  };

  const handleImportClick = () => {
    importInputRef.current?.click();
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const imported = importStructureSets(await file.text());
      replaceStructureSets(imported.structureSets);
      setActiveStructureSet(imported.activeStructureSetId);
      setActiveStructure(imported.activeStructureId);
      StructureSetManager.syncSelectionToSeries(activeSeriesUID);
      for (const structureSet of imported.structureSets) {
        markSeriesDirty(structureSet.referencedSeriesUID);
      }
      setStatusMessage(`Imported ${imported.structureSets.length} structure set(s).`);
      logClientDebug('StructurePanel', `import count=${imported.structureSets.length}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to import structure JSON.';
      setStatusMessage(message);
      logClientDebug('StructurePanel', `import:error ${message}`);
    } finally {
      event.target.value = '';
    }
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
          <input
            ref={importInputRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleImportFile}
          />
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
            onClick={handleExport}
            title={structureSets.length > 0 ? 'Export structures JSON' : 'No structures to export'}
            disabled={structureSets.length === 0}
            className="w-5 h-5 flex items-center justify-center rounded bg-[#2e2e2e] text-[#a0a0a0] hover:bg-[#3a3a3a] hover:text-[#e5e5e5] text-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 1v6" />
              <polyline points="3.5 4.5 6 7 8.5 4.5" />
              <path d="M2 9.5h8" />
            </svg>
          </button>
          <button
            onClick={handleImportClick}
            title="Import structures JSON"
            className="w-5 h-5 flex items-center justify-center rounded bg-[#2e2e2e] text-[#a0a0a0] hover:bg-[#3a3a3a] hover:text-[#e5e5e5] text-xs transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M6 11V5" />
              <polyline points="3.5 7.5 6 5 8.5 7.5" />
              <path d="M2 2.5h8" />
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
