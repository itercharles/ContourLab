import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import ReleaseNotes from './ReleaseNotes';
import { RELEASE_NOTES } from './releaseNotesData';

const renderPage = () =>
  render(
    <MemoryRouter>
      <ReleaseNotes />
    </MemoryRouter>,
  );

describe('ReleaseNotes @links:SRS-031,SYS-016', () => {
  it('renders at least one entry with a version string and change text @testing:T1', () => {
    renderPage();
    expect(RELEASE_NOTES.length).toBeGreaterThan(0);
    expect(screen.getByText(`v${RELEASE_NOTES[0].version}`)).toBeTruthy();
    expect(screen.getByText(RELEASE_NOTES[0].changes[0])).toBeTruthy();
  });

  it('renders the most recent entry first @testing:T2', () => {
    if (RELEASE_NOTES.length < 2) return;
    renderPage();
    const first = screen.getByText(`v${RELEASE_NOTES[0].version}`);
    const second = screen.getByText(`v${RELEASE_NOTES[1].version}`);
    expect(
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('header has a focusable Back to workspace link to /workspace @testing:T3', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /back to workspace/i });
    expect(link.getAttribute('href')).toBe('/workspace');
    expect(link.className).toContain('focus-visible:ring');
  });

  it('keeps the existing title, subtitle and release entries @testing:T4', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Release Notes');
    expect(screen.getByText("What's changed in each version of ContourLab")).toBeTruthy();
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(RELEASE_NOTES.length);
    RELEASE_NOTES.forEach((entry) => {
      expect(screen.getByText(`v${entry.version}`)).toBeTruthy();
    });
  });

  it('header row wraps so the link stays visible at narrow widths @testing:T5', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /back to workspace/i });
    expect(link.parentElement?.className).toContain('flex-wrap');
  });
});
