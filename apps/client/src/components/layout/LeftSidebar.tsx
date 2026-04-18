import { Link } from 'react-router-dom';
import { useState } from 'react';
import DicomRepoPanel from '../dicom/DicomRepoPanel';
import { useVolumeStore } from '../../core/store/volumeStore';

function formatPatientName(patient?: { name?: { given?: string; family?: string }; mrn?: string; id?: string }): string {
  if (!patient) return 'No active patient';

  const displayName = [patient.name?.given, patient.name?.family].filter(Boolean).join(' ').trim();
  return displayName || patient.mrn || patient.id || 'Unknown patient';
}

export default function LeftSidebar() {
  const [refreshRequestToken, setRefreshRequestToken] = useState(0);
  const [repoRefreshState, setRepoRefreshState] = useState({
    hasUpdates: false,
    isRefreshing: false,
  });
  const activeSeriesUID = useVolumeStore((s) => s.activeSeriesUID);
  const loadedSeries = useVolumeStore((s) => s.loadedSeries);
  const activeLoadedSeries = activeSeriesUID
    ? loadedSeries.find((entry) => entry.seriesUID === activeSeriesUID)
    : undefined;

  return (
    <div className="flex flex-col h-full bg-[#1a1a1a]">
      {/* Patient context */}
      <div className="border-b border-[#2a2a2a] bg-[#111] px-3 py-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6b6b6b]">
              Patient
            </p>
            <p className="mt-0.5 truncate text-xs font-semibold text-[#e5e5e5]">
              {formatPatientName(activeLoadedSeries?.patient)}
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
                  : 'bg-[#242424] text-[#a0a0a0] hover:bg-[#2e2e2e] hover:text-[#e5e5e5]'
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
              className="flex h-6 w-6 items-center justify-center rounded bg-[#242424] text-[#a0a0a0] hover:bg-[#2e2e2e] hover:text-[#e5e5e5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
          </div>
        </div>
        <p className="mt-1 truncate text-[10px] text-[#6b6b6b]">
          MRN {activeLoadedSeries?.patient.mrn || activeLoadedSeries?.patient.id || 'none'}
        </p>
        <p className="mt-0.5 truncate text-[10px] text-[#6b6b6b]">
          {activeLoadedSeries?.series.seriesDescription || 'No active image set'}
        </p>
      </div>

      {/* Repository worklist */}
      <div className="flex min-h-0 flex-1 flex-col border-b border-[#2a2a2a]">
        <DicomRepoPanel
          refreshRequestToken={refreshRequestToken}
          onRefreshStateChange={setRepoRefreshState}
        />
      </div>

      <div className="flex items-center justify-between border-t border-[#2a2a2a] bg-[#0d0d0d] px-3 py-2">
        <span className="text-[10px] uppercase tracking-widest text-[#6b6b6b]">
          System
        </span>
        <Link
          to="/settings"
          className="flex h-6 w-6 items-center justify-center rounded bg-[#242424] text-[#a0a0a0] hover:bg-[#2e2e2e] hover:text-[#e5e5e5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
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
  );
}
