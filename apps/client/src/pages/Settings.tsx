import { useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  getDefaultDicomWebBaseUrl,
  getDicomWebBaseUrl,
  resetDicomWebBaseUrl,
  setDicomWebBaseUrl,
  uploadDicomWebStudies,
} from '../core/dicom/dicomWebClient';

interface SettingsStatus {
  tone: 'muted' | 'error';
  message: string;
}

export default function Settings() {
  const [endpoint, setEndpoint] = useState(getDicomWebBaseUrl());
  const [status, setStatus] = useState<SettingsStatus | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const onSaveEndpoint = () => {
    try {
      setDicomWebBaseUrl(endpoint);
      setEndpoint(getDicomWebBaseUrl());
      setStatus({ tone: 'muted', message: 'DICOM repository endpoint saved for this browser.' });
    } catch (error) {
      setStatus({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to save DICOM repository endpoint.',
      });
    }
  };

  const onResetEndpoint = () => {
    resetDicomWebBaseUrl();
    setEndpoint(getDicomWebBaseUrl());
    setStatus({ tone: 'muted', message: 'DICOM repository endpoint reset to the application default.' });
  };

  const onImportDataChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length === 0) return;

    setIsImporting(true);
    setStatus({
      tone: 'muted',
      message: `Importing ${files.length} DICOM file${files.length === 1 ? '' : 's'} into ${getDicomWebBaseUrl()}...`,
    });

    try {
      await uploadDicomWebStudies(files);
      setStatus({
        tone: 'muted',
        message: `Imported ${files.length} DICOM file${files.length === 1 ? '' : 's'} into the configured repository.`,
      });
    } catch (error) {
      setStatus({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to import DICOM files.',
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-[#e5e5e5]">
      <header className="border-b border-[#2a2a2a] bg-[#111]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[#6b6b6b]">
              WebTPS
            </p>
            <h1 className="mt-1 text-sm font-semibold text-[#e5e5e5]">Settings</h1>
          </div>
          <Link
            to="/workspace"
            className="rounded bg-[#242424] px-3 py-1.5 text-[11px] text-[#a0a0a0] hover:bg-[#2e2e2e] hover:text-[#e5e5e5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Back to Workspace
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-6 py-5">
        <section className="border border-[#2a2a2a] bg-[#1a1a1a]">
          <div className="border-b border-[#2a2a2a] px-3 py-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[#a0a0a0]">
              DICOM Repository
            </h2>
            <p className="mt-1 text-[11px] text-[#6b6b6b]">
              Configure which DICOMweb repository WebTPS queries, loads from, imports into, and pushes RTSTRUCT objects to.
            </p>
          </div>

          <div className="grid gap-3 px-3 py-3">
            <label htmlFor="dicomweb-endpoint" className="text-[10px] font-semibold uppercase tracking-widest text-[#6b6b6b]">
              DICOMweb endpoint
            </label>
            <div className="flex gap-2">
              <input
                id="dicomweb-endpoint"
                value={endpoint}
                onChange={(event) => setEndpoint(event.target.value)}
                className="h-8 min-w-0 flex-1 rounded border border-[#3a3a3a] bg-[#111] px-2 font-mono text-[11px] text-[#e5e5e5] focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="/dicom-web"
              />
              <button
                type="button"
                onClick={onSaveEndpoint}
                className="h-8 rounded bg-blue-700 px-3 text-[11px] font-semibold text-white hover:bg-blue-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Save
              </button>
              <button
                type="button"
                onClick={onResetEndpoint}
                className="h-8 rounded bg-[#242424] px-3 text-[11px] text-[#a0a0a0] hover:bg-[#2e2e2e] hover:text-[#e5e5e5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Reset
              </button>
            </div>
            <p className="text-[10px] text-[#6b6b6b]">
              Default: <span className="font-mono">{getDefaultDicomWebBaseUrl()}</span>
            </p>
          </div>
        </section>

        <section className="border border-[#2a2a2a] bg-[#1a1a1a]">
          <div className="border-b border-[#2a2a2a] px-3 py-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[#a0a0a0]">
              Import DICOM Data
            </h2>
            <p className="mt-1 text-[11px] text-[#6b6b6b]">
              Import local DICOM files into the configured repository for development and review workflows.
            </p>
          </div>
          <div className="px-3 py-3">
            <label className="inline-flex h-8 cursor-pointer items-center rounded bg-[#242424] px-3 text-[11px] text-[#e5e5e5] hover:bg-[#2e2e2e]">
              {isImporting ? 'Importing...' : 'Import DICOM Files'}
              <input
                type="file"
                multiple
                accept=".dcm,*"
                className="sr-only"
                onChange={(event) => void onImportDataChange(event)}
                disabled={isImporting}
              />
            </label>
          </div>
        </section>

        {status && (
          <p className={`text-[11px] ${status.tone === 'error' ? 'text-red-400' : 'text-[#a0a0a0]'}`}>
            {status.message}
          </p>
        )}
      </main>
    </div>
  );
}
