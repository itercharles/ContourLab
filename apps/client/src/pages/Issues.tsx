import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

interface IssueItem {
  number: number;
  title: string;
  stage: string;
  priority: string;
  createdAt: string;
  htmlUrl: string;
}

interface CreateIssueResponse {
  number: number;
  htmlUrl: string;
}

interface SubmitState {
  type: 'success' | 'error';
  message: string;
  htmlUrl?: string;
}

const PIPELINE = ['open', 'analyze', 'design', 'implement', 'deployed'] as const;

function PipelineHeader() {
  return (
    <div className="flex items-center">
      {PIPELINE.map((s, i) => (
        <div key={s} className="flex items-center">
          {i > 0 && <div className="w-5" />}
          <div className="flex w-9 justify-center">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">{s}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

function PipelineStepper({ stage }: { stage: string }) {
  const isDeclined = stage === 'declined';
  const currentIdx = isDeclined ? -1 : PIPELINE.indexOf(stage as typeof PIPELINE[number]);

  return (
    <div className="flex items-center py-1">
      {PIPELINE.map((s, i) => {
        const done = !isDeclined && i < currentIdx;
        const current = !isDeclined && i === currentIdx;
        return (
          <div key={s} className="flex items-center">
            {i > 0 && (
              <div
                className={`h-px w-5 shrink-0 ${
                  done || current ? 'bg-blue-600' : 'bg-[var(--color-border)]'
                }`}
              />
            )}
            <div className="flex w-9 justify-center">
              <div
                className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                  done
                    ? 'bg-blue-500'
                    : current
                    ? 'bg-blue-400 ring-2 ring-blue-400/30 ring-offset-1 ring-offset-[var(--color-surface)]'
                    : 'border border-[var(--color-border)] bg-[var(--color-header)]'
                }`}
              >
                {current && <span className="sr-only" data-testid="current-stage">{s}</span>}
              </div>
            </div>
          </div>
        );
      })}
      {isDeclined && (
        <div className="ml-1 flex items-center">
          <div className="h-px w-4 bg-red-800" />
          <div className="flex w-9 justify-center">
            <div className="h-2.5 w-2.5 rounded-full bg-red-500">
              <span className="sr-only" data-testid="current-stage">declined</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function Issues() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [category, setCategory] = useState('bug');
  const [submitting, setSubmitting] = useState(false);
  const [submitState, setSubmitState] = useState<SubmitState | null>(null);

  const [items, setItems] = useState<IssueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    void fetchIssues();
  }, []);

  async function fetchIssues() {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/issues');
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { detail?: string };
        setLoadError(body.detail ?? `Server error ${res.status}`);
        return;
      }
      const data = await res.json() as { items: IssueItem[] };
      setItems(data.items);
    } catch {
      setLoadError('Could not reach the API. Make sure the API server is running.');
    } finally {
      setLoading(false);
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setSubmitting(true);
    setSubmitState(null);
    try {
      const res = await fetch('/api/issues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, priority, category }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { detail?: string };
        setSubmitState({ type: 'error', message: body.detail ?? `Server error ${res.status}` });
        return;
      }
      const data = await res.json() as CreateIssueResponse;
      setSubmitState({ type: 'success', message: `Issue #${data.number} submitted.`, htmlUrl: data.htmlUrl });
      setTitle('');
      setDescription('');
      setPriority('medium');
      setCategory('bug');
      void fetchIssues();
    } catch {
      setSubmitState({ type: 'error', message: 'Could not reach the API. Make sure the API server is running.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-base)] text-[var(--color-text)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-header)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
              ContourLab
            </p>
            <h1 className="mt-1 text-sm font-semibold text-[var(--color-text)]">Change Requests</h1>
          </div>
          <Link
            to="/workspace"
            reloadDocument
            className="rounded bg-[var(--color-elevated)] px-3 py-1.5 text-[12px] text-[var(--color-text-sec)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Back to Workspace
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-6 py-5">
        {/* Submit form */}
        <section className="border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="border-b border-[var(--color-border)] px-3 py-2">
            <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[var(--color-text-sec)]">
              Submit a Change Request
            </h2>
            <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">
              A change request can be an <span className="text-[var(--color-text-sec)]">enhancement</span> (new feature or improvement) or a <span className="text-[var(--color-text-sec)]">bug</span> (defect or unexpected behaviour). Your submission is logged as a GitHub issue and enters the formal change request pipeline.
            </p>
          </div>

          <form onSubmit={(e) => void onSubmit(e)} className="grid gap-3 px-3 py-3">
            <div className="grid gap-1.5">
              <label htmlFor="issue-title" className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                Title
              </label>
              <input
                id="issue-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Brief summary of the issue"
                className="h-8 rounded border border-[var(--color-border-input)] bg-[var(--color-header)] px-2 text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="issue-description" className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                Description
              </label>
              <textarea
                id="issue-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows={4}
                placeholder="Describe the issue in detail — steps to reproduce, expected vs actual behaviour, etc."
                className="resize-y rounded border border-[var(--color-border-input)] bg-[var(--color-header)] px-2 py-1.5 text-[12px] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-3">
              <div className="grid gap-1.5">
                <label htmlFor="issue-priority" className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                  Priority
                </label>
                <select
                  id="issue-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="h-8 rounded border border-[var(--color-border-input)] bg-[var(--color-header)] px-2 text-[12px] text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="issue-category" className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                  Category
                </label>
                <select
                  id="issue-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-8 rounded border border-[var(--color-border-input)] bg-[var(--color-header)] px-2 text-[12px] text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="bug">Bug</option>
                  <option value="enhancement">Enhancement</option>
                  <option value="documentation">Documentation</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>

            {submitState && (
              <div
                className={`rounded border px-3 py-2 text-[12px] ${
                  submitState.type === 'success'
                    ? 'border-green-700/50 bg-green-900/20 text-green-300'
                    : 'border-red-700/50 bg-red-900/20 text-red-300'
                }`}
              >
                {submitState.message}
                {submitState.htmlUrl && (
                  <>
                    {' '}
                    <a
                      href={submitState.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="underline underline-offset-2 hover:text-green-200"
                    >
                      View on GitHub
                    </a>
                  </>
                )}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={submitting || !title.trim() || !description.trim()}
                className="h-8 rounded bg-blue-700 px-4 text-[12px] font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {submitting ? 'Submitting…' : 'Submit Issue'}
              </button>
            </div>
          </form>
        </section>

        {/* Issue status board */}
        <section className="border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
            <div>
              <h2 className="text-[12px] font-semibold uppercase tracking-widest text-[var(--color-text-sec)]">
                Issue Status
              </h2>
              <p className="mt-1 text-[12px] text-[var(--color-text-muted)]">
                All open issues and their current position in the pipeline.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void fetchIssues()}
              disabled={loading}
              className="h-7 rounded bg-[var(--color-elevated)] px-3 text-[11px] text-[var(--color-text-sec)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Refresh
            </button>
          </div>

          {loadError && (
            <div className="border-b border-[var(--color-border)] px-3 py-2 text-[12px] text-red-400">
              {loadError}
            </div>
          )}

          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="w-12 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">#</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Title</th>
                <th className="w-80 px-3 py-2 text-left"><PipelineHeader /></th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2.5"><div className="h-3 w-8 animate-pulse rounded bg-[var(--color-elevated)]" /></td>
                    <td className="px-3 py-2.5"><div className="h-3 w-48 animate-pulse rounded bg-[var(--color-elevated)]" /></td>
                    <td className="px-3 py-2.5"><div className="h-3 w-64 animate-pulse rounded bg-[var(--color-elevated)]" /></td>
                  </tr>
                ))
              )}
              {!loading && items.length === 0 && !loadError && (
                <tr>
                  <td colSpan={3} className="px-3 py-4 text-center text-[12px] text-[var(--color-text-muted)]">
                    No open issues found.
                  </td>
                </tr>
              )}
              {!loading && items.map((item) => (
                <tr key={item.number} className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-elevated)]/30">
                  <td className="px-3 py-2.5 font-mono text-[12px] text-[var(--color-text-muted)]">
                    {item.number}
                  </td>
                  <td className="px-3 py-2.5 text-[12px] text-[var(--color-text)]">
                    <a
                      href={item.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-blue-300 hover:underline"
                    >
                      {item.title}
                    </a>
                  </td>
                  <td className="px-3 py-1.5">
                    <PipelineStepper stage={item.stage} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </main>
    </div>
  );
}
