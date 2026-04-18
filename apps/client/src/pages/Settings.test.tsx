import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Settings from './Settings';

const mocks = vi.hoisted(() => ({
  getDefaultDicomWebBaseUrl: vi.fn(() => '/dicom-web'),
  getDicomWebBaseUrl: vi.fn(() => '/dicom-web'),
  resetDicomWebBaseUrl: vi.fn(),
  setDicomWebBaseUrl: vi.fn(),
  uploadDicomWebStudies: vi.fn(),
}));

vi.mock('../core/dicom/dicomWebClient', () => ({
  getDefaultDicomWebBaseUrl: mocks.getDefaultDicomWebBaseUrl,
  getDicomWebBaseUrl: mocks.getDicomWebBaseUrl,
  resetDicomWebBaseUrl: mocks.resetDicomWebBaseUrl,
  setDicomWebBaseUrl: mocks.setDicomWebBaseUrl,
  uploadDicomWebStudies: mocks.uploadDicomWebStudies,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getDicomWebBaseUrl.mockReturnValue('/dicom-web');
  mocks.uploadDicomWebStudies.mockResolvedValue(undefined);
});

describe('Settings', () => {
  it('saves the DICOMweb repository endpoint', () => {
    mocks.getDicomWebBaseUrl
      .mockReturnValueOnce('/dicom-web')
      .mockReturnValue('/orthanc/dicom-web');

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    fireEvent.change(screen.getByLabelText('DICOMweb endpoint'), {
      target: { value: '/orthanc/dicom-web' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    expect(mocks.setDicomWebBaseUrl).toHaveBeenCalledWith('/orthanc/dicom-web');
    expect(screen.getByDisplayValue('/orthanc/dicom-web')).toBeTruthy();
    expect(screen.getByText('DICOM repository endpoint saved for this browser.')).toBeTruthy();
  });

  it('imports DICOM files into the configured repository', async () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    const file = new File(['dicom'], 'ct.dcm', { type: 'application/dicom' });
    fireEvent.change(screen.getByLabelText('Import DICOM Files'), {
      target: { files: [file] },
    });

    await waitFor(() => expect(mocks.uploadDicomWebStudies).toHaveBeenCalledWith([file]));
    expect(screen.getByText('Imported 1 DICOM file into the configured repository.')).toBeTruthy();
  });
});
