import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from './App';

vi.mock('./core/rendering/cornerstoneInit', () => ({
  cornerstoneInit: vi.fn(() => Promise.resolve()),
}));

vi.mock('./components/viewer/ImageViewer', () => ({
  default: () => <div aria-label="Image viewer" />,
}));

vi.mock('./components/viewer/ToolRail', () => ({
  default: () => <div aria-label="Tool rail" />,
}));

vi.mock('./components/layout/LeftSidebar', () => ({
  default: () => <div aria-label="Left sidebar" />,
}));

vi.mock('./components/layout/RightSidebar', () => ({
  default: () => <div aria-label="Right sidebar" />,
}));

vi.mock('./components/layout/StatusBar', () => ({
  default: () => <div aria-label="Status bar" />,
}));

describe('App routing', () => {
  it('renders the workspace route', () => {
    render(
      <MemoryRouter initialEntries={['/workspace']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByText('ContourLab')).toBeTruthy();
    expect(screen.getByLabelText('Image viewer')).toBeTruthy();
  });

  it('renders the settings route directly', () => {
    render(
      <MemoryRouter initialEntries={['/settings']}>
        <App />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'Settings' })).toBeTruthy();
    expect(screen.queryByLabelText('Image viewer')).toBeNull();
  });
});
