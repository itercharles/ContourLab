import { useState, useRef, useEffect, useMemo } from 'react';
import { useStructureStore } from '../../core/store/structureStore';
import { useVolumeStore } from '../../core/store/volumeStore';
import { useUIStore } from '../../core/store/uiStore';
import { StructureSetManager } from '../../core/structures/StructureSetManager';
import type { Structure, StructureSet, StructureType } from '@webtps/shared-types';
import {
  loadStructureDraftForSeries,
  saveStructureDraftForSeries,
} from '../../core/structures/structureDraftStore';
import { UndoRedoManager } from '../../core/contouring/UndoRedoManager';
import { replaceStructureSetsForSeries } from '../../core/structures/structurePersistence';
import {
  getReviewSlices,
  resolveContourReviewScrollDelta,
  resolveScrollDeltaToSlice,
  type ContourReviewDirection,
} from '../../core/structures/contourReview';
import {
  analyzeContourQuality,
  type ContourQualityIssue,
} from '../../core/structures/contourQuality';
import {
  analyzeRtssQuality,
  type RtssQualityIssue,
} from '../../core/structures/rtssQuality';
import { findRtstructHistoryGroup } from '../../core/dicom/rtstructHistory';
import { useRtstructHistoryStore } from '../../core/store/rtstructHistoryStore';
import { ContourEngine } from '../../core/contouring/ContourEngine';
import { computeBooleanContoursForStructure, type BooleanOperation } from '../../core/contouring/BooleanContourEngine';
import { interpolateMissingContoursForFrames } from '../../core/contouring/InterpolationEngine';
import { computeMarginContoursForStructure } from '../../core/contouring/MarginContourEngine';
import { ViewportManager } from '../../core/rendering/ViewportManager';
import { VIEWPORT_IDS } from '../../core/rendering/MPRController';
import { logClientDebug } from '../../core/debug/clientDebugLog';
import { QA_RULE_DEFINITIONS, getQaRuleConfig } from '../../core/qa/qaRuleConfig';

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

function cloneStructure(structure: Structure): Structure {
  return {
    ...structure,
    color: [...structure.color] as [number, number, number],
    contours: structure.contours.map((contour) => ({
      ...contour,
      points: new Float32Array(contour.points),
    })),
  };
}

function clonePatchValue<T>(value: T): T {
  if (value instanceof Float32Array) return new Float32Array(value) as T;
  if (Array.isArray(value)) return [...value] as T;
  return value;
}

function pushStructurePatchCommand(
  setId: string,
  structure: Structure,
  patch: Partial<Structure>,
  description: string
): void {
  const previousPatch = Object.fromEntries(
    Object.keys(patch).map((key) => [
      key,
      clonePatchValue(structure[key as keyof Structure]),
    ])
  ) as Partial<Structure>;
  const store = useStructureStore.getState();

  UndoRedoManager.push({
    description,
    execute: () => store.updateStructure(setId, structure.id, patch),
    undo: () => store.updateStructure(setId, structure.id, previousPatch),
  });
}

