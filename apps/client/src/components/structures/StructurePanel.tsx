import { useState, useRef, useEffect } from 'react';
import { useStructureStore } from '../../core/store/structureStore';
import { useVolumeStore } from '../../core/store/volumeStore';
import { useUIStore } from '../../core/store/uiStore';
import { StructureSetManager } from '../../core/structures/StructureSetManager';
import type { Structure, StructureSet, StructureType } from '@webtps/shared-types';
import {
  loadStructureDraftForSeries,
  saveStructureDraftForSeries,
} from '../../core/structures/structureDraftStore';
import { replaceStructureSetsForSeries } from '../../core/structures/structurePersistence';
import {
  getReviewSlices,
  resolveContourReviewScrollDelta,
  resolveScrollDeltaToSlice,
  type ContourReviewDirection,
} from '../../core/structures/contourReview';
import {
  analyzeContourQuality,
} from '../../core/structures/contourQuality';
import {
  analyzeRtssQuality,
  type RtssQualityIssue,
} from '../../core/structures/rtssQuality';
import { ViewportManager } from '../../core/rendering/ViewportManager';
import { VIEWPORT_IDS } from '../../core/rendering/MPRController';
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

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;

  const tagName = target.tagName.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select'
  );
}

function formatSourceLabel(structureSet: StructureSet): string {
  if (structureSet.source?.type === 'rtstruct') {
    return structureSet.source.label || structureSet.label || 'RTSTRUCT';
  }

  if (structureSet.source?.type === 'local-draft') {
    return 'Local draft';
  }

  return structureSet.label || 'Manual structure set';
}

function formatSourceTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString([], {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSopTail(sopInstanceUID: string): string {
  return sopInstanceUID.split('.').at(-1) || sopInstanceUID.slice(-8) || 'unknown';
}

function formatVolumeCc(volumeCc: number | undefined): string {
  if (!Number.isFinite(volumeCc) || (volumeCc ?? 0) <= 0) return '0.0 cc';
  return `${volumeCc!.toFixed(1)} cc`;
}

interface AxialViewportLike {
  getCamera?: () => { focalPoint?: [number, number, number] };
  scroll?: (delta: number) => void;
  render?: () => void;
}

interface StructureSetQualityIssue {
  structureId?: string;
  structureName?: string;
  issue: RtssQualityIssue;
}

type PanelTab = 'structures' | 'qa' | 'dicom';

interface StructureRowProps {
  structure: Structure;
  setId: string;
  isActive: boolean;
  contourSliceCount: number;
  onSelect: () => void;
  onStatus: (message: string) => void;
}

function StructureRow({
  structure,
  setId,
  isActive,
  contourSliceCount,
  onSelect,
  onStatus,
}: StructureRowProps) {
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
    deleteStructure(setId, structure.id);
    onStatus(`Deleted structure ${structure.name}.`);
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

      <span
        className="w-[30px] text-right text-[9px] font-semibold uppercase tracking-wider text-[#6b6b6b] flex-none"
        title={`Structure type: ${structure.type}`}
      >
        {structure.type}
      </span>

      <span className="w-[42px] text-right text-[10px] text-[#6b6b6b] flex-none" title="Volume">
        {formatVolumeCc(structure.volume_cc)}
      </span>

      <div className="flex items-center gap-0.5 flex-none">
        {/* Visibility toggle */}
        <button
          onClick={handleVisibilityToggle}
          aria-label={structure.isVisible ? `Hide ${structure.name}` : `Show ${structure.name}`}
          title={structure.isVisible ? 'Hide' : 'Show'}
          className={`w-5 h-5 flex items-center justify-center hover:text-[#e5e5e5] ${
            structure.isVisible ?? true ? 'text-[#6b6b6b]' : 'text-[#404040]'
          }`}
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
          aria-label={structure.isLocked ? `Unlock ${structure.name}` : `Lock ${structure.name}`}
          title={structure.isLocked ? 'Unlock' : 'Lock'}
          className={`w-5 h-5 flex items-center justify-center hover:text-[#e5e5e5] ${
            structure.isLocked ? 'text-[#f59e0b]' : 'text-[#6b6b6b]'
          }`}
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
          aria-label={`Delete ${structure.name}`}
          title="Delete structure"
          className="w-5 h-5 flex items-center justify-center text-[#6b6b6b] opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
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
  const repositoryDirtySeriesUIDs = useStructureStore((s) => s.repositoryDirtySeriesUIDs);
  const markSeriesClean = useStructureStore((s) => s.markSeriesClean);
  const activeSeriesUID = useVolumeStore((s) => s.activeSeriesUID);
  const loadedSeries = useVolumeStore((s) => s.loadedSeries);
  const setActiveViewport = useUIStore((s) => s.setActiveViewport);

  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>('structures');
  const [axialRevision, setAxialRevision] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const attemptedAutoLoadSeriesRef = useRef(new Set<string>());
  const draftSaveTimerRef = useRef<number | null>(null);
  const isActiveSeriesDirty = !!activeSeriesUID && dirtySeriesUIDs.includes(activeSeriesUID);
  const isActiveSeriesRepositoryDirty =
    !!activeSeriesUID && repositoryDirtySeriesUIDs.includes(activeSeriesUID);
  const activeStructureSetById = structureSets.find(
    (structureSet) => structureSet.id === activeStructureSetId
  );
  const activeSeriesStructureSets = activeSeriesUID
    ? structureSets.filter((structureSet) => structureSet.referencedSeriesUID === activeSeriesUID)
    : [];
  const activeSeriesStructureSet = activeSeriesUID
    ? (
        activeStructureSetById?.referencedSeriesUID === activeSeriesUID
          ? activeStructureSetById
          : undefined
      )
    : undefined;
  const activeStructure = activeSeriesStructureSet?.structures.find(
    (structure) => structure.id === activeStructureId
  );
  const activeLoadedSeries = activeSeriesUID
    ? loadedSeries.find((series) => series.seriesUID === activeSeriesUID)
    : undefined;
  const activeStructureReviewSlices = activeStructure
    ? getReviewSlices(activeStructure.contours)
    : [];
  const activeStructureQa = activeStructure
    ? analyzeContourQuality(activeStructure, activeLoadedSeries?.volume.spacing[2] ?? 1)
    : null;
  const activeStructureSetQa = activeSeriesStructureSet
    ? analyzeRtssQuality(activeSeriesStructureSet, {
        activeSeriesUID,
        imageSopInstanceUIDs: activeLoadedSeries?.series.instances.map((instance) => instance.sopInstanceUID),
      })
    : null;
  const activeStructureSetQaIssues: StructureSetQualityIssue[] = activeStructureSetQa?.issues.map((issue) => ({
    structureId: issue.structureId,
    structureName: issue.structureName,
    issue,
  })) ?? [];
  const activeStructureSetWarningCount = activeStructureSetQaIssues.filter(
    ({ issue }) => issue.severity === 'warning'
  ).length;
  void axialRevision;
  useEffect(() => {
    if (isAdding && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isAdding]);

  useEffect(() => {
    let animationFrame: number | null = null;
    let cleanup: (() => void) | null = null;
    let attempts = 0;

    const attach = () => {
      const axialElement = document.querySelector<HTMLDivElement>(
        `[data-viewport-id="${VIEWPORT_IDS.AXIAL}"]`
      );

      if (!axialElement) {
        attempts += 1;
        if (attempts < 60) {
          animationFrame = window.requestAnimationFrame(attach);
        }
        return;
      }

      const update = () => setAxialRevision((value) => value + 1);
      axialElement.addEventListener('CORNERSTONE_IMAGE_RENDERED', update);
      axialElement.addEventListener('CORNERSTONE_CAMERA_MODIFIED', update);
      cleanup = () => {
        axialElement.removeEventListener('CORNERSTONE_IMAGE_RENDERED', update);
        axialElement.removeEventListener('CORNERSTONE_CAMERA_MODIFIED', update);
      };
      update();
    };

    attach();

    return () => {
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      cleanup?.();
    };
  }, []);

  useEffect(() => {
    StructureSetManager.syncSelectionToSeries(activeSeriesUID);
  }, [activeSeriesUID, structureSets]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirtySeriesUIDs.length === 0 && repositoryDirtySeriesUIDs.length === 0) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [dirtySeriesUIDs, repositoryDirtySeriesUIDs]);

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

    let setId = activeSeriesStructureSet?.id ?? null;

    // Create a structure set if none exists
    if (!setId) {
      const ss = StructureSetManager.createStructureSet(activeSeriesUID ?? 'default');
      setId = ss.id;
      setActiveStructureSet(ss.id);
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

  const handleReviewNavigate = (direction: ContourReviewDirection) => {
    if (!activeStructure || !activeLoadedSeries) return;

    const viewport = ViewportManager
      .getRenderingEngine()
      ?.getViewport(VIEWPORT_IDS.AXIAL) as AxialViewportLike | undefined;
    if (!viewport?.scroll) {
      setStatusMessage('Axial viewport is not ready for contour review navigation.');
      logClientDebug('StructurePanel', 'review:navigate:error axial viewport unavailable');
      return;
    }

    const currentSlicePosition = viewport.getCamera?.().focalPoint?.[2]
      ?? activeStructure.contours[0]?.slicePosition
      ?? 0;
    const frames = activeLoadedSeries.series.instances
      .map((instance, index) => ({
        index,
        sliceLocation: instance.sliceLocation,
      }))
      .filter((frame): frame is { index: number; sliceLocation: number } =>
        Number.isFinite(frame.sliceLocation)
      );
    const reviewTarget = resolveContourReviewScrollDelta(
      activeStructure.contours,
      frames,
      currentSlicePosition,
      direction
    );

    if (!reviewTarget) {
      setStatusMessage(`No contour slices to review for ${activeStructure.name}.`);
      return;
    }

    if (frames.length === 0) {
      setStatusMessage('Image slice metadata is unavailable for contour review navigation.');
      logClientDebug('StructurePanel', 'review:navigate:error missing sliceLocation');
      return;
    }

    if (reviewTarget.scrollDelta !== 0) {
      viewport.scroll(reviewTarget.scrollDelta);
    }
    viewport.render?.();
    setActiveViewport('AXIAL');
    setStatusMessage(
      `Reviewing ${activeStructure.name}: z=${reviewTarget.targetSlice.slicePosition.toFixed(1)} mm.`
    );
    logClientDebug(
      'StructurePanel',
      `review:navigate ${direction} structure=${activeStructure.id} z=${reviewTarget.targetSlice.slicePosition}`
    );
  };

  const handleQaIssueSelect = (qualityIssue: StructureSetQualityIssue) => {
    if (!activeSeriesStructureSet) return;

    setActiveStructureSet(activeSeriesStructureSet.id);
    if (qualityIssue.structureId) {
      setActiveStructure(qualityIssue.structureId);
    }

    if (!Number.isFinite(qualityIssue.issue.slicePosition)) {
      setStatusMessage(qualityIssue.issue.message);
      return;
    }

    const viewport = ViewportManager
      .getRenderingEngine()
      ?.getViewport(VIEWPORT_IDS.AXIAL) as AxialViewportLike | undefined;
    if (!viewport?.scroll) {
      setStatusMessage('Axial viewport is not ready for QA navigation.');
      logClientDebug('StructurePanel', 'qa:navigate:error axial viewport unavailable');
      return;
    }

    const frames = activeLoadedSeries?.series.instances
      .map((instance, index) => ({
        index,
        sliceLocation: instance.sliceLocation,
      }))
      .filter((frame): frame is { index: number; sliceLocation: number } =>
        Number.isFinite(frame.sliceLocation)
      ) ?? [];
    if (frames.length === 0) {
      setStatusMessage('Image slice metadata is unavailable for QA navigation.');
      logClientDebug('StructurePanel', 'qa:navigate:error missing sliceLocation');
      return;
    }

    const currentSlicePosition = viewport.getCamera?.().focalPoint?.[2]
      ?? qualityIssue.issue.slicePosition
      ?? 0;
    const scrollDelta = resolveScrollDeltaToSlice(
      frames,
      currentSlicePosition,
      qualityIssue.issue.slicePosition!
    );
    if (scrollDelta !== 0) {
      viewport.scroll(scrollDelta);
    }
    viewport.render?.();
    setActiveViewport('AXIAL');
    setStatusMessage(qualityIssue.issue.message);
    logClientDebug(
      'StructurePanel',
      `qa:navigate structure=${qualityIssue.structureId ?? 'rtss'} z=${qualityIssue.issue.slicePosition}`
    );
  };

  useEffect(() => {
    const handleReviewKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      if (activeStructureReviewSlices.length === 0) return;

      if (event.key === '[') {
        event.preventDefault();
        handleReviewNavigate('previous');
      } else if (event.key === ']') {
        event.preventDefault();
        handleReviewNavigate('next');
      }
    };

    window.addEventListener('keydown', handleReviewKeyDown);
    return () => window.removeEventListener('keydown', handleReviewKeyDown);
  }, [activeStructureReviewSlices.length, handleReviewNavigate]);

  const structureGroups = activeSeriesStructureSet
    ? [
        {
          id: 'targets',
          label: 'Targets',
          structures: activeSeriesStructureSet.structures.filter((structure) =>
            ['GTV', 'CTV', 'PTV'].includes(structure.type)
          ),
        },
        {
          id: 'oars',
          label: 'Organs at Risk',
          structures: activeSeriesStructureSet.structures.filter((structure) =>
            structure.type === 'OAR' || structure.type === 'AVOIDANCE'
          ),
        },
        {
          id: 'external',
          label: 'External / Support',
          structures: activeSeriesStructureSet.structures.filter((structure) =>
            structure.type === 'EXTERNAL' || structure.type === 'SUPPORT'
          ),
        },
      ].filter((group) => group.structures.length > 0)
    : [];

  const tabButtonClass = (isActive: boolean) =>
    `h-8 border-b-2 px-3 text-[10px] font-semibold uppercase tracking-widest transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
      isActive
        ? 'border-blue-500 bg-[#202020] text-[#e5e5e5]'
        : 'border-transparent text-[#6b6b6b] hover:bg-[#242424] hover:text-[#a0a0a0]'
    }`;

  const disabledTabClass =
    'h-8 cursor-not-allowed border-b-2 border-transparent px-3 text-[10px] font-semibold uppercase tracking-widest text-[#404040]';

  return (
    <div className="flex h-full flex-col bg-[#1a1a1a]">
      <div className="flex flex-none border-b border-[#2a2a2a] bg-[#111]">
        <button
          type="button"
          className={tabButtonClass(panelTab === 'structures')}
          onClick={() => setPanelTab('structures')}
        >
          Structures
        </button>
        <button
          type="button"
          className={tabButtonClass(panelTab === 'qa')}
          onClick={() => setPanelTab('qa')}
        >
          QA
        </button>
        <button type="button" className={disabledTabClass} disabled title="Not implemented">
          AI
        </button>
        <button type="button" className={disabledTabClass} disabled title="Not implemented">
          History
        </button>
        <button
          type="button"
          className={tabButtonClass(panelTab === 'dicom')}
          onClick={() => setPanelTab('dicom')}
        >
          DICOM
        </button>
      </div>

      {statusMessage && (
        <div className="border-b border-[#2a2a2a] bg-[#242424] px-3 py-1 text-[10px] text-[#a0a0a0]">
          {statusMessage}
        </div>
      )}

      {isActiveSeriesDirty && (
        <div className="border-b border-[#2a2a2a] bg-[#2a2112] px-3 py-1 text-[10px] text-[#f59e0b]">
          Local draft pending auto-save.
        </div>
      )}

      {panelTab === 'structures' && (
        <>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            <div className="flex items-center gap-2 border-b border-[#2a2a2a] bg-[#171717] px-3 py-1.5">
              <span className="min-w-0 flex-1 truncate text-[10px] font-semibold uppercase tracking-widest text-[#6b6b6b]">
                Structure Set
              </span>
              <button
                onClick={handleAddClick}
                aria-label="Add structure"
                title={activeSeriesUID ? 'Add structure [N]' : 'Load a series first'}
                disabled={!activeSeriesUID}
                className="flex h-5 w-5 items-center justify-center bg-[#2e2e2e] text-[13px] font-semibold leading-none text-[#a0a0a0] transition-colors hover:bg-blue-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[#2e2e2e] disabled:hover:text-[#a0a0a0] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
              >
                +
              </button>
            </div>

            {isAdding && (
              <div className="border-b border-[#2a2a2a] bg-[#242424] px-2 py-1.5 flex-none">
                <input
                  ref={inputRef}
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. PTV, Brainstem…"
                  className="w-full border border-[#3a3a3a] bg-[#1a1a1a] px-2 py-1 text-[11px] text-[#e5e5e5] placeholder-[#6b6b6b] focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="mt-1.5 flex gap-1.5">
                  <button onClick={handleConfirmAdd} className="flex-1 py-0.5 text-[11px] text-blue-400 hover:text-blue-300">
                    Add
                  </button>
                  <button onClick={handleCancelAdd} className="flex-1 py-0.5 text-[11px] text-[#6b6b6b] hover:text-[#a0a0a0]">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {!activeSeriesUID ? (
              <p className="px-3 py-3 text-[11px] text-[#6b6b6b]">Load an image set to review structures.</p>
            ) : activeSeriesStructureSets.length === 0 ? (
              <p className="px-3 py-3 text-[11px] text-[#6b6b6b]">No structures for this image set. Click "+" to add one.</p>
            ) : (
              <>
                {activeSeriesStructureSets.map((ss) => {
                  const isActiveStructureSet = ss.id === activeStructureSetId;

                  return (
                    <div key={ss.id} className="border-b border-[#2a2a2a]">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveStructureSet(ss.id);
                          setActiveStructure(ss.structures[0]?.id ?? null);
                        }}
                        className={`flex w-full items-center gap-2 border-b border-[#2a2a2a] px-3 py-1.5 text-left text-[10px] uppercase tracking-widest focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
                          isActiveStructureSet
                            ? 'border-l-2 border-l-blue-500 bg-blue-950/30 text-blue-200'
                            : 'border-l-2 border-l-transparent bg-[#202020] text-[#6b6b6b] hover:bg-[#2e2e2e] hover:text-[#a0a0a0]'
                        }`}
                        title={`Activate structure set ${ss.label}`}
                        aria-label={`Activate structure set ${ss.label}`}
                      >
                        <span className="min-w-0 flex-1 truncate">{ss.label}</span>
                        <span className="text-[9px] text-[#6b6b6b]">{ss.structures.length}</span>
                        {isActiveStructureSet ? (
                          <span className="bg-blue-900 px-1.5 py-0.5 text-[9px] font-semibold tracking-widest text-blue-200">
                            ACTIVE
                          </span>
                        ) : null}
                      </button>

                      {isActiveStructureSet ? (
                        ss.structures.length === 0 ? (
                          <p className="px-3 py-3 text-[11px] text-[#6b6b6b]">No structures in this set</p>
                        ) : (
                          structureGroups.map((group) => (
                            <section key={group.id}>
                              <div className="flex h-6 items-center border-b border-[#2a2a2a] bg-[#171717] px-3 text-[10px] font-semibold uppercase tracking-widest text-[#6b6b6b]">
                                <span className="min-w-0 flex-1 truncate">{group.label}</span>
                                <span>{group.structures.length}</span>
                              </div>
                              {group.structures.map((structure) => (
                                <StructureRow
                                  key={structure.id}
                                  structure={structure}
                                  setId={ss.id}
                                  isActive={structure.id === activeStructureId}
                                  contourSliceCount={getReviewSlices(structure.contours).length}
                                  onSelect={() => {
                                    setActiveStructureSet(ss.id);
                                    setActiveStructure(structure.id);
                                  }}
                                  onStatus={setStatusMessage}
                                />
                              ))}
                            </section>
                          ))
                        )
                      ) : null}
                    </div>
                  );
                })}
              </>
            )}
          </div>

          {activeSeriesStructureSet && activeStructure && (
            <section className="flex-none border-t border-[#2a2a2a] bg-[#171717]">
              <div className="flex items-center gap-2 border-b border-[#2a2a2a] px-3 py-1.5">
                <input
                  id="active-structure-color"
                  aria-label="Active structure color"
                  type="color"
                  value={rgbToHex(activeStructure.color)}
                  onChange={handleActiveStructureColorChange}
                  className="h-5 w-5 flex-none cursor-pointer border border-[#3a3a3a] bg-[#2e2e2e] p-0"
                />
                <p className="min-w-0 flex-1 truncate text-[12px] font-semibold text-[#e5e5e5]" title={activeStructure.name}>
                  {activeStructure.name}
                </p>
                <span
                  className={`flex-none border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest ${
                    activeStructure.isLocked
                      ? 'border-[#854d0e] bg-[#2a2112] text-[#f59e0b]'
                      : 'border-[#14532d] bg-[#12301f] text-[#22c55e]'
                  }`}
                  title={activeStructure.isLocked ? 'Structure is locked and cannot be contoured' : 'Structure is editable'}
                >
                  {activeStructure.isLocked ? 'Locked' : 'Editable'}
                </span>
                <span
                  className={`flex-none border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest ${
                    isActiveSeriesRepositoryDirty
                      ? 'border-[#854d0e] bg-[#2a2112] text-[#f59e0b]'
                      : 'border-[#2a2a2a] bg-[#111] text-[#6b6b6b]'
                  }`}
                >
                  {isActiveSeriesRepositoryDirty ? 'Unsynced' : 'Synced'}
                </span>
              </div>
              <div className="flex items-center gap-1.5 border-b border-[#2a2a2a] px-3 py-2 text-[10px]">
                <select
                  id="active-structure-type"
                  aria-label="Active structure type"
                  value={activeStructure.type}
                  onChange={handleActiveStructureTypeChange}
                  title="Structure type"
                  className="h-6 w-24 border border-[#3a3a3a] bg-[#2e2e2e] px-1 text-[11px] font-semibold text-[#e5e5e5] focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {STRUCTURE_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </select>
                <span className="border border-[#2a2a2a] bg-[#111] px-2 py-1 font-mono text-[#e5e5e5]" title="Structure volume">
                  {formatVolumeCc(activeStructure.volume_cc)}
                </span>
                <span className="border border-[#2a2a2a] bg-[#111] px-2 py-1 font-mono text-[#a0a0a0]" title="Contour slices">
                  {activeStructureReviewSlices.length === 1 ? '1 slice' : `${activeStructureReviewSlices.length} slices`}
                </span>
              </div>
              <div className="flex gap-1 border-t border-[#2a2a2a] px-3 py-2">
                {['Margin', 'Interpolate', 'Boolean'].map((label) => (
                  <button
                    key={label}
                    type="button"
                    disabled
                    title="Not implemented"
                    className="h-6 flex-1 cursor-not-allowed border border-[#2a2a2a] bg-[#202020] text-[10px] text-[#404040]"
                  >
                    {label}
                  </button>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {panelTab === 'qa' && (
        <div className="flex-1 overflow-y-auto">
          <section className="border-b border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6b6b6b]">RTSS QA</p>
              <span
                className={`border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest ${
                  activeStructureSetWarningCount > 0
                    ? 'border-[#854d0e] bg-[#2a2112] text-[#f59e0b]'
                    : 'border-[#14532d] bg-[#12301f] text-[#22c55e]'
                }`}
              >
                {activeStructureSetWarningCount > 0
                  ? `${activeStructureSetWarningCount} warning${activeStructureSetWarningCount === 1 ? '' : 's'}`
                  : 'OK'}
              </span>
            </div>
            {activeSeriesStructureSet && activeStructureSetQaIssues.length > 0 ? (
              <div className="border border-[#2a2a2a] bg-[#171717]">
                {activeStructureSetQaIssues.map((qualityIssue, index) => (
                  <button
                    key={`${qualityIssue.structureId}-${qualityIssue.issue.type}-${qualityIssue.issue.slicePosition ?? 'structure'}-${index}`}
                    type="button"
                    onClick={() => handleQaIssueSelect(qualityIssue)}
                    className={`flex w-full items-start gap-1.5 border-b border-[#2a2a2a] px-2 py-1 text-left text-[10px] last:border-b-0 hover:bg-[#2e2e2e] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
                      qualityIssue.issue.severity === 'warning' ? 'text-[#f59e0b]' : 'text-[#6b6b6b]'
                    }`}
                    title={Number.isFinite(qualityIssue.issue.slicePosition) ? `Jump to z=${qualityIssue.issue.slicePosition!.toFixed(1)} mm` : 'Select RTSS QA item'}
                    aria-label={`${qualityIssue.structureName ?? 'RTSS'} ${qualityIssue.issue.message}`}
                  >
                    {qualityIssue.structureName && (
                      <span className="max-w-[64px] flex-none truncate font-semibold text-[#a0a0a0]">
                        {qualityIssue.structureName}
                      </span>
                    )}
                    <span className="min-w-0 flex-1">{qualityIssue.issue.message}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-[#6b6b6b]">
                {activeSeriesStructureSet ? 'No RTSS QA warnings for this structure set.' : 'No active structure set.'}
              </p>
            )}
          </section>

          <section className="border-b border-[#2a2a2a] bg-[#1a1a1a] px-3 py-2">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6b6b6b]">Contour QA</p>
              <span
                className={`border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-widest ${
                  (activeStructureQa?.warningCount ?? 0) > 0
                    ? 'border-[#854d0e] bg-[#2a2112] text-[#f59e0b]'
                    : 'border-[#14532d] bg-[#12301f] text-[#22c55e]'
                }`}
              >
                {(activeStructureQa?.warningCount ?? 0) > 0
                  ? `${activeStructureQa?.warningCount} warning${activeStructureQa?.warningCount === 1 ? '' : 's'}`
                  : 'OK'}
              </span>
            </div>
            {activeStructureQa && activeStructureQa.issues.length > 0 ? (
              <ul className="space-y-0.5">
                {activeStructureQa.issues.map((issue, index) => (
                  <li
                    key={`${issue.type}-${issue.slicePosition ?? 'structure'}-${index}`}
                    className={issue.severity === 'warning' ? 'text-[10px] text-[#f59e0b]' : 'text-[10px] text-[#6b6b6b]'}
                  >
                    {issue.message}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[10px] text-[#6b6b6b]">
                {activeStructure ? 'No contour QA warnings for this structure.' : 'No active structure.'}
              </p>
            )}
          </section>
        </div>
      )}

      {panelTab === 'dicom' && (
        <div className="flex-1 overflow-y-auto px-3 py-2 text-[10px]">
          <section className="border border-[#2a2a2a] bg-[#171717]">
            {[
              ['Structure Set', activeSeriesStructureSet?.label ?? 'n/a'],
              ['Source', activeSeriesStructureSet ? formatSourceLabel(activeSeriesStructureSet) : 'n/a'],
              ['Kind', activeSeriesStructureSet?.source?.type === 'rtstruct' ? 'RTSS' : 'SET'],
              ['SOP', activeSeriesStructureSet?.source?.sopInstanceUID ? `…${formatSopTail(activeSeriesStructureSet.source.sopInstanceUID)}` : 'n/a'],
              ['Imported', activeSeriesStructureSet?.source?.importedAt ? formatSourceTimestamp(activeSeriesStructureSet.source.importedAt) : 'n/a'],
              ['Series UID', activeSeriesUID ?? 'n/a'],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-[72px_1fr] border-b border-[#2a2a2a] last:border-b-0">
                <div className="bg-[#202020] px-2 py-1 font-semibold uppercase tracking-widest text-[#6b6b6b]">{label}</div>
                <div className="min-w-0 truncate px-2 py-1 font-mono text-[#a0a0a0]" title={value}>{value}</div>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
