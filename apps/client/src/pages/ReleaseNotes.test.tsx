import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ReleaseNotes from './ReleaseNotes';
import { RELEASE_NOTES } from './releaseNotesData';

// @links:SRS-031
describe('ReleaseNotes', () => {
  // @testing:T1
  it('renders at least one entry with a version string and change text', () => {
    render(<ReleaseNotes />);
    expect(RELEASE_NOTES.length).toBeGreaterThan(0);
    expect(screen.getByText(`v${RELEASE_NOTES[0].version}`)).toBeTruthy();
    expect(screen.getByText(RELEASE_NOTES[0].changes[0])).toBeTruthy();
  });

  // @testing:T2
  it('renders the most recent entry first', () => {
    if (RELEASE_NOTES.length < 2) return;
    render(<ReleaseNotes />);
    const first = screen.getByText(`v${RELEASE_NOTES[0].version}`);
    const second = screen.getByText(`v${RELEASE_NOTES[1].version}`);
    expect(
      first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
