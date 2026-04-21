import { useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  getDefaultDicomWebBaseUrl,
  getDicomWebBaseUrl,
  resetDicomWebBaseUrl,
  setDicomWebBaseUrl,
  uploadDicomWebStudies,
} from '../core/dicom/dicomWebClient';
import {
  QA_RULE_DEFINITIONS,
  getQaRuleConfig,
  resetQaRuleConfig,
  setQaRuleEnabled,
  type QaRuleConfig,
} from '../core/qa/qaRuleConfig';

interface SettingsStatus {
  tone: 'muted' | 'error';
  message: string;
}

export default function Settings() {
  const [endpoint, setEndpoint] = useState(getDicomWebBaseUrl());
  const [qaRuleConfig, setQaRuleConfig] = useState<QaRuleConfig>(getQaRuleConfig());
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

  const onToggleQaRule = (ruleId: keyof QaRuleConfig, enabled: boolean) => {
    const next = setQaRuleEnabled(ruleId, enabled);
    setQaRuleConfig(next);
    setStatus({ tone: 'muted', message: 'QA rule configuration saved for this browser.' });
  };

  const onResetQaRules = () => {
    const next = resetQaRuleConfig();
    setQaRuleConfig(next);
    setStatus({ tone: 'muted', message: 'QA rule configuration reset to the application default.' });
  };

  const contourRules = QA_RULE_DEFINITIONS.filter((rule) => rule.section === 'contour');
  const rtssRules = QA_RULE_DEFINITIONS.filter((rule) => rule.section === 'rtss');

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

        <section className="border border-[#2a2a2a] bg-[#1a1a1a]">
          <div className="border-b border-[#2a2a2a] px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[#a0a0a0]">
                  QA Rules
                </h2>
                <p className="mt-1 text-[11px] text-[#6b6b6b]">
                  Enable or disable contour and RTSS QA checks for this browser. Changes apply to the review workspace immediately after returning.
                </p>
              </div>
              <button
                type="button"
                onClick={onResetQaRules}
                className="h-8 rounded bg-[#242424] px-3 text-[11px] text-[#a0a0a0] hover:bg-[#2e2e2e] hover:text-[#e5e5e5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                Reset QA Rules
              </button>
            </div>
          </div>
          <div className="grid gap-4 px-3 py-3 md:grid-cols-2">
            {[
              { label: 'Contour QA', rules: contourRules },
              { label: 'RTSS QA', rules: rtssRules },
            ].map((section) => (
              <section key={section.label} className="border border-[#2a2a2a] bg-[#171717]">
                <div className="border-b border-[#2a2a2a] px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-[#6b6b6b]">
                  {section.label}
                </div>
                <div>
                  {section.rules.map((rule) => (
                    <label
                      key={rule.id}
                      className="grid grid-cols-[1fr_auto] gap-3 border-b border-[#2a2a2a] px-2 py-2 last:border-b-0"
                    >
                      <span>
                        <span className="block text-[11px] font-semibold text-[#e5e5e5]">{rule.label}</span>
                        <span className="mt-0.5 block text-[10px] text-[#6b6b6b]">{rule.description}</span>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className={`text-[9px] uppercase tracking-widest ${
                          rule.severity === 'warning' ? 'text-[#f59e0b]' : 'text-[#6b6b6b]'
                        }`}>
                          {rule.severity}
                        </span>
                        <input
                          aria-label={`${rule.label} QA rule`}
                          type="checkbox"
                          checked={qaRuleConfig[rule.id]}
                          onChange={(event) => onToggleQaRule(rule.id, event.target.checked)}
                          className="h-4 w-4 accent-blue-500"
                        />
                      </span>
                    </label>
                  ))}
                </div>
              </section>
            ))}
          </div>
          <div className="border-t border-[#2a2a2a] bg-[#171717] px-3 py-2">
            <p className="text-[10px] text-[#6b6b6b]">
              Custom user-authored QA rules are not implemented yet. When added, they should target a constrained rule schema rather than arbitrary scripting.
            </p>
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
