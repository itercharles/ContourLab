import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UndoRedoManager } from '../../core/contouring/UndoRedoManager';
import { useStructureStore } from '../../core/store/structureStore';
import { useVolumeStore } from '../../core/store/volumeStore';
import { exportRtstructObject } from '../../core/structures/rtstructExport';
import { uploadDicomBlobToRepository } from '../../core/dicom/dicomWebClient';
import { logClientDebug } from '../../core/debug/clientDebugLog';
import WorkspaceContextBar from '../layout/WorkspaceContextBar';

export default function Toolbar() {
  const [undoRedoRevision, setUndoRedoRevision] = useState(0);
  const [isPushingChanges, setIsPushingChanges] = useState(false);
  const activeSeriesUID = useVolumeStore((s) => s.activeSeriesUID);
  const loadedSeries = useVolumeStore((s) => s.loadedSeries);
  const structureSets = useStructureStore((s) => s.structureSets);
  const activeStructureSetId = useStructureStore((s) => s.activeStructureSetId);
  const replaceStructureSets = useStructureStore((s) => s.replaceStructureSets);
  const setActiveStructureSet = useStructureStore((s) => s.setActiveStructureSet);
  const setActiveStructure = useStructureStore((s) => s.setActiveStructure);
  const markSeriesClean = useStructureStore((s) => s.markSeriesClean);
  const markSeriesRepositoryClean = useStructureStore((s) => s.markSeriesRepositoryClean);
  const repositoryDirtySeriesUIDs = useStructureStore((s) => s.repositoryDirtySeriesUIDs);
  const activeStructureSetById = structureSets.find(
    (structureSet) => structureSet.id === activeStructureSetId
  );
  const activeStructureSet =
    activeStructureSetById?.referencedSeriesUID === activeSeriesUID
      ? activeStructureSetById
      : undefined;

  useEffect(() => {
    return UndoRedoManager.subscribe(() => {
      setUndoRedoRevision((value) => value + 1);
    });
  }, []);

  const activeLoadedSeries = loadedSeries.find((series) => series.seriesUID === activeSeriesUID);
  const isActiveSeriesRepositoryDirty =
    !!activeSeriesUID && repositoryDirtySeriesUIDs.includes(activeSeriesUID);
  const canPushChanges =
    !!activeLoadedSeries &&
    !!activeStructureSet &&
    isActiveSeriesRepositoryDirty &&
    !isPushingChanges;
  void undoRedoRevision;
  const canUndo = UndoRedoManager.canUndo();
  const canRedo = UndoRedoManager.canRedo();

  const handleUndo = () => {
    if (UndoRedoManager.canUndo()) UndoRedoManager.undo();
  };

  const handleRedo = () => {
    if (UndoRedoManager.canRedo()) UndoRedoManager.redo();
  };

  const handlePushChanges = async () => {
    if (!activeLoadedSeries || !activeStructureSet || !activeSeriesUID || !isActiveSeriesRepositoryDirty) return;

    try {
      setIsPushingChanges(true);
      const exported = await exportRtstructObject(activeLoadedSeries, activeStructureSet);
      await uploadDicomBlobToRepository(exported.blob);
      const pushedStructureSet = {
        ...activeStructureSet,
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
          structureSet.id === activeStructureSet.id ? pushedStructureSet : structureSet
        )
      );
      setActiveStructureSet(pushedStructureSet.id);
      setActiveStructure(pushedStructureSet.structures[0]?.id ?? null);
      markSeriesClean(activeLoadedSeries.seriesUID);
      markSeriesRepositoryClean(activeLoadedSeries.seriesUID);
      logClientDebug(
        'Toolbar',
        `upload:rtstruct series=${activeLoadedSeries.seriesUID} set=${activeStructureSet.id} sop=${exported.identifiers.sopInstanceUID}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to push structure changes.';
      logClientDebug('Toolbar', `upload:rtstruct:error ${message}`);
    } finally {
      setIsPushingChanges(false);
    }
  };

  return (
    <div className="flex flex-none flex-col border-b border-[#2a2a2a] bg-[#111]">
      <div className="flex h-9 items-center gap-2 border-b border-[#24292f] bg-[#181b20] px-2">
        <div className="flex items-center gap-1.5 pr-1">
          <div className="grid h-5 w-5 place-items-center rounded bg-blue-600 font-mono text-[10px] font-bold text-white">
            W
          </div>
          <span className="text-[12px] font-semibold tracking-tight text-[#e6e9ed]">WebTPS</span>
        </div>
        <div className="flex items-center rounded border border-[#24292f] bg-[#0b0d10] p-0.5">
          <button
            type="button"
            className="rounded bg-[#181b20] px-2.5 py-1 text-[11px] font-medium text-[#e6e9ed]"
            title="Contour workspace"
          >
            <span className="mr-1 font-mono text-[9px] text-[#6b7280]">01</span>
            Contour
          </button>
          {(['Review', 'Plan'] as const).map((label, index) => (
            <button
              key={label}
              type="button"
              disabled
              className="cursor-not-allowed rounded px-2.5 py-1 text-[11px] font-medium text-[#6b7280]"
              title="Not implemented"
            >
              <span className="mr-1 font-mono text-[9px]">{String(index + 2).padStart(2, '0')}</span>
              {label}
              <span className="ml-1 text-[9px]">soon</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void handlePushChanges()}
          disabled={!canPushChanges}
          title={
            !activeLoadedSeries || !activeStructureSet
              ? 'Select a structure set for the active series first'
              : !isActiveSeriesRepositoryDirty
                ? 'No local structure changes to save'
                : 'Save active structure changes to the DICOM repository as RTSTRUCT'
          }
          aria-label="Save changes"
          className={`flex h-7 w-7 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            canPushChanges
              ? 'bg-blue-700 text-white hover:bg-blue-600'
              : 'bg-[#242424] text-[#6b6b6b] opacity-60'
          }`}
        >
          <svg
            className={isPushingChanges ? 'animate-pulse' : ''}
            aria-hidden="true"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
            <path d="M17 21v-8H7v8" />
            <path d="M7 3v5h8" />
          </svg>
        </button>
        <div className="ml-auto" />

        {/* Collaborator presence */}
        <div className="flex items-center" aria-label="2 active collaborators">
          {[
            { initials: 'EC', color: '#3b82f6' },
            { initials: 'MT', color: '#10b981' },
          ].map(({ initials, color }, i) => (
            <span
              key={initials}
              title={`Collaborator ${initials}`}
              className="grid h-[22px] w-[22px] place-items-center rounded-full border-2 border-[#13161a] text-[10px] font-bold text-white"
              style={{ background: color, marginLeft: i === 0 ? 0 : -6 }}
            >
              {initials}
            </span>
          ))}
        </div>

        <button
          onClick={handleUndo}
          disabled={!canUndo}
          title={canUndo ? `Undo: ${UndoRedoManager.getUndoDescription()} (⌘Z)` : 'Undo (⌘Z)'}
          aria-label="Undo"
          className="flex h-7 w-7 items-center justify-center rounded text-[#a0a7b0] transition-colors hover:bg-[#1f242b] hover:text-[#e6e9ed] disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 4 3 7l3 3" />
            <path d="M3 7h6a4 4 0 0 1 4 4" />
          </svg>
        </button>
        <button
          onClick={handleRedo}
          disabled={!canRedo}
          title={canRedo ? `Redo: ${UndoRedoManager.getRedoDescription()} (⌘⇧Z)` : 'Redo (⌘⇧Z)'}
          aria-label="Redo"
          className="flex h-7 w-7 items-center justify-center rounded text-[#a0a7b0] transition-colors hover:bg-[#1f242b] hover:text-[#e6e9ed] disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m10 4 3 3-3 3" />
            <path d="M13 7H7a4 4 0 0 0-4 4" />
          </svg>
        </button>
        {/* Inbox / notifications */}
        <button
          type="button"
          disabled
          title="Inbox · 0 unread"
          aria-label="Inbox"
          className="relative flex h-7 w-7 cursor-not-allowed items-center justify-center rounded text-[#404040]"
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </button>
        <div className="h-4 w-px bg-[#24292f]" />
        <Link
          to="/settings"
          title="Settings"
          aria-label="Settings"
          className="flex h-7 w-7 items-center justify-center rounded text-[#a0a7b0] transition-colors hover:bg-[#1f242b] hover:text-[#e6e9ed] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z" />
          </svg>
        </Link>
      </div>
      <WorkspaceContextBar />
    </div>
  );
}