function pushStructureDeleteCommand(setId: string, structure: Structure): void {
  const snapshot = cloneStructure(structure);
  const store = useStructureStore.getState();

  UndoRedoManager.push({
    description: `Delete structure ${structure.name}`,
    execute: () => store.deleteStructure(setId, structure.id),
    undo: () => {
      store.addStructure(setId, cloneStructure(snapshot));
      store.setActiveStructure(snapshot.id);
    },
  });
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

function formatDicomDateTime(date: string, time: string): string {
  const datePart = date.length === 8 ? `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}` : 'unknown date';
  const timePart = time.length >= 6
    ? `${time.slice(0, 2)}:${time.slice(2, 4)}:${time.slice(4, 6)}`
    : 'unknown time';

  return `${datePart} ${timePart}`;
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

type PanelTab = 'structures' | 'qa' | 'history' | 'dicom';
type QaChecklistEntry = {
  id: string;
  label: string;
  description: string;
  issueCount: number;
  severity: 'info' | 'warning';
};

interface StructureRowProps {
  structure: Structure;
  setId: string;
  isActive: boolean;
  onSelect: () => void;
  onStatus: (message: string) => void;
}

function StructureRow({
  structure,
  setId,
  isActive,
  onSelect,
  onStatus,
}: StructureRowProps) {
  const [isRenaming, setIsRenaming] = useState(false);
  const [draftName, setDraftName] = useState(structure.name);

  const [r, g, b] = structure.color;
  const colorStyle = `rgb(${r}, ${g}, ${b})`;

  const handleVisibilityToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    pushStructurePatchCommand(
      setId,
      structure,
      { isVisible: !(structure.isVisible ?? true) },
      `${structure.isVisible ?? true ? 'Hide' : 'Show'} structure ${structure.name}`
    );
  };

  const handleLockToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    pushStructurePatchCommand(
      setId,
      structure,
      { isLocked: !(structure.isLocked ?? false) },
      `${structure.isLocked ?? false ? 'Unlock' : 'Lock'} structure ${structure.name}`
    );
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    pushStructureDeleteCommand(setId, structure);
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
      UndoRedoManager.push({
        description: `Rename structure ${structure.name}`,
        execute: () => StructureSetManager.renameStructure(setId, structure.id, nextName),
        undo: () => StructureSetManager.renameStructure(setId, structure.id, structure.name),
      });
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

  const isVisible = structure.isVisible ?? true;
  const isLocked = structure.isLocked ?? false;

  return (
    <div
      onClick={onSelect}
      className={`
        h-7 flex items-center gap-1.5 px-2 cursor-pointer group border-b border-[var(--color-border)] transition-colors
        ${isActive
          ? 'bg-[rgba(59,130,246,0.1)] border-l-2 border-l-[#3b82f6]'
          : 'border-l-2 border-l-transparent hover:bg-[var(--color-hover)]'
        }
      `}
    >
      {/* Visibility toggle — leftmost per design */}
      <button
        onClick={handleVisibilityToggle}
        aria-label={isVisible ? `Hide ${structure.name}` : `Show ${structure.name}`}
        title={isVisible ? 'Hide' : 'Show'}
        className={`flex-none flex h-4 w-4 items-center justify-center transition-opacity hover:text-[var(--color-text-bright)] ${
          isVisible ? 'text-[var(--color-text-muted)]' : 'text-[var(--color-text-dim)]'
        }`}
      >
        {isVisible ? (
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

      {/* Color swatch */}
      <span
        className="h-2.5 w-2.5 flex-none rounded-sm shadow-[inset_0_0_0_1px_rgba(0,0,0,0.25)]"
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
          className="min-w-0 flex-1 rounded border border-blue-500 bg-[var(--color-surface-alt)] px-1 py-0.5 text-[12px] text-[var(--color-text-bright)] focus:outline-none"
        />
      ) : (
        <span
          onDoubleClick={beginRename}
          title="Double-click to rename"
          className={`min-w-0 flex-1 truncate text-[13px] font-medium transition-colors ${
            isVisible ? 'text-[var(--color-text-bright)]' : 'text-[var(--color-text-muted)]'
          }`}
        >
          {structure.name}
        </span>
      )}

      <span className="w-[46px] flex-none text-right font-mono text-[11px] text-[var(--color-text-sec)]" title="Volume">
        {formatVolumeCc(structure.volume_cc)}
      </span>

      {/* Lock — always visible so editability is readable without hover. */}
      <button
        onClick={handleLockToggle}
        aria-label={isLocked ? `Unlock ${structure.name}` : `Lock ${structure.name}`}
        title={isLocked ? 'Unlock' : 'Lock'}
        className={`flex-none flex h-4 w-4 items-center justify-center transition-opacity hover:text-[var(--color-text-bright)] ${
          isLocked ? 'text-[#f59e0b]' : 'text-[var(--color-text-muted)]'
        }`}
      >
        {isLocked ? (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        ) : (
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 9.9-1" />
          </svg>
        )}
      </button>

      {/* Delete — hover only */}
      <button
        onClick={handleDelete}
        aria-label={`Delete ${structure.name}`}
        title="Delete structure"
        className="flex-none flex h-4 w-4 items-center justify-center text-[var(--color-text-dim)] opacity-0 transition-opacity hover:text-red-400 group-hover:opacity-100"
      >
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="3 6 5 6 21 6" />
          <path d="M19 6l-1 14H6L5 6" />
          <path d="M10 11v6M14 11v6" />
          <path d="M9 6V4h6v2" />
        </svg>
      </button>
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
  const dirtySeriesUIDs = useStructureStore((s) => s.dirtySeriesUIDs);
  const repositoryDirtySeriesUIDs = useStructureStore((s) => s.repositoryDirtySeriesUIDs);
  const markSeriesClean = useStructureStore((s) => s.markSeriesClean);
  const activeSeriesUID = useVolumeStore((s) => s.activeSeriesUID);
  const loadedSeries = useVolumeStore((s) => s.loadedSeries);
  const setActiveViewport = useUIStore((s) => s.setActiveViewport);
  const activeStructureOperationPanel = useUIStore((s) => s.activeStructureOperationPanel);
  const setActiveStructureOperationPanel = useUIStore((s) => s.setActiveStructureOperationPanel);
  const rtstructHistoryInstances = useRtstructHistoryStore((s) => s.instances);
  const loadRtstructVersion = useRtstructHistoryStore((s) => s.loadRtstructVersion);

  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newStructureType, setNewStructureType] = useState<StructureType>('PTV');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>('structures');
  const [axialRevision, setAxialRevision] = useState(0);
  const [isEditingActiveType, setIsEditingActiveType] = useState(false);
  const [marginValue, setMarginValue] = useState(5);
  const [interpMethod, setInterpMethod] = useState<'linear' | 'shape' | 'morph'>('linear');
  const [interpGaps, setInterpGaps] = useState(3);
  const [boolOp, setBoolOp] = useState<'union' | 'intersect' | 'subtract'>('subtract');
  const [boolTarget, setBoolTarget] = useState('');
  const [contourQaSeverityFilter, setContourQaSeverityFilter] = useState<'warnings' | 'all'>('warnings');
  const [expandedContourQaRules, setExpandedContourQaRules] = useState<string[]>([]);
  const [expandedRtssQaRules, setExpandedRtssQaRules] = useState<string[]>([]);
  const [qaVisibleCountByRule, setQaVisibleCountByRule] = useState<Record<string, number>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const attemptedAutoLoadSeriesRef = useRef(new Set<string>());
  const draftSaveTimerRef = useRef<number | null>(null);
  const isActiveSeriesDirty = !!activeSeriesUID && dirtySeriesUIDs.includes(activeSeriesUID);
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
  const seriesHasStructureSet =
    !!activeSeriesUID && structureSets.some((ss) => ss.referencedSeriesUID === activeSeriesUID);
  const activeStructure = activeSeriesStructureSet?.structures.find(
    (structure) => structure.id === activeStructureId
  );
  const activeLoadedSeries = activeSeriesUID
    ? loadedSeries.find((series) => series.seriesUID === activeSeriesUID)
    : undefined;
  const activeRtstructHistoryGroup = activeSeriesStructureSet?.source?.type === 'rtstruct'
    ? findRtstructHistoryGroup(
        rtstructHistoryInstances.filter((instance) => (
          activeSeriesUID
            ? (
                instance.referencedSeriesInstanceUIDs.length > 0
                  ? instance.referencedSeriesInstanceUIDs.includes(activeSeriesUID)
                  : true
              )
            : true
        )),
        activeSeriesStructureSet.source.sopInstanceUID
      )
    : null;
  const hasRecordedRtstructHistory =
    Boolean(activeRtstructHistoryGroup && (
      activeRtstructHistoryGroup.versions.length > 1 ||
      activeRtstructHistoryGroup.hasMissingPredecessor
    ));
  const activeStructureReviewSlices = activeStructure
    ? getReviewSlices(activeStructure.contours)
    : [];
  const activePop = activeStructureOperationPanel;
  const qaRuleConfig = getQaRuleConfig();
  const activeStructureQa = activeStructure
    ? analyzeContourQuality(activeStructure, activeLoadedSeries
      ? {
          sliceSpacingMm: activeLoadedSeries.volume.spacing[2] ?? 1,
          imageBounds: {
            minX: activeLoadedSeries.volume.origin[0] - activeLoadedSeries.volume.spacing[0] / 2,
            maxX:
              activeLoadedSeries.volume.origin[0] +
              activeLoadedSeries.volume.spacing[0] * (activeLoadedSeries.volume.dimensions[0] - 0.5),
            minY: activeLoadedSeries.volume.origin[1] - activeLoadedSeries.volume.spacing[1] / 2,
            maxY:
              activeLoadedSeries.volume.origin[1] +
              activeLoadedSeries.volume.spacing[1] * (activeLoadedSeries.volume.dimensions[1] - 0.5),
          },
          enabledRules: qaRuleConfig,
        }
      : { sliceSpacingMm: 1, enabledRules: qaRuleConfig })
    : null;
  const activeStructureSetQa = activeSeriesStructureSet
    ? analyzeRtssQuality(activeSeriesStructureSet, {
        activeSeriesUID,
        imageSopInstanceUIDs: activeLoadedSeries?.series.instances.map((instance) => instance.sopInstanceUID),
        enabledRules: qaRuleConfig,
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
  const filteredContourQaIssues = activeStructureQa
    ? activeStructureQa.issues.filter((issue) =>
        contourQaSeverityFilter === 'all' ? true : issue.severity === 'warning'
      )
    : [];
  const contourQaIssuesByRule = useMemo(
    () =>
      filteredContourQaIssues.reduce<Record<string, ContourQualityIssue[]>>((grouped, issue) => {
        grouped[issue.type] = [...(grouped[issue.type] ?? []), issue];
        return grouped;
      }, {}),
    [filteredContourQaIssues]
  );
  const rtssQaIssuesByRule = useMemo(
    () =>
      activeStructureSetQaIssues.reduce<Record<string, StructureSetQualityIssue[]>>((grouped, qualityIssue) => {
        grouped[qualityIssue.issue.type] = [...(grouped[qualityIssue.issue.type] ?? []), qualityIssue];
        return grouped;
      }, {}),
    [activeStructureSetQaIssues]
  );
  const contourQaChecklist: QaChecklistEntry[] = QA_RULE_DEFINITIONS
    .filter((rule) => rule.section === 'contour' && qaRuleConfig[rule.id] !== false)
    .map((rule) => ({
      id: rule.id,
      label: rule.label,
      description: rule.description,
      severity: rule.severity,
      issueCount: contourQaIssuesByRule[rule.id]?.length ?? 0,
    }))
    .sort((a, b) => {
      const aHasIssues = a.issueCount > 0 ? 0 : 1;
      const bHasIssues = b.issueCount > 0 ? 0 : 1;
      return aHasIssues - bHasIssues;
    });
  const rtssQaChecklist: QaChecklistEntry[] = QA_RULE_DEFINITIONS
    .filter((rule) => rule.section === 'rtss' && qaRuleConfig[rule.id] !== false)
    .map((rule) => ({
      id: rule.id,
      label: rule.label,
      description: rule.description,
      severity: rule.severity,
      issueCount: activeStructureSetQa?.issues.filter((issue) => issue.type === rule.id).length ?? 0,
    }))
    .sort((a, b) => {
      const aHasIssues = a.issueCount > 0 ? 0 : 1;
      const bHasIssues = b.issueCount > 0 ? 0 : 1;
      return aHasIssues - bHasIssues;
    });
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
    if (!activeSeriesStructureSet || !activeStructure) {
      setActiveStructureOperationPanel(null);
    }
  }, [activeSeriesStructureSet, activeStructure, setActiveStructureOperationPanel]);

  useEffect(() => {
    setExpandedContourQaRules([]);
    setExpandedRtssQaRules([]);
    setQaVisibleCountByRule({});
  }, [
    activeStructure?.id,
    activeSeriesStructureSet?.id,
    contourQaSeverityFilter,
    activeStructureQa?.issueCount,
    activeStructureSetQa?.issueCount,
  ]);

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

  const handleAddClick = (type: StructureType) => {
    if (!activeSeriesUID) return;
    setNewStructureType(type);
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
      StructureSetManager.createStructure(setId, name, newStructureType);
      setIsAdding(false);
      setNewName('');
      setStatusMessage(`Added ${newStructureType} structure ${name}.`);
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

    pushStructurePatchCommand(
      activeSeriesStructureSet.id,
      activeStructure,
      { color: hexToRgb(event.target.value) },
      `Change ${activeStructure.name} color`
    );
    setStatusMessage(`Updated ${activeStructure.name} color.`);
  };

  const handleActiveStructureTypeChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    if (!activeSeriesStructureSet || !activeStructure) return;

    const nextType = event.target.value as StructureType;
    pushStructurePatchCommand(
      activeSeriesStructureSet.id,
      activeStructure,
      { type: nextType },
      `Change ${activeStructure.name} type`
    );
    setIsEditingActiveType(false);
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

  const handleInterpolateApply = () => {
    if (!activeSeriesStructureSet || !activeStructure || !activeLoadedSeries) {
      setStatusMessage('Load an image set and select a structure before interpolating.');
      setActiveStructureOperationPanel(null);
      return;
    }

    const frames = activeLoadedSeries.series.instances
      .map((instance) => ({
        sopInstanceUID: instance.sopInstanceUID,
        sliceLocation: instance.sliceLocation,
      }))
      .filter((frame): frame is { sopInstanceUID: string; sliceLocation: number } =>
        Number.isFinite(frame.sliceLocation)
      );

    if (frames.length < 3) {
      setStatusMessage('Image slice metadata is unavailable for interpolation.');
      setActiveStructureOperationPanel(null);
      return;
    }

    const interpolatedContours = interpolateMissingContoursForFrames(
      activeStructure.contours,
      frames,
      64,
      interpGaps
    );

    if (interpolatedContours.length === 0) {
      setStatusMessage('No missing contour slices were eligible for interpolation.');
      setActiveStructureOperationPanel(null);
      return;
    }

    const applied = ContourEngine.addContours(
      activeSeriesStructureSet.id,
      activeStructure.id,
      interpolatedContours,
      `Interpolate ${interpolatedContours.length} contour${interpolatedContours.length === 1 ? '' : 's'}`
    );

    setStatusMessage(
      applied
        ? `Interpolated ${interpolatedContours.length} contour slice${interpolatedContours.length === 1 ? '' : 's'}.`
        : 'Unable to interpolate the selected structure.'
    );
    setActiveStructureOperationPanel(null);
  };

  const handleBooleanApply = () => {
    if (!activeSeriesStructureSet || !activeStructure || !activeLoadedSeries) {
      setStatusMessage('Load an image set and select a structure before running boolean operations.');
      setActiveStructureOperationPanel(null);
      return;
    }

    const targetStructure = activeSeriesStructureSet.structures.find((structure) => structure.id === boolTarget);
    if (!targetStructure) {
      setStatusMessage('Select a target structure for the boolean operation.');
      setActiveStructureOperationPanel(null);
      return;
    }

    const frames = activeLoadedSeries.series.instances
      .map((instance) => ({
        sopInstanceUID: instance.sopInstanceUID,
        sliceLocation: instance.sliceLocation,
      }))
      .filter((frame): frame is { sopInstanceUID: string; sliceLocation: number } =>
        Number.isFinite(frame.sliceLocation)
      );

    if (frames.length === 0) {
      setStatusMessage('Image slice metadata is unavailable for boolean operations.');
      setActiveStructureOperationPanel(null);
      return;
    }

    const nextContours = computeBooleanContoursForStructure(
      activeStructure.contours,
      targetStructure.contours,
      frames,
      activeLoadedSeries.volume,
      boolOp as BooleanOperation
    );

    const applied = ContourEngine.replaceContours(
      activeSeriesStructureSet.id,
      activeStructure.id,
      nextContours,
      `Boolean ${boolOp} with ${targetStructure.name}`
    );

    setStatusMessage(
      applied
        ? `${boolOp === 'union' ? 'Merged' : boolOp === 'intersect' ? 'Intersected' : 'Subtracted'} ${targetStructure.name}.`
        : 'Unable to apply the boolean operation.'
    );
    setActiveStructureOperationPanel(null);
  };

  const handleMarginApply = () => {
    if (!activeSeriesStructureSet || !activeStructure || !activeLoadedSeries) {
      setStatusMessage('Load an image set and select a structure before applying a margin.');
      setActiveStructureOperationPanel(null);
      return;
    }

    const frames = activeLoadedSeries.series.instances
      .map((instance) => ({
        sopInstanceUID: instance.sopInstanceUID,
        sliceLocation: instance.sliceLocation,
      }))
      .filter((frame): frame is { sopInstanceUID: string; sliceLocation: number } =>
        Number.isFinite(frame.sliceLocation)
      );

    if (frames.length === 0) {
      setStatusMessage('Image slice metadata is unavailable for margin operations.');
      setActiveStructureOperationPanel(null);
      return;
    }

    const nextContours = computeMarginContoursForStructure(
      activeStructure.contours,
      frames,
      activeLoadedSeries.volume,
      marginValue
    );

    const applied = ContourEngine.replaceContours(
      activeSeriesStructureSet.id,
      activeStructure.id,
      nextContours,
      `Margin ${marginValue > 0 ? '+' : ''}${marginValue} mm`
    );

    setStatusMessage(
      applied
        ? `Applied ${marginValue > 0 ? '+' : ''}${marginValue} mm margin.`
        : 'Unable to apply the margin.'
    );
    setActiveStructureOperationPanel(null);
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

  const handleContourQaIssueSelect = (issue: ContourQualityIssue) => {
    if (!activeSeriesStructureSet || !activeStructure) return;
    setActiveStructureSet(activeSeriesStructureSet.id);
    setActiveStructure(activeStructure.id);

    if (!Number.isFinite(issue.slicePosition)) {
      setStatusMessage(issue.message);
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

    const targetSlicePosition = issue.slicePosition as number;
    const currentSlicePosition = viewport.getCamera?.().focalPoint?.[2]
      ?? targetSlicePosition
      ?? 0;
    const scrollDelta = resolveScrollDeltaToSlice(
      frames,
      currentSlicePosition,
      targetSlicePosition
    );
    if (scrollDelta !== 0) {
      viewport.scroll(scrollDelta);
    }
    viewport.render?.();
    setActiveViewport('AXIAL');
    setStatusMessage(issue.message);
    logClientDebug(
      'StructurePanel',
      `qa:navigate structure=${activeStructure.id} z=${targetSlicePosition}`
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

  useEffect(() => {
    setActiveStructureOperationPanel(null);
  }, [activeStructureId]);

  const structureGroups = activeSeriesStructureSet
    ? [
        {
          id: 'targets',
          label: 'Targets',
          defaultType: 'PTV' as StructureType,
          structures: activeSeriesStructureSet.structures.filter((structure) =>
            ['GTV', 'CTV', 'PTV'].includes(structure.type)
          ),
        },
        {
          id: 'oars',
          label: 'Organs at Risk',
          defaultType: 'OAR' as StructureType,
          structures: activeSeriesStructureSet.structures.filter((structure) =>
            structure.type === 'OAR' || structure.type === 'AVOIDANCE'
          ),
        },
        {
          id: 'external',
          label: 'External / Support',
          defaultType: 'EXTERNAL' as StructureType,
          structures: activeSeriesStructureSet.structures.filter((structure) =>
            structure.type === 'EXTERNAL' || structure.type === 'SUPPORT'
          ),
        },
      ]
    : [];

  const tabButtonClass = (isActive: boolean) =>
    `h-8 border-b-2 px-3 text-[11px] font-semibold uppercase tracking-widest transition-colors focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
      isActive
        ? 'border-blue-500 bg-[var(--color-elevated)] text-[var(--color-text)]'
        : 'border-transparent text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-sec)]'
    }`;

  return (
    <div className="flex h-full flex-col bg-[var(--color-surface)]">
      <div className="flex flex-none border-b border-[var(--color-border)] bg-[var(--color-header)]">
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
        <button
          type="button"
          className={tabButtonClass(panelTab === 'history')}
          onClick={() => setPanelTab('history')}
        >
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
        <div className="border-b border-[var(--color-border)] bg-[var(--color-elevated)] px-3 py-1 text-[11px] text-[var(--color-text-sec)]">
          {statusMessage}
        </div>
      )}

      {isActiveSeriesDirty && (
        <div className="border-b border-[var(--color-border)] bg-[#2a2112] px-3 py-1 text-[11px] text-[#f59e0b]">
          Local draft pending auto-save.
        </div>
      )}

      {panelTab === 'structures' && (
        <>
          <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
            {isAdding && (
              <div className="border-b border-[var(--color-border)] bg-[var(--color-elevated)] px-2 py-1.5 flex-none">
                <input
                  ref={inputRef}
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="e.g. PTV, Brainstem…"
                  className="w-full border border-[var(--color-border-input)] bg-[var(--color-surface)] px-2 py-1 text-[12px] text-[var(--color-text)] placeholder-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="mt-1.5 flex gap-1.5">
                  <button onClick={handleConfirmAdd} className="flex-1 py-0.5 text-[12px] text-blue-400 hover:text-blue-300">
                    Add
                  </button>
                  <button onClick={handleCancelAdd} className="flex-1 py-0.5 text-[12px] text-[var(--color-text-muted)] hover:text-[var(--color-text-sec)]">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {!activeSeriesUID ? (
              <p className="px-3 py-3 text-[12px] text-[var(--color-text-muted)]">Load an image set to review structures.</p>
            ) : !activeSeriesStructureSet && seriesHasStructureSet ? (
              <p className="px-3 py-3 text-[12px] text-[var(--color-text-muted)]">No active structure set for this image set.</p>
            ) : !activeSeriesStructureSet ? (
              <div className="flex flex-col items-center gap-3 px-4 py-6">
                <p className="text-center text-[12px] text-[var(--color-text-muted)]">
                  No structures for this series yet.
                </p>
                <div className="flex gap-2">
                  {(['PTV', 'OAR', 'EXTERNAL'] as const).map((type) => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => handleAddClick(type)}
                      className="rounded border border-[var(--color-border)] bg-[var(--color-elevated)] px-3 py-1 text-[12px] text-[var(--color-text-sec)] hover:border-blue-500 hover:bg-blue-900/30 hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 transition-colors"
                    >
                      + {type}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              structureGroups.map((group) => (
                <section key={group.id}>
                  <div className="flex h-6 items-center border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                    <span className="min-w-0 flex-1 truncate">{group.label}</span>
                    <span>{group.structures.length}</span>
                    <button
                      type="button"
                      onClick={() => handleAddClick(group.defaultType)}
                      aria-label={`Add structure to ${group.label}`}
                      title={activeSeriesUID ? `Add ${group.defaultType} structure to ${group.label}` : 'Load a series first'}
                      disabled={!activeSeriesUID}
                      className="ml-2 flex h-5 w-5 items-center justify-center bg-[var(--color-hover)] text-[13px] font-semibold leading-none text-[var(--color-text-sec)] transition-colors hover:bg-blue-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-[var(--color-hover)] disabled:hover:text-[var(--color-text-sec)] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
                    >
                      +
                    </button>
                  </div>
                  {group.structures.map((structure) => (
                    <StructureRow
                      key={structure.id}
                      structure={structure}
                      setId={activeSeriesStructureSet.id}
                      isActive={structure.id === activeStructureId}
                      onSelect={() => {
                        setActiveStructureSet(activeSeriesStructureSet.id);
                        setActiveStructure(structure.id);
                      }}
                      onStatus={setStatusMessage}
                    />
                  ))}
                </section>
              ))
            )}
          </div>

          {activeSeriesStructureSet && activeStructure && (
            <section className="flex-none border-t border-[var(--color-border)] bg-[var(--color-surface)]">
              {/* a) Header: color swatch + name + type */}
              <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-3 py-1.5">
                <label className="flex-none cursor-pointer" title="Change structure color">
                  <span
                    className="block h-2.5 w-2.5 rounded-sm shadow-[inset_0_0_0_1px_rgba(0,0,0,0.3)]"
                    style={{ background: rgbToHex(activeStructure.color) }}
                  />
                  <input
                    id="active-structure-color"
                    aria-label="Active structure color"
                    type="color"
                    value={rgbToHex(activeStructure.color)}
                    onChange={handleActiveStructureColorChange}
                    className="sr-only"
                  />
                </label>
                <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-[var(--color-text-bright)]">
                  {activeStructure.name}
                </span>
                {isEditingActiveType ? (
                  <select
                    aria-label="Active structure type"
                    value={activeStructure.type}
                    onChange={handleActiveStructureTypeChange}
                    onBlur={() => setIsEditingActiveType(false)}
                    autoFocus
                    className="h-6 w-24 border border-[var(--color-border-input)] bg-[var(--color-hover)] px-1 text-[12px] font-semibold text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-blue-500"
                  >
                    {STRUCTURE_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="flex flex-none items-center gap-1">
                    <span className="text-[11px] uppercase tracking-widest text-[var(--color-text-muted)]">
                      {activeStructure.type}
                    </span>
                    <button
                      type="button"
                      aria-label="Edit active structure type"
                      title="Edit type"
                      onClick={() => setIsEditingActiveType(true)}
                      className="flex h-5 w-5 items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-bright)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <svg aria-hidden="true" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {/* b) Stats: volume + slices + Manual */}
              <div className="flex items-baseline gap-3.5 border-b border-[var(--color-border)] px-3 py-1.5 font-mono text-[12px] text-[var(--color-text-muted)]">
                <span>
                  <span className="text-[13px] text-[var(--color-text-bright)]">{(activeStructure.volume_cc ?? 0).toFixed(1)}</span>
                  {' '}cm³
                </span>
                <span>
                  <span className="text-[13px] text-[var(--color-text-bright)]">{activeStructureReviewSlices.length}</span>
                  {' '}sl
                </span>
                <span className="ml-auto text-[11px]">Manual</span>
              </div>

              {/* c) Operation buttons */}
              <div className="flex flex-wrap gap-1.5 border-b border-[var(--color-border)] px-3 py-2">
                {(['margin', 'interpolate', 'boolean'] as const).map((op) => (
                  <button
                    key={op}
                    type="button"
                    onClick={() => setActiveStructureOperationPanel(activePop === op ? null : op)}
                    className={`h-6 rounded border px-2 text-[11px] capitalize transition-colors ${
                      activePop === op
                        ? 'border-blue-500/50 bg-blue-900/30 text-blue-300'
                        : 'border-[var(--color-border)] bg-[var(--color-elevated)] text-[var(--color-text-sec)] hover:border-[var(--color-border-input)] hover:text-[var(--color-text-bright)]'
                    }`}
                  >
                    {op.charAt(0).toUpperCase() + op.slice(1)}
                  </button>
                ))}
                <button
                  type="button"
                  disabled
                  title="More operations (not yet implemented)"
                  className="h-6 cursor-not-allowed rounded border border-[var(--color-border)] bg-[var(--color-elevated)] px-1.5 text-[11px] text-[var(--color-text-dim)]"
                >
                  ⋯
                </button>
              </div>

              {/* d) Inline operation popover */}
              {activePop && (
                <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-alt)] px-3 py-2.5">
                  {activePop === 'margin' && (
                    <>
                      <p className="mb-2 text-[11px] uppercase tracking-widest text-[var(--color-text-muted)]">Expand / contract</p>
                      <div className="mb-2 flex items-center gap-2">
                        <input
                          type="range"
                          min={-10}
                          max={20}
                          step={0.5}
                          value={marginValue}
                          onChange={(e) => setMarginValue(parseFloat(e.target.value))}
                          className="flex-1 accent-blue-500"
                          aria-label="Margin value"
                        />
                        <span className="min-w-[52px] text-right font-mono text-[12px] text-[var(--color-text-bright)]">
                          {marginValue > 0 ? '+' : ''}{marginValue} mm
                        </span>
                      </div>
                      <div className="mb-2 flex gap-1">
                        {([-5, -2, 3, 5, 7, 10] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setMarginValue(m)}
                            className={`flex-1 rounded border py-0.5 text-[11px] transition-colors ${
                              marginValue === m
                                ? 'border-blue-500/50 bg-blue-900/30 text-blue-300'
                                : 'border-[var(--color-border)] bg-[var(--color-elevated)] text-[var(--color-text-sec)] hover:text-[var(--color-text-bright)]'
                            }`}
                          >
                            {m > 0 ? '+' : ''}{m}
                          </button>
                        ))}
                      </div>
                      <div className="mb-2.5 flex justify-between font-mono text-[12px] text-[var(--color-text-muted)]">
                        <span>{'→ '}{activeStructure.name}{marginValue !== 0 ? ` ${marginValue > 0 ? '+' : ''}${marginValue}mm` : ''}</span>
                        <span>{((activeStructure.volume_cc ?? 0) * Math.pow(1 + marginValue / 30, 3)).toFixed(1)} cm³</span>
                      </div>
                    </>
                  )}
                  {activePop === 'interpolate' && (
                    <>
                      <p className="mb-2 text-[11px] uppercase tracking-widest text-[var(--color-text-muted)]">Fill missing slices</p>
                      <div className="mb-2 flex gap-1">
                        {(['linear', 'shape', 'morph'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            onClick={() => setInterpMethod(m)}
                            className={`flex-1 rounded border py-0.5 text-[11px] capitalize transition-colors ${
                              interpMethod === m
                                ? 'border-blue-500/50 bg-blue-900/30 text-blue-300'
                                : 'border-[var(--color-border)] bg-[var(--color-elevated)] text-[var(--color-text-sec)] hover:text-[var(--color-text-bright)]'
                            }`}
                          >
                            {m}
                          </button>
                        ))}
                      </div>
                      <div className="mb-2 flex items-center gap-2">
                        <span className="text-[12px] text-[var(--color-text-muted)]">Max gap</span>
                        <input
                          type="range"
                          min={1}
                          max={10}
                          value={interpGaps}
                          onChange={(e) => setInterpGaps(parseInt(e.target.value))}
                          className="flex-1 accent-blue-500"
                          aria-label="Interpolation gap"
                        />
                        <span className="min-w-[36px] text-right font-mono text-[12px] text-[var(--color-text-bright)]">{interpGaps} sl</span>
                      </div>
                      <p className="mb-2.5 text-[12px] text-[var(--color-text-muted)]">
                        {activeStructureReviewSlices.length > 1
                          ? `${activeStructureReviewSlices.length} contour slices available.`
                          : 'No contour slices available.'}
                      </p>
                    </>
                  )}
                  {activePop === 'boolean' && (
                    <>
                      <p className="mb-2 text-[11px] uppercase tracking-widest text-[var(--color-text-muted)]">Combine with</p>
                      <div className="mb-2 flex gap-1">
                        {([['union', '∪'], ['intersect', '∩'], ['subtract', '−']] as const).map(([op, sym]) => (
                          <button
                            key={op}
                            type="button"
                            onClick={() => setBoolOp(op)}
                            className={`flex-1 rounded border py-0.5 text-[11px] capitalize transition-colors ${
                              boolOp === op
                                ? 'border-blue-500/50 bg-blue-900/30 text-blue-300'
                                : 'border-[var(--color-border)] bg-[var(--color-elevated)] text-[var(--color-text-sec)] hover:text-[var(--color-text-bright)]'
                            }`}
                          >
                            <span className="mr-1 font-mono">{sym}</span>{op}
                          </button>
                        ))}
                      </div>
                      <select
                        value={boolTarget}
                        onChange={(e) => setBoolTarget(e.target.value)}
                        aria-label="Boolean target structure"
                        className="mb-2 h-6 w-full border border-[var(--color-border-input)] bg-[var(--color-elevated)] px-1 text-[12px] text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="">— select structure —</option>
                        {activeSeriesStructureSet.structures
                          .filter((s) => s.id !== activeStructure.id)
                          .map((s) => (
                            <option key={s.id} value={s.id}>{s.name} ({s.type})</option>
                          ))}
                      </select>
                      <p className="mb-2.5 font-mono text-[12px] text-[var(--color-text-muted)]">
                        {'→ '}{activeStructure.name}{' '}{boolOp === 'union' ? '∪' : boolOp === 'intersect' ? '∩' : '−'}{' '}{activeSeriesStructureSet.structures.find((s) => s.id === boolTarget)?.name ?? '—'}
                      </p>
                    </>
                  )}
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      onClick={() => setActiveStructureOperationPanel(null)}
                      className="h-6 rounded border border-[var(--color-border)] bg-[var(--color-elevated)] px-2.5 text-[11px] text-[var(--color-text-sec)] hover:text-[var(--color-text-bright)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (activePop === 'margin') {
                          handleMarginApply();
                          return;
                        }
                        if (activePop === 'interpolate') {
                          handleInterpolateApply();
                          return;
                        }
                        if (activePop === 'boolean') {
                          handleBooleanApply();
                          return;
                        }
                      }}
                      className="h-6 rounded bg-blue-600 px-2.5 text-[11px] text-white hover:bg-blue-500"
                    >
                      Apply
                    </button>
                  </div>
                </div>
              )}

            </section>
          )}
        </>
      )}

      {panelTab === 'qa' && (
        <div className="flex-1 overflow-y-auto">
          <section className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">RTSS QA</p>
              <span
                className={`border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${
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
            {activeSeriesStructureSet ? (
              <div className="mb-1.5 border border-[var(--color-border)] bg-[var(--color-surface)]">
                {rtssQaChecklist.map((entry) => (
                  <div
                    key={entry.id}
                    className="border-b border-[var(--color-border)] last:border-b-0"
                  >
                    <button
                      type="button"
                      disabled={entry.issueCount === 0}
                      onClick={() => setExpandedRtssQaRules((current) =>
                        current.includes(entry.id)
                          ? current.filter((value) => value !== entry.id)
                          : [...current, entry.id]
                      )}
                      className={`grid w-full grid-cols-[12px_1fr_auto_auto] items-start gap-2 px-2 py-1 text-left text-[11px] ${
                        entry.issueCount > 0
                          ? 'hover:bg-[var(--color-hover)] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none'
                          : 'cursor-default'
                      }`}
                      title={entry.description}
                      aria-expanded={entry.issueCount > 0 ? expandedRtssQaRules.includes(entry.id) : undefined}
                      aria-label={entry.issueCount > 0 ? `${entry.label} ${entry.issueCount} hit` : `${entry.label} pass`}
                    >
                      <span
                        aria-hidden="true"
                        className={entry.issueCount > 0 ? 'text-[#f59e0b]' : 'text-[#22c55e]'}
                      >
                        {entry.issueCount > 0 ? '!' : '✓'}
                      </span>
                      <span className={entry.issueCount > 0 ? 'text-[var(--color-text)]' : 'text-[var(--color-text-sec)]'}>
                        {entry.label}
                      </span>
                      <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                        {entry.issueCount > 0 ? `${entry.issueCount} hit` : 'pass'}
                      </span>
                      <span className="w-3 text-[11px] text-[var(--color-text-muted)]">
                        {entry.issueCount > 0 ? (expandedRtssQaRules.includes(entry.id) ? '−' : '+') : ''}
                      </span>
                    </button>
                    {entry.issueCount > 0 && expandedRtssQaRules.includes(entry.id) ? (
                      <div className="border-t border-[var(--color-border)]">
                        {(rtssQaIssuesByRule[entry.id] ?? []).map((qualityIssue, index) => (
                          <button
                            key={`${qualityIssue.structureId}-${qualityIssue.issue.type}-${qualityIssue.issue.slicePosition ?? 'structure'}-${index}`}
                            type="button"
                            onClick={() => handleQaIssueSelect(qualityIssue)}
                            className={`flex w-full items-start gap-1.5 border-b border-[var(--color-border)] px-2 py-1 text-left text-[11px] last:border-b-0 hover:bg-[var(--color-hover)] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
                              qualityIssue.issue.severity === 'warning' ? 'text-[#f59e0b]' : 'text-[var(--color-text-muted)]'
                            }`}
                            title={Number.isFinite(qualityIssue.issue.slicePosition) ? `Jump to z=${qualityIssue.issue.slicePosition!.toFixed(1)} mm` : 'Select RTSS QA item'}
                            aria-label={`${qualityIssue.structureName ?? 'RTSS'} ${qualityIssue.issue.message}`}
                          >
                            {qualityIssue.structureName && (
                              <span className="max-w-[64px] flex-none truncate font-semibold text-[var(--color-text-sec)]">
                                {qualityIssue.structureName}
                              </span>
                            )}
                            <span className="min-w-0 flex-1">{qualityIssue.issue.message}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            {!(activeSeriesStructureSet && activeStructureSetQaIssues.length > 0) ? (
              <p className="text-[11px] text-[var(--color-text-muted)]">
                {activeSeriesStructureSet ? 'No RTSS QA warnings for this structure set.' : 'No active structure set.'}
              </p>
            ) : null}
          </section>

          <section className="border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Contour QA</p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setContourQaSeverityFilter('warnings')}
                  className={`border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${
                    contourQaSeverityFilter === 'warnings'
                      ? 'border-[#854d0e] bg-[#2a2112] text-[#f59e0b]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text-sec)]'
                  }`}
                >
                  Warnings
                </button>
                <button
                  type="button"
                  onClick={() => setContourQaSeverityFilter('all')}
                  className={`border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${
                    contourQaSeverityFilter === 'all'
                      ? 'border-[var(--color-border-input)] bg-[var(--color-elevated)] text-[var(--color-text)]'
                      : 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-muted)] hover:text-[var(--color-text-sec)]'
                  }`}
                >
                  All
                </button>
                <span
                  className={`border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-widest ${
                    (activeStructureQa?.warningCount ?? 0) > 0
                      ? 'border-[#854d0e] bg-[#2a2112] text-[#f59e0b]'
                      : 'border-[#14532d] bg-[#12301f] text-[#22c55e]'
                  }`}
                >
                  {contourQaChecklist.some((entry) => entry.issueCount > 0)
                    ? `${filteredContourQaIssues.length} issue${filteredContourQaIssues.length === 1 ? '' : 's'}`
                    : 'OK'}
                </span>
              </div>
            </div>
            {activeStructure ? (
              <div className="mb-1.5 border border-[var(--color-border)] bg-[var(--color-surface)]">
                {contourQaChecklist.map((entry) => (
                  <div
                    key={entry.id}
                    className="border-b border-[var(--color-border)] last:border-b-0"
                  >
                    <button
                      type="button"
                      disabled={entry.issueCount === 0}
                      onClick={() => setExpandedContourQaRules((current) =>
                        current.includes(entry.id)
                          ? current.filter((value) => value !== entry.id)
                          : [...current, entry.id]
                      )}
                      className={`grid w-full grid-cols-[12px_1fr_auto_auto] items-start gap-2 px-2 py-1 text-left text-[11px] ${
                        entry.issueCount > 0
                          ? 'hover:bg-[var(--color-hover)] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none'
                          : 'cursor-default'
                      }`}
                      title={entry.description}
                      aria-expanded={entry.issueCount > 0 ? expandedContourQaRules.includes(entry.id) : undefined}
                      aria-label={entry.issueCount > 0 ? `${entry.label} ${entry.issueCount} hit` : `${entry.label} pass`}
                    >
                      <span
                        aria-hidden="true"
                        className={entry.issueCount > 0 ? 'text-[#f59e0b]' : 'text-[#22c55e]'}
                      >
                        {entry.issueCount > 0 ? '!' : '✓'}
                      </span>
                      <span className={entry.issueCount > 0 ? 'text-[var(--color-text)]' : 'text-[var(--color-text-sec)]'}>
                        {entry.label}
                      </span>
                      <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                        {entry.issueCount > 0 ? `${entry.issueCount} hit` : 'pass'}
                      </span>
                      <span className="w-3 text-[11px] text-[var(--color-text-muted)]">
                        {entry.issueCount > 0 ? (expandedContourQaRules.includes(entry.id) ? '−' : '+') : ''}
                      </span>
                    </button>
                    {entry.issueCount > 0 && expandedContourQaRules.includes(entry.id) ? (
                      <div className="border-t border-[var(--color-border)]">
                        {(contourQaIssuesByRule[entry.id] ?? []).slice(0, qaVisibleCountByRule[entry.id] ?? 12).map((issue, index) => {
                          const isNavigable = Number.isFinite(issue.slicePosition);
                          const key = `${issue.type}-${issue.slicePosition ?? 'structure'}-${index}`;

                          return isNavigable ? (
                            <button
                              key={key}
                              type="button"
                              onClick={() => handleContourQaIssueSelect(issue)}
                              className={`flex w-full items-start gap-1.5 border-b border-[var(--color-border)] px-2 py-1 text-left text-[11px] last:border-b-0 hover:bg-[var(--color-hover)] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
                                issue.severity === 'warning' ? 'text-[#f59e0b]' : 'text-[var(--color-text-muted)]'
                              }`}
                              title={`Jump to z=${issue.slicePosition!.toFixed(1)} mm`}
                              aria-label={`${entry.label} ${issue.message}`}
                            >
                              <span className="min-w-0 flex-1">{issue.message}</span>
                              <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                                z={issue.slicePosition!.toFixed(1)}
                              </span>
                            </button>
                          ) : (
                            <div
                              key={key}
                              className={`border-b border-[var(--color-border)] px-2 py-1 text-[11px] last:border-b-0 ${
                                issue.severity === 'warning' ? 'text-[#f59e0b]' : 'text-[var(--color-text-muted)]'
                              }`}
                            >
                              {issue.message}
                            </div>
                          );
                        })}
                        {(contourQaIssuesByRule[entry.id] ?? []).length > (qaVisibleCountByRule[entry.id] ?? 12) ? (
                          <button
                            type="button"
                            onClick={() => setQaVisibleCountByRule((current) => ({
                              ...current,
                              [entry.id]: (current[entry.id] ?? 12) + 20,
                            }))}
                            className="w-full border-t border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)] focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none"
                          >
                            Show {Math.min(20, (contourQaIssuesByRule[entry.id] ?? []).length - (qaVisibleCountByRule[entry.id] ?? 12))} more
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
            {!(activeStructureQa && contourQaChecklist.some((entry) => entry.issueCount > 0)) ? (
              <p className="text-[11px] text-[var(--color-text-muted)]">
                {activeStructure ? 'No contour QA issues for this structure.' : 'No active structure.'}
              </p>
            ) : null}
          </section>
        </div>
      )}

      {panelTab === 'history' && (
        <div className="flex-1 overflow-y-auto px-3 py-2 text-[11px]">
          <section className="border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="border-b border-[var(--color-border)] bg-[var(--color-elevated)] px-2 py-1">
              <p className="font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                RTSTRUCT History
              </p>
            </div>
            {!activeSeriesStructureSet ? (
              <p className="px-2 py-2 text-[var(--color-text-muted)]">No active structure set.</p>
            ) : activeSeriesStructureSet.source?.type !== 'rtstruct' ? (
              <p className="px-2 py-2 text-[var(--color-text-muted)]">No repository RTSTRUCT is active.</p>
            ) : !hasRecordedRtstructHistory ? (
              <p className="px-2 py-2 text-[var(--color-text-muted)]">
                No recorded predecessor history for this structure set.
              </p>
            ) : (
              <div>
                {activeRtstructHistoryGroup?.versions.map((version, index) => {
                  const isActiveVersion = activeSeriesStructureSet.source?.sopInstanceUID === version.sopInstanceUID;
                  const label = version.structureSetName || version.structureSetLabel || version.seriesDescription || 'RTSTRUCT';

                  return (
                    <button
                      key={version.sopInstanceUID}
                      type="button"
                      onClick={() => loadRtstructVersion?.(version.sopInstanceUID)}
                      disabled={!loadRtstructVersion || isActiveVersion}
                      className={`grid w-full grid-cols-[42px_1fr_auto] items-start gap-2 border-b border-[var(--color-border)] px-2 py-1.5 text-left last:border-b-0 focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none ${
                        isActiveVersion
                          ? 'bg-blue-950/20 text-[var(--color-text)]'
                          : 'text-[var(--color-text-sec)] hover:bg-[var(--color-hover)] disabled:cursor-not-allowed disabled:opacity-60'
                      }`}
                      title={isActiveVersion ? 'Active in workspace' : `Load ${label}`}
                    >
                      <span className="rounded bg-[var(--color-elevated)] px-1.5 py-0.5 text-center font-semibold text-[var(--color-text-muted)]">
                        {index === 0 ? 'NEW' : `V${(activeRtstructHistoryGroup?.versions.length ?? 0) - index}`}
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-[12px] text-[var(--color-text)]">
                          {label}
                        </span>
                        <span className="block truncate font-mono text-[10px] text-[var(--color-text-muted)]">
                          {formatDicomDateTime(version.structureSetDate || version.seriesDate, version.structureSetTime || version.seriesTime)}
                          {' · '}
                          SOP …{formatSopTail(version.sopInstanceUID)}
                          {typeof version.roiCount === 'number' ? ` · ${version.roiCount} ROI` : ''}
                        </span>
                        {(version.approvalStatus || version.reviewerName) && (
                          <span className="mt-0.5 block truncate text-[10px] text-[var(--color-text-muted)]">
                            {version.approvalStatus ?? 'UNREVIEWED'}
                            {version.reviewerName ? ` · ${version.reviewerName}` : ''}
                          </span>
                        )}
                      </span>
                      <span className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                        {isActiveVersion ? 'Active' : 'Load'}
                      </span>
                    </button>
                  );
                })}
                {activeRtstructHistoryGroup?.hasMissingPredecessor ? (
                  <p className="border-t border-[var(--color-border)] px-2 py-1 text-[10px] text-[#f59e0b]">
                    Earlier predecessor is referenced but not available in this repository query.
                  </p>
                ) : null}
              </div>
            )}
          </section>
        </div>
      )}

      {panelTab === 'dicom' && (
        <div className="flex-1 overflow-y-auto px-3 py-2 text-[11px]">
          <section className="border border-[var(--color-border)] bg-[var(--color-surface)]">
            {[
              ['Structure Set', activeSeriesStructureSet?.label ?? 'n/a'],
              ['Source', activeSeriesStructureSet ? formatSourceLabel(activeSeriesStructureSet) : 'n/a'],
              ['Kind', activeSeriesStructureSet?.source?.type === 'rtstruct' ? 'RTSS' : 'SET'],
              ['SOP', activeSeriesStructureSet?.source?.sopInstanceUID ? `…${formatSopTail(activeSeriesStructureSet.source.sopInstanceUID)}` : 'n/a'],
              ['Imported', activeSeriesStructureSet?.source?.importedAt ? formatSourceTimestamp(activeSeriesStructureSet.source.importedAt) : 'n/a'],
              ['Series UID', activeSeriesUID ?? 'n/a'],
            ].map(([label, value]) => (
              <div key={label} className="grid grid-cols-[72px_1fr] border-b border-[var(--color-border)] last:border-b-0">
                <div className="bg-[var(--color-elevated)] px-2 py-1 font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">{label}</div>
                <div className="min-w-0 truncate px-2 py-1 font-mono text-[var(--color-text-sec)]" title={value}>{value}</div>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
