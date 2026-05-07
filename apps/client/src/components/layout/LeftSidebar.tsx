import { Link } from 'react-router-dom';
import { useState } from 'react';
import DicomRepoPanel from '../dicom/DicomRepoPanel';
import { useUIStore } from '../../core/store/uiStore';

export default function LeftSidebar() {
  const [refreshRequestToken, setRefreshRequestToken] = useState(0);
  const [repoRefreshState, setRepoRefreshState] = useState({
    hasUpdates: false,
    isRefreshing: false,
  });
  const setLeftSidebarOpen = useUIStore((s) => s.setLeftSidebarOpen);

  return (
    <div className="flex flex-col h-full bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-header)] px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
              Workspace Selector
            </p>
            <p className="mt-0.5 truncate text-[10px] text-[var(--color-text-sec)]">
              Select patient, image, and RTSS
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setRefreshRequestToken((value) => value + 1)}
              disabled={repoRefreshState.isRefreshing}
              className={`flex h-6 w-6 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
                repoRefreshState.hasUpdates
                  ? 'bg-blue-700 text-white hover:bg-blue-600'
                  : 'bg-[var(--color-elevated)] text-[var(--color-text-sec)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]'
              } disabled:cursor-not-allowed disabled:opacity-50`}
              title={
                repoRefreshState.hasUpdates
                  ? 'Repository changes detected. Refresh worklist.'
                  : 'Refresh DICOM repository worklist'
              }
              aria-label="Refresh DICOM repository worklist"
            >
              <svg
                className={repoRefreshState.isRefreshing ? 'animate-spin' : ''}
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
            <button
              type="button"
              onClick={() => {
                const event = new CustomEvent('webtps:open-patient-selector');
                window.dispatchEvent(event);
              }}
              className="flex h-6 w-6 items-center justify-center rounded bg-[var(--color-elevated)] text-[var(--color-text-sec)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              title="Select patient"
              aria-label="Select patient"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="10" cy="8" r="4" />
                <path d="M3 21a7 7 0 0 1 14 0" />
                <path d="M19 8v6" />
                <path d="M16 11h6" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => setLeftSidebarOpen(false)}
              className="flex h-6 w-6 items-center justify-center rounded bg-[var(--color-elevated)] text-[var(--color-text-sec)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              title="Close selector"
              aria-label="Close selector"
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Repository worklist */}
      <div className="flex min-h-0 flex-1 flex-col border-b border-[var(--color-border)]">
        <DicomRepoPanel
          refreshRequestToken={refreshRequestToken}
          onRefreshStateChange={setRepoRefreshState}
        />
      </div>

      <div className="flex items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-base)] px-3 py-2">
        <span className="text-[10px] uppercase tracking-widest text-[var(--color-text-muted)]">
          System
        </span>
        <div className="flex items-center gap-1">
          <Link
            to="/issues"
            reloadDocument
            className="flex h-6 w-6 items-center justify-center rounded bg-[var(--color-elevated)] text-[var(--color-text-sec)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="Issues"
            aria-label="Issues"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </Link>
          <Link
            to="/settings"
            reloadDocument
            className="flex h-6 w-6 items-center justify-center rounded bg-[var(--color-elevated)] text-[var(--color-text-sec)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            title="Settings"
            aria-label="Settings"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1A2 2 0 1 1 4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9l-.1-.1A2 2 0 1 1 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.6V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1A2 2 0 1 1 19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9v.1a1.7 1.7 0 0 0 1.6 1h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z" />
            </svg>
          </Link>
        </div>
      </div>
    </div>
  );
}
