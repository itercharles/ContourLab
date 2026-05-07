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

const STAGE_META: Record<string, { label: string; className: string }> = {
  submitted:    { label: 'Submitted',    className: 'bg-gray-700/60 text-gray-300' },
  in_review:    { label: 'In Review',    className: 'bg-blue-900/60 text-blue-300' },
  designing:    { label: 'Designing',    className: 'bg-purple-900/60 text-purple-300' },
  implementing: { label: 'Implementing', className: 'bg-amber-900/60 text-amber-300' },
  completed:    { label: 'Completed',    className: 'bg-green-900/60 text-green-300' },
};

function StageChip({ stage }: { stage: string }) {
  const meta = STAGE_META[stage] ?? { label: stage, className: 'bg-gray-700/60 text-gray-300' };
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.className}`}>
      {meta.label}
    </span>
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
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
              WebTPS
            </p>
            <h1 className="mt-1 text-sm font-semibold text-[var(--color-text)]">Issues</h1>
          </div>
          <Link
            to="/workspace"
            reloadDocument
            className="rounded bg-[var(--color-elevated)] px-3 py-1.5 text-[11px] text-[var(--color-text-sec)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            Back to Workspace
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl space-y-4 px-6 py-5">
        {/* Submit form */}
        <section className="border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="border-b border-[var(--color-border)] px-3 py-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-sec)]">
              Submit an Issue
            </h2>
            <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
              Report a bug or request an enhancement. Your submission is logged as a GitHub issue and enters the change request pipeline.
            </p>
          </div>

          <form onSubmit={(e) => void onSubmit(e)} className="grid gap-3 px-3 py-3">
            <div className="grid gap-1.5">
              <label htmlFor="issue-title" className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                Title
              </label>
              <input
                id="issue-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Brief summary of the issue"
                className="h-8 rounded border border-[var(--color-border-input)] bg-[var(--color-header)] px-2 text-[11px] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="grid gap-1.5">
              <label htmlFor="issue-description" className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                Description
              </label>
              <textarea
                id="issue-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows={4}
                placeholder="Describe the issue in detail — steps to reproduce, expected vs actual behaviour, etc."
                className="resize-y rounded border border-[var(--color-border-input)] bg-[var(--color-header)] px-2 py-1.5 text-[11px] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div className="flex gap-3">
              <div className="grid gap-1.5">
                <label htmlFor="issue-priority" className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                  Priority
                </label>
                <select
                  id="issue-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  className="h-8 rounded border border-[var(--color-border-input)] bg-[var(--color-header)] px-2 text-[11px] text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                  <option value="critical">Critical</option>
                </select>
              </div>

              <div className="grid gap-1.5">
                <label htmlFor="issue-category" className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">
                  Category
                </label>
                <select
                  id="issue-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="h-8 rounded border border-[var(--color-border-input)] bg-[var(--color-header)] px-2 text-[11px] text-[var(--color-text)] focus:outline-none focus:ring-1 focus:ring-blue-500"
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
                className={`rounded border px-3 py-2 text-[11px] ${
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
                className="h-8 rounded bg-blue-700 px-4 text-[11px] font-semibold text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                {submitting ? 'Submitting…' : 'Submit Issue'}
              </button>
            </div>
          </form>
        </section>

        {/* CR status board */}
        <section className="border border-[var(--color-border)] bg-[var(--color-surface)]">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-3 py-2">
            <div>
              <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--color-text-sec)]">
                Change Request Status
              </h2>
              <p className="mt-1 text-[11px] text-[var(--color-text-muted)]">
                All open issues and their current pipeline stage.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void fetchIssues()}
              disabled={loading}
              className="h-7 rounded bg-[var(--color-elevated)] px-3 text-[10px] text-[var(--color-text-sec)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              Refresh
            </button>
          </div>

          {loadError && (
            <div className="border-b border-[var(--color-border)] px-3 py-2 text-[11px] text-red-400">
              {loadError}
            </div>
          )}

          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="w-12 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">#</th>
                <th className="px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Title</th>
                <th className="w-32 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Stage</th>
                <th className="w-24 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Priority</th>
                <th className="w-28 px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-[var(--color-text-muted)]">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="border-b border-[var(--color-border)] last:border-b-0">
                    <td className="px-3 py-2"><div className="h-3 w-8 animate-pulse rounded bg-[var(--color-elevated)]" /></td>
                    <td className="px-3 py-2"><div className="h-3 w-48 animate-pulse rounded bg-[var(--color-elevated)]" /></td>
                    <td className="px-3 py-2"><div className="h-3 w-20 animate-pulse rounded bg-[var(--color-elevated)]" /></td>
                    <td className="px-3 py-2"><div className="h-3 w-14 animate-pulse rounded bg-[var(--color-elevated)]" /></td>
                    <td className="px-3 py-2"><div className="h-3 w-20 animate-pulse rounded bg-[var(--color-elevated)]" /></td>
                  </tr>
                ))
              )}
              {!loading && items.length === 0 && !loadError && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-[11px] text-[var(--color-text-muted)]">
                    No open issues found.
                  </td>
                </tr>
              )}
              {!loading && items.map((item) => (
                <tr key={item.number} className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-elevated)]/30">
                  <td className="px-3 py-2 font-mono text-[11px] text-[var(--color-text-muted)]">
                    {item.number}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-[var(--color-text)]">
                    <a
                      href={item.htmlUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="hover:text-blue-300 hover:underline"
                    >
                      {item.title}
                    </a>
                  </td>
                  <td className="px-3 py-2">
                    <StageChip stage={item.stage} />
                  </td>
                  <td className="px-3 py-2 text-[11px] capitalize text-[var(--color-text-sec)]">
                    {item.priority}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-[var(--color-text-muted)]">
                    {new Date(item.createdAt).toLocaleDateString()}
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
