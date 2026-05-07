import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { UndoRedoManager } from '../../core/contouring/UndoRedoManager';
import { useActivityStore, type ActivityItem } from '../../core/store/activityStore';
import { useStructureStore } from '../../core/store/structureStore';
import { useVolumeStore } from '../../core/store/volumeStore';
import { exportRtstructObject } from '../../core/structures/rtstructExport';
import { uploadDicomBlobToRepository } from '../../core/dicom/dicomWebClient';
import { logClientDebug } from '../../core/debug/clientDebugLog';
import WorkspaceContextBar from '../layout/WorkspaceContextBar';

const ACTIVITY_TONE_CLASS: Record<ActivityItem['tone'], string> = {
  info: 'bg-blue-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  error: 'bg-red-500',
};

const WEBTPS_REPO_URL = 'https://github.com/itercharles/WebTPS';

function formatActivityTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function Toolbar() {
  const [undoRedoRevision, setUndoRedoRevision] = useState(0);
  const [isPushingChanges, setIsPushingChanges] = useState(false);
  const [activityOpen, setActivityOpen] = useState(false);
  const [prototypeInfoOpen, setPrototypeInfoOpen] = useState(false);
  const activities = useActivityStore((s) => s.activities);
  const markAllRead = useActivityStore((s) => s.markAllRead);
  const clearActivities = useActivityStore((s) => s.clearActivities);
  const unreadActivityCount = activities.filter((activity) => !activity.read).length;
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

  const toggleActivityPanel = () => {
    const nextOpen = !activityOpen;
    setActivityOpen(nextOpen);
    if (nextOpen) {
      markAllRead();
    }
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
    <div className="flex flex-none flex-col border-b border-[var(--color-border)] bg-[var(--color-header)]">
      <div className="relative flex h-9 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-alt)] px-2">
        <div className="flex items-center gap-1.5 pr-1">
          <div className="grid h-5 w-5 place-items-center rounded bg-blue-600 font-mono text-[10px] font-bold text-white">
            W
          </div>
          <span className="text-[12px] font-semibold tracking-tight text-[var(--color-text-bright)]">WebTPS</span>
        </div>
        <button
          type="button"
          onClick={() => setPrototypeInfoOpen(true)}
          className="h-7 rounded bg-blue-900 px-4 text-[12px] font-bold text-white ring-1 ring-blue-400/70 transition-colors hover:bg-blue-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
        >
          Click Me
        </button>
        <div className="flex items-center rounded border border-[var(--color-border)] bg-[var(--color-surface-alt)] p-0.5">
          <button
            type="button"
            className="rounded bg-[var(--color-surface-alt)] px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-bright)]"
            title="Contour workspace"
          >
            <span className="mr-1 font-mono text-[9px] text-[var(--color-text-muted)]">01</span>
            Contour
          </button>
          {(['Review', 'Plan'] as const).map((label, index) => (
            <button
              key={label}
              type="button"
              disabled
              className="cursor-not-allowed rounded px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-muted)]"
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
              : 'bg-[var(--color-elevated)] text-[var(--color-text-muted)] opacity-60'
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
              className="grid h-[22px] w-[22px] place-items-center rounded-full border-2 border-[var(--color-surface-alt)] text-[10px] font-bold text-white"
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
          className="flex h-7 w-7 items-center justify-center rounded text-[var(--color-text-sec)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-bright)] disabled:cursor-not-allowed disabled:opacity-30"
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
          className="flex h-7 w-7 items-center justify-center rounded text-[var(--color-text-sec)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-bright)] disabled:cursor-not-allowed disabled:opacity-30"
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="m10 4 3 3-3 3" />
            <path d="M13 7H7a4 4 0 0 0-4 4" />
          </svg>
        </button>
        {/* Inbox / notifications */}
        <button
          type="button"
          onClick={toggleActivityPanel}
          title={`Inbox · ${unreadActivityCount} unread`}
          aria-label="Inbox"
          className={`relative flex h-7 w-7 items-center justify-center rounded transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
            activityOpen
              ? 'bg-[rgba(59,130,246,0.12)] text-[#3b82f6] ring-1 ring-[rgba(59,130,246,0.35)]'
              : 'text-[var(--color-text-sec)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text-bright)]'
          }`}
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
          {unreadActivityCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid h-3.5 min-w-3.5 place-items-center rounded-full bg-red-500 px-0.5 text-[8px] font-bold leading-none text-white">
              {unreadActivityCount > 9 ? '9+' : unreadActivityCount}
            </span>
          )}
        </button>
        {activityOpen && (
          <div className="absolute right-10 top-9 z-50 w-[360px] border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] shadow-[0_12px_32px_rgba(0,0,0,0.45)]">
            <div className="flex h-8 items-center justify-between border-b border-[var(--color-border)] px-2">
              <h2 className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-sec)]">
                Activity
              </h2>
              <button
                type="button"
                onClick={clearActivities}
                disabled={activities.length === 0}
                className="h-6 rounded px-2 text-[10px] text-[var(--color-text-sec)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:text-[var(--color-text-dim)] disabled:hover:bg-transparent"
              >
                Clear
              </button>
            </div>
            <div className="max-h-[320px] overflow-auto">
              {activities.length === 0 ? (
                <div className="px-3 py-4 text-[11px] text-[var(--color-text-muted)]">
                  No recent activity.
                </div>
              ) : (
                activities.map((activity) => (
                  <div
                    key={activity.id}
                    className="grid grid-cols-[auto_1fr_auto] gap-2 border-b border-[var(--color-border)] px-2 py-2 last:border-b-0"
                  >
                    <span className={`mt-1 h-2 w-2 rounded-full ${ACTIVITY_TONE_CLASS[activity.tone]}`} />
                    <span className="min-w-0">
                      <span className="block truncate text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                        {activity.title}
                      </span>
                      <span className="mt-0.5 block break-words text-[11px] leading-snug text-[var(--color-text-sec)]">
                        {activity.message}
                      </span>
                      {activity.detail && (
                        <span className="mt-1 block truncate font-mono text-[10px] text-[var(--color-text-muted)]">
                          {activity.detail}
                        </span>
                      )}
                    </span>
                    <span className="font-mono text-[10px] text-[var(--color-text-muted)]">
                      {formatActivityTime(activity.createdAt)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
        <div className="h-4 w-px bg-[var(--color-border)]" />
        <Link
          to="/settings"
          reloadDocument
          title="Settings"
          aria-label="Settings"
          className="flex h-7 w-7 items-center justify-center rounded text-[var(--color-text-sec)] transition-colors hover:bg-[var(--color-hover)] hover:text-[var(--color-text-bright)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z" />
          </svg>
        </Link>
        {prototypeInfoOpen && (
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="prototype-info-title"
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 px-4 py-6"
            onClick={() => setPrototypeInfoOpen(false)}
          >
            <div
              className="flex w-full max-w-[660px] flex-col border border-blue-500/50 bg-[var(--color-surface)] text-[var(--color-text)] shadow-[0_18px_50px_rgba(0,0,0,0.55)]"
              style={{ maxHeight: 'calc(100vh - 48px)' }}
              onClick={(event) => event.stopPropagation()}
            >
              {/* Header */}
              <div className="flex shrink-0 items-center justify-between border-b border-blue-500/30 bg-blue-950 px-4 py-3">
                <h2 id="prototype-info-title" className="text-[14px] font-bold text-white">
                  Issue-driven AI coding prototype
                </h2>
                <button
                  type="button"
                  onClick={() => setPrototypeInfoOpen(false)}
                  aria-label="Close prototype information"
                  className="flex h-7 w-7 items-center justify-center rounded text-blue-100 hover:bg-blue-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                >
                  ×
                </button>
              </div>

              {/* Scrollable body */}
              <div className="overflow-y-auto px-4 py-4 text-[12px] leading-relaxed text-[var(--color-text-sec)]">
                <p className="font-semibold text-[var(--color-text)]">
                  This prototype demonstrates issue-driven AI software development.
                  It does not contain any Elekta product code.
                </p>
                <p className="mt-2">
                  All application code, CI/CD workflows, and compliance documentation were written by AI (Claude + Codex).
                  Humans review and approve at each gate — the AI never merges without human sign-off.
                </p>
                <p className="mt-2">
                  Repository:{' '}
                  <a href={WEBTPS_REPO_URL} target="_blank" rel="noreferrer"
                    className="font-semibold text-blue-300 hover:text-blue-200">
                    github.com/itercharles/WebTPS
                  </a>
                </p>

                {/* Workflow */}
                <h3 className="mt-4 mb-2 text-[11px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                  Workflow
                </h3>
                <div aria-label="Issue-driven AI coding workflow" className="space-y-0">
                  {([
                    { actor: 'human', step: '1', title: 'Open a GitHub issue',       desc: 'Describe the feature, bug, or improvement you want.',                                                                                    trigger: 'Assigned to milestone → auto-creates CR' },
                    { actor: 'human', step: '2', title: 'Maintainer triage',         desc: 'A maintainer reviews the issue, accepts it, and assigns it to the current milestone. Declined issues are closed with a comment.',       trigger: 'CR merge → auto-starts Spec generation' },
                    { actor: 'ai',    step: '3', title: 'CR + Plan Spec generated',  desc: 'AI creates a Change Request in the compliance repository and produces a Plan Spec — scope, architecture impact, DHF items affected, and test strategy.', trigger: 'Spec PR approval → auto-starts DHF update' },
                    { actor: 'human', step: '4', title: 'Spec review & approval',    desc: 'Maintainer reviews the Plan Spec PR. Feedback loops back to AI for revision. DHF design work cannot start until the spec is approved.', trigger: 'DHF PR approval → auto-starts implementation' },
                    { actor: 'ai',    step: '5', title: 'DHF design update',         desc: 'AI updates compliance documentation (SRS, SWDD, risk items) to reflect the approved design, then opens a DHF pull request.',            trigger: 'Code PR approval → auto-merges & deploys' },
                    { actor: 'human', step: '6', title: 'DHF review & approval',     desc: 'Maintainer reviews the DHF changes. Feedback loops back to AI. Implementation code is only written after DHF is merged.',              trigger: 'Merge → auto-opens implementation PR' },
                    { actor: 'ai',    step: '7', title: 'Implementation PR',         desc: 'AI writes code and tests against the merged spec and DHF items, then opens a pull request. CI runs lint, typecheck, unit, and compliance checks.', trigger: null },
                    { actor: 'human', step: '8', title: 'Code review & approval',    desc: 'Maintainer reviews the PR. Review comments are fed back to AI for iteration. The AI never merges without explicit human approval.',     trigger: 'Approval → auto-merge, triggers CI pipeline' },
                    { actor: 'ai',    step: '9', title: 'Traceability validation',   desc: 'CI verifies design coverage (SYS → SYSARCH), test linkage (@links annotations), and IEC 62304 / IEC 82304-1 compliance. Any gap blocks the pipeline.', trigger: 'All checks pass → auto-generates artifacts' },
                    { actor: 'ai',    step: '10', title: 'Report generation & deploy', desc: 'DHF spec PDFs and a full traceability report are generated and archived. The application is then deployed automatically to the production server.', trigger: null },
                  ] as const).map(({ actor, step, title, desc, trigger }, i, arr) => (
                    <div key={step} className="flex gap-3">
                      {/* Spine */}
                      <div className="flex flex-col items-center">
                        <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold
                          ${actor === 'ai' ? 'bg-blue-700 text-white' : 'bg-gray-700 text-gray-100'}`}>
                          {step}
                        </div>
                        {i < arr.length - 1 && (
                          <div className="flex w-7 flex-col items-center">
                            <div className="w-px grow bg-[var(--color-border)]" />
                          </div>
                        )}
                      </div>
                      {/* Content */}
                      <div className="pb-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[var(--color-text)]">{title}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide
                            ${actor === 'ai' ? 'bg-blue-900 text-blue-200' : 'bg-gray-800 text-gray-300'}`}>
                            {actor === 'ai' ? 'AI' : 'Human'}
                          </span>
                        </div>
                        <p className="mt-0.5 text-[11px] text-[var(--color-text-muted)]">{desc}</p>
                        {trigger && (
                          <p className="mt-1 text-[10px] font-medium text-emerald-400">
                            ⚡ {trigger}
                          </p>
                        )}
                        <div className="mb-3" />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Open source tooling */}
                <p className="mt-3 text-[11px] text-[var(--color-text-muted)]">
                  The compliance and CR automation workflow is powered by{' '}
                  <a
                    href="https://github.com/itercharles/MedHarness"
                    target="_blank"
                    rel="noreferrer"
                    className="font-semibold text-blue-300 hover:text-blue-200"
                  >
                    MedHarness
                  </a>
                  {' '}— open-source design-controlled development infrastructure for medical device teams.
                </p>

                {/* Access */}
                <div className="mt-2 border border-amber-500/30 bg-amber-950/20 px-3 py-3">
                  <p className="font-semibold text-amber-200">How to get access</p>
                  <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                    GitHub issue creation requires repository write access.
                    If you do not have access, send your GitHub username to{' '}
                    <span className="font-semibold text-[var(--color-text)]">Charles Chen</span>{' '}
                    to be added as a collaborator.
                  </p>
                </div>

                {/* CTA */}
                <div className="mt-4">
                  <Link
                    to="/issues"
                    reloadDocument
                    onClick={() => setPrototypeInfoOpen(false)}
                    className="inline-flex h-8 items-center rounded bg-blue-800 px-3 text-[12px] font-bold text-white hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300"
                  >
                    Submit or track an issue →
                  </Link>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      <WorkspaceContextBar />
    </div>
  );
}
