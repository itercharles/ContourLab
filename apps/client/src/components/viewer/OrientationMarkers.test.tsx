import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import OrientationMarkers from './OrientationMarkers';

const state = vi.hoisted(() => ({
  camera: undefined as { viewUp?: unknown; viewPlaneNormal?: unknown } | undefined,
}));

vi.mock('../../core/rendering/ViewportManager', () => ({
  ViewportManager: {
    getRenderingEngine: () => ({
      getViewport: () => (state.camera ? { getCamera: () => state.camera } : undefined),
    }),
  },
}));

const AXIAL = { viewUp: [0, -1, 0], viewPlaneNormal: [0, 0, -1] };
const text = (edge: string) => document.querySelector(`[data-orientation="${edge}"]`)?.textContent;

beforeEach(() => {
  state.camera = AXIAL;
});
afterEach(cleanup);

describe('OrientationMarkers @links:SRS-034 @testing:T2', () => {
  it('shows a letter on each edge read from the viewport camera', () => {
    render(<OrientationMarkers viewportId="viewport-axial" viewportElement={document.createElement('div')} />);

    expect(screen.getByRole('group', { name: 'Patient orientation' })).toBeTruthy();
    expect([text('top'), text('bottom'), text('left'), text('right')]).toEqual(['A', 'P', 'R', 'L']);
  });

  it('draws nothing when the camera cannot be read, rather than guess', () => {
    state.camera = undefined;
    render(<OrientationMarkers viewportId="viewport-axial" viewportElement={document.createElement('div')} />);
    expect(screen.queryByRole('group', { name: 'Patient orientation' })).toBeNull();

    state.camera = { viewUp: [0, -1], viewPlaneNormal: [0, 0, -1] };
    cleanup();
    render(<OrientationMarkers viewportId="viewport-axial" viewportElement={document.createElement('div')} />);
    expect(screen.queryByRole('group', { name: 'Patient orientation' })).toBeNull();
  });

  it('updates when the viewport renders with a different camera', () => {
    const element = document.createElement('div');
    render(<OrientationMarkers viewportId="viewport-axial" viewportElement={element} />);
    expect(text('top')).toBe('A');

    state.camera = { viewUp: [0, 0, 1], viewPlaneNormal: [0, -1, 0] };
    act(() => {
      element.dispatchEvent(new Event('CORNERSTONE_IMAGE_RENDERED'));
    });

    expect([text('top'), text('bottom'), text('left'), text('right')]).toEqual(['S', 'I', 'R', 'L']);
  });

  it('appears once the viewport exists, if it did not at first', () => {
    state.camera = undefined;
    const element = document.createElement('div');
    render(<OrientationMarkers viewportId="viewport-axial" viewportElement={element} />);
    expect(screen.queryByRole('group', { name: 'Patient orientation' })).toBeNull();

    state.camera = AXIAL;
    act(() => {
      element.dispatchEvent(new Event('CORNERSTONE_CAMERA_MODIFIED'));
    });

    expect(text('right')).toBe('L');
  });

  it('shows the patient position only when it is given', () => {
    const { rerender } = render(
      <OrientationMarkers viewportId="viewport-axial" viewportElement={document.createElement('div')} />
    );
    expect(text('position')).toBeUndefined();

    rerender(
      <OrientationMarkers viewportId="viewport-axial" viewportElement={document.createElement('div')} patientPosition="FFS" />
    );
    expect(text('position')).toBe('FFS');
  });

  it('stops listening when it is removed', () => {
    const element = document.createElement('div');
    const remove = vi.spyOn(element, 'removeEventListener');
    const { unmount } = render(<OrientationMarkers viewportId="viewport-axial" viewportElement={element} />);

    unmount();

    expect(remove).toHaveBeenCalledWith('CORNERSTONE_IMAGE_RENDERED', expect.any(Function));
    expect(remove).toHaveBeenCalledWith('CORNERSTONE_CAMERA_MODIFIED', expect.any(Function));
  });
});
