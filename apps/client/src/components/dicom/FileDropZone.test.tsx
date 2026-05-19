import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import FileDropZone from './FileDropZone';
import { useVolumeStore } from '../../core/store/volumeStore';

// ── module mocks ──────────────────────────────────────────────────────────────

const mocks = vi.hoisted(() => ({
  loadFiles: vi.fn(),
  buildVolume: vi.fn(),
}));

vi.mock('../../core/dicom/DicomLoader', () => ({
  loadFiles: mocks.loadFiles,
}));

vi.mock('../../core/dicom/VolumeBuilder', () => ({
  buildVolume: mocks.buildVolume,
}));

// ── helpers ───────────────────────────────────────────────────────────────────

function makeFile(name = 'slice.dcm'): File {
  return new File(['DICM'], name, { type: 'application/dicom' });
}

function triggerFileInput(file: File) {
  const input = document.querySelector('input[type="file"]') as HTMLInputElement;
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

beforeEach(() => {
  vi.clearAllMocks();
  useVolumeStore.setState({ loadedSeries: [], activeSeriesUID: null, isLoading: false, loadError: null });
});

// ── tests ─────────────────────────────────────────────────────────────────────

describe('FileDropZone', () => {
  it('renders the default drop prompt', () => {
    render(<FileDropZone />);
    expect(screen.getByText(/drop folder or files/i)).toBeTruthy();
  });

  it('shows "✓ N series loaded" after successful import', async () => {
    mocks.loadFiles.mockResolvedValue([{ seriesUID: 'uid-1' }, { seriesUID: 'uid-2' }]);
    mocks.buildVolume.mockResolvedValue({ seriesUID: 'uid-1', cornerstoneVolumeId: 'v1' });

    render(<FileDropZone />);
    triggerFileInput(makeFile());

    await waitFor(() => {
      expect(screen.getByText(/✓ 2 series loaded/)).toBeTruthy();
    });
  });

  it('success message disappears after 3 seconds', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });

    mocks.loadFiles.mockResolvedValue([{ seriesUID: 'uid-1' }]);
    mocks.buildVolume.mockResolvedValue({ seriesUID: 'uid-1', cornerstoneVolumeId: 'v1' });

    render(<FileDropZone />);
    triggerFileInput(makeFile());

    // Wait for success with real-time polling (shouldAdvanceTime: true keeps real async working)
    await waitFor(() => {
      expect(screen.getByText(/✓ 1 series loaded/)).toBeTruthy();
    });

    act(() => { vi.advanceTimersByTime(3000); });

    expect(screen.queryByText(/series loaded/)).toBeFalsy();

    vi.useRealTimers();
  });

  it('sets store error when loadFiles returns no valid series', async () => {
    mocks.loadFiles.mockResolvedValue([]);

    render(<FileDropZone />);
    triggerFileInput(makeFile());

    await waitFor(() => {
      expect(useVolumeStore.getState().loadError).toBe('No valid DICOM files found');
    });
  });

  it('sets store error when loadFiles throws', async () => {
    mocks.loadFiles.mockRejectedValue(new Error('corrupt file'));

    render(<FileDropZone />);
    triggerFileInput(makeFile());

    await waitFor(() => {
      expect(useVolumeStore.getState().loadError).toBe('corrupt file');
    });
  });

  it('shows "Building volumes…" label during buildVolume phase', async () => {
    const series = [{ seriesUID: 'uid-1' }, { seriesUID: 'uid-2' }];
    mocks.loadFiles.mockResolvedValue(series);

    let resolveFirst!: (v: unknown) => void;
    mocks.buildVolume
      .mockImplementationOnce(() => new Promise((res) => { resolveFirst = res; }))
      .mockResolvedValue({ seriesUID: 'uid-2', cornerstoneVolumeId: 'v2' });

    render(<FileDropZone />);
    triggerFileInput(makeFile());

    await waitFor(() => {
      expect(screen.getByText(/Building volumes… 1\/2/)).toBeTruthy();
    });

    // Unblock so the component can finish cleanly
    act(() => { resolveFirst({ seriesUID: 'uid-1', cornerstoneVolumeId: 'v1' }); });
  });
});
