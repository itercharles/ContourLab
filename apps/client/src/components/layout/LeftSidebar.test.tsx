import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LeftSidebar from './LeftSidebar';

vi.mock('../dicom/DicomRepoPanel', () => ({
  default: () => <div data-testid="dicom-repo-panel" />,
}));

vi.mock('../../core/store/uiStore', () => ({
  useUIStore: (selector: (s: { setLeftSidebarOpen: () => void }) => unknown) =>
    selector({ setLeftSidebarOpen: vi.fn() }),
}));

describe('LeftSidebar — Change Requests link', () => {
  it('links to the GitHub new-issue page in a new tab', () => {
    render(<MemoryRouter><LeftSidebar /></MemoryRouter>);

    const link = screen.getByRole('link', { name: 'Change Requests (opens GitHub in a new tab)' }) as HTMLAnchorElement;
    expect(link.href).toBe('https://github.com/itercharles/ContourLab/issues/new/choose');
    expect(link.target).toBe('_blank');
    expect(link.rel).toBe('noopener noreferrer');
    expect(document.querySelector('a[href$="/issues"]')).toBeNull();
  });
});
