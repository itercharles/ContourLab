import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Issues from './Issues';

function mockFetch(...responses: Array<{ ok: boolean; status?: number; data: unknown }>) {
  let call = 0;
  return vi.fn().mockImplementation(() => {
    const r = responses[call++] ?? responses[responses.length - 1];
    return Promise.resolve({
      ok: r.ok,
      status: r.status ?? (r.ok ? 200 : 500),
      json: () => Promise.resolve(r.data),
    });
  });
}

const emptyList = { ok: true, data: { items: [] } };

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch(emptyList));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Issues page — submit form', () => {
  it('renders all form fields', async () => {
    render(<MemoryRouter><Issues /></MemoryRouter>);

    expect(screen.getByLabelText('Title')).toBeTruthy();
    expect(screen.getByLabelText('Description')).toBeTruthy();
    expect(screen.getByLabelText('Priority')).toBeTruthy();
    expect(screen.getByLabelText('Category')).toBeTruthy();
  });

  it('submit button is disabled when title or description is empty', async () => {
    render(<MemoryRouter><Issues /></MemoryRouter>);

    const btn = screen.getByRole('button', { name: 'Submit Issue' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Some title' } });
    expect(btn.disabled).toBe(true); // description still empty

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: '' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Some description' } });
    expect(btn.disabled).toBe(true); // title now empty
  });

  it('submit button is enabled when both title and description are filled', async () => {
    render(<MemoryRouter><Issues /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Bug title' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Bug description' } });

    const btn = screen.getByRole('button', { name: 'Submit Issue' }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
  });

  it('shows success banner with GitHub link after successful submission', async () => {
    vi.stubGlobal('fetch', mockFetch(
      emptyList,                                                                             // initial GET
      { ok: true, status: 201, data: { number: 42, htmlUrl: 'https://github.com/itercharles/WebTPS/issues/42' } },  // POST
      emptyList,                                                                             // GET after success
    ));

    render(<MemoryRouter><Issues /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Bad contrast' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Dark mode text is hard to read.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Issue' }));

    await waitFor(() => expect(screen.getByText(/Issue #42 submitted\./)).toBeTruthy());
    expect(screen.getByText('View on GitHub')).toBeTruthy();
  });

  it('clears the form after successful submission', async () => {
    vi.stubGlobal('fetch', mockFetch(
      emptyList,
      { ok: true, status: 201, data: { number: 1, htmlUrl: 'https://github.com/itercharles/WebTPS/issues/1' } },
      emptyList,
    ));

    render(<MemoryRouter><Issues /></MemoryRouter>);

    const titleInput = screen.getByLabelText('Title') as HTMLInputElement;
    const descInput = screen.getByLabelText('Description') as HTMLTextAreaElement;

    fireEvent.change(titleInput, { target: { value: 'Some title' } });
    fireEvent.change(descInput, { target: { value: 'Some description' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Issue' }));

    await waitFor(() => expect(screen.getByText(/Issue #1 submitted\./)).toBeTruthy());
    expect(titleInput.value).toBe('');
    expect(descInput.value).toBe('');
  });

  it('shows error banner when POST /api/issues returns 503', async () => {
    vi.stubGlobal('fetch', mockFetch(
      emptyList,
      { ok: false, status: 503, data: { detail: 'GITHUB_TOKEN not configured.' } },
    ));

    render(<MemoryRouter><Issues /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Title' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Desc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Issue' }));

    await waitFor(() => expect(screen.getByText('GITHUB_TOKEN not configured.')).toBeTruthy());
  });

  it('shows generic error when fetch throws a network error', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ items: [] }) }) // initial GET
      .mockRejectedValueOnce(new Error('Network error')),                               // POST throws
    );

    render(<MemoryRouter><Issues /></MemoryRouter>);

    fireEvent.change(screen.getByLabelText('Title'), { target: { value: 'Title' } });
    fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Desc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Submit Issue' }));

    await waitFor(() =>
      expect(screen.getByText('Could not reach the API. Make sure the API server is running.')).toBeTruthy()
    );
  });
});

describe('Issues page — status board', () => {
  it('shows empty state when no open issues', async () => {
    render(<MemoryRouter><Issues /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('No open issues found.')).toBeTruthy());
  });

  it('renders issue rows with number, title, and stage chip', async () => {
    vi.stubGlobal('fetch', mockFetch({
      ok: true,
      data: {
        items: [
          { number: 10, title: 'Low contrast in dark mode', stage: 'in_review', priority: 'high', createdAt: '2026-01-01T00:00:00Z', htmlUrl: 'https://github.com/itercharles/WebTPS/issues/10' },
          { number: 24, title: 'Add dose volume histogram', stage: 'implementing', priority: 'medium', createdAt: '2026-02-01T00:00:00Z', htmlUrl: 'https://github.com/itercharles/WebTPS/issues/24' },
        ],
      },
    }));

    render(<MemoryRouter><Issues /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('Low contrast in dark mode')).toBeTruthy());
    expect(screen.getByText('Add dose volume histogram')).toBeTruthy();
    expect(screen.getByText('In Review')).toBeTruthy();
    expect(screen.getByText('Implementing')).toBeTruthy();
  });

  it('shows inline error when GET /api/issues returns 503', async () => {
    vi.stubGlobal('fetch', mockFetch({ ok: false, status: 503, data: { detail: 'GITHUB_TOKEN not configured.' } }));

    render(<MemoryRouter><Issues /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('GITHUB_TOKEN not configured.')).toBeTruthy());
  });

  it('shows fallback error message when response has no detail field', async () => {
    vi.stubGlobal('fetch', mockFetch({ ok: false, status: 500, data: {} }));

    render(<MemoryRouter><Issues /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText('Server error 500')).toBeTruthy());
  });
});

describe('stage label mapping', () => {
  const cases: Array<[string, string]> = [
    ['submitted',    'Submitted'],
    ['in_review',    'In Review'],
    ['designing',    'Designing'],
    ['implementing', 'Implementing'],
    ['completed',    'Completed'],
  ];

  it.each(cases)('stage "%s" renders label "%s"', async (stage, label) => {
    vi.stubGlobal('fetch', mockFetch({
      ok: true,
      data: {
        items: [{ number: 1, title: 'x', stage, priority: 'low', createdAt: '2026-01-01T00:00:00Z', htmlUrl: 'https://github.com' }],
      },
    }));

    render(<MemoryRouter><Issues /></MemoryRouter>);

    await waitFor(() => expect(screen.getByText(label)).toBeTruthy());
  });
});
