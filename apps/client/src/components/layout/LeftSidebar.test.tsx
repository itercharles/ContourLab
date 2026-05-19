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

describe('LeftSidebar — Issues nav link', () => {
  it('renders the Issues nav link with title and aria-label "Change Requests"', () => {
    render(<MemoryRouter><LeftSidebar /></MemoryRouter>);

    const link = screen.getByRole('link', { name: 'Change Requests' });
    expect(link).toBeTruthy();
    expect((link as HTMLAnchorElement).title).toBe('Change Requests');
  });
});
