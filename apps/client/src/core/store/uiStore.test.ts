import { describe, it, expect, beforeEach } from 'vitest';
import { useUIStore } from './uiStore';

describe('uiStore - maximize viewport', () => {
  beforeEach(() => {
    useUIStore.setState({
      maximizedViewport: null,
    });
  });

  // @links:SRS-019
  it('toggleMaximizeViewport sets viewport when null', () => {
    const { toggleMaximizeViewport } = useUIStore.getState();

    toggleMaximizeViewport('AXIAL');

    expect(useUIStore.getState().maximizedViewport).toBe('AXIAL');
  });

  // @links:SRS-019
  it('toggleMaximizeViewport clears viewport when same', () => {
    const { toggleMaximizeViewport } = useUIStore.getState();

    toggleMaximizeViewport('AXIAL');
    expect(useUIStore.getState().maximizedViewport).toBe('AXIAL');

    toggleMaximizeViewport('AXIAL');
    expect(useUIStore.getState().maximizedViewport).toBeNull();
  });

  // @links:SRS-019
  it('toggleMaximizeViewport switches viewport', () => {
    const { toggleMaximizeViewport } = useUIStore.getState();

    toggleMaximizeViewport('AXIAL');
    expect(useUIStore.getState().maximizedViewport).toBe('AXIAL');

    toggleMaximizeViewport('SAGITTAL');
    expect(useUIStore.getState().maximizedViewport).toBe('SAGITTAL');
  });

  // @links:SRS-019
  it('resetMaximizeViewport clears viewport', () => {
    const { toggleMaximizeViewport, resetMaximizeViewport } = useUIStore.getState();

    toggleMaximizeViewport('CORONAL');
    expect(useUIStore.getState().maximizedViewport).toBe('CORONAL');

    resetMaximizeViewport();
    expect(useUIStore.getState().maximizedViewport).toBeNull();
  });
});
