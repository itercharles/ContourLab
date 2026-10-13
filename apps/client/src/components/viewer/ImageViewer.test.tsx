import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act } from '@testing-library/react';
import ImageViewer from './ImageViewer';
import { useUIStore } from '../../core/store/uiStore';

vi.mock('../../core/rendering/ViewportManager', () => ({
  ViewportManager: {
    init: vi.fn().mockResolvedValue(undefined),
    getRenderingEngine: vi.fn(() => undefined),
    enableElement: vi.fn().mockResolvedValue(undefined),
    setVolume: vi.fn().mockResolvedValue(undefined),
    setWindowLevel: vi.fn(),
    resize: vi.fn(),
    destroy: vi.fn(),
  },
}));
vi.mock('../../core/rendering/MPRController', () => ({
  VIEWPORT_IDS: { AXIAL: 'viewport-axial', SAGITTAL: 'viewport-sagittal', CORONAL: 'viewport-coronal' },
  MPRController: {
    setup: vi.fn().mockResolvedValue(undefined),
    enableCrosshairs: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
  },
}));
vi.mock('./ContourOverlay', () => ({ default: () => null }));
vi.mock('./ToolOptions', () => ({ default: () => null }));
vi.mock('./ThreeDViewport', () => ({ default: () => <div data-testid="three-d" /> }));

const planarIds = ['viewport-axial', 'viewport-sagittal', 'viewport-coronal'];

function panelOf(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector(`[data-viewport-id="${id}"]`)?.parentElement;
  if (!el) throw new Error(`panel ${id} not mounted`);
  return el;
}

describe('ImageViewer maximize layout @links:SRS-019', () => {
  beforeEach(() => {
    vi.stubGlobal('ResizeObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
    });
    act(() => useUIStore.getState().resetMaximizeViewport());
  });

  it('keeps every panel mounted and only hides the others when maximized, then restores', () => {
    const { container, getByTestId } = render(<ImageViewer />);
    const mounted = planarIds.map((id) => panelOf(container, id));

    act(() => useUIStore.getState().toggleMaximizeViewport('AXIAL'));

    expect(panelOf(container, 'viewport-axial')).toBe(mounted[0]);
    expect(mounted[0].className).toContain('col-span-2');
    expect(mounted[0].classList.contains('hidden')).toBe(false);
    expect(mounted[1].classList.contains('hidden')).toBe(true);
    expect(mounted[2].classList.contains('hidden')).toBe(true);
    expect(getByTestId('three-d').parentElement?.className).toContain('hidden');

    act(() => useUIStore.getState().resetMaximizeViewport());

    planarIds.forEach((id, i) => {
      expect(panelOf(container, id)).toBe(mounted[i]);
      expect(mounted[i].classList.contains('hidden')).toBe(false);
      expect(mounted[i].className).not.toContain('col-span-2');
    });
    expect(getByTestId('three-d').parentElement?.className).not.toContain('hidden');
  });
});
