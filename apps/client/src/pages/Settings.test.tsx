import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Settings from './Settings';
import * as qaRuleConfig from '../core/qa/qaRuleConfig';

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
  qaRuleConfig.resetQaRuleConfig();
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

    await waitFor(() => expect(mocks.uploadDicomWebStudies).toHaveBeenCalled());
    expect(mocks.uploadDicomWebStudies.mock.calls[0][0]).toEqual([file]);
    expect(screen.getByText('Imported 1 DICOM file into the configured repository.')).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId('dicom-import-status').textContent).toContain('✓ Imported 1 file');
    });
  });

  it('shows progress while importing and an error message on failure', async () => {
    let progressCallback: ((p: { loaded: number; total: number; fileCount: number }) => void) | undefined;
    let resolveUpload: (() => void) | undefined;
    let rejectUpload: ((err: Error) => void) | undefined;
    mocks.uploadDicomWebStudies.mockImplementationOnce((_files, onProgress) => {
      progressCallback = onProgress;
      return new Promise<void>((resolve, reject) => {
        resolveUpload = resolve;
        rejectUpload = reject;
      });
    });

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    const file = new File(['dicom'], 'ct.dcm', { type: 'application/dicom' });
    fireEvent.change(screen.getByLabelText('Import DICOM Files'), { target: { files: [file] } });

    await waitFor(() => expect(progressCallback).toBeDefined());
    act(() => { progressCallback!({ loaded: 512, total: 2048, fileCount: 1 }); });

    const status = await screen.findByTestId('dicom-import-status');
    expect(status.textContent).toContain('Importing 1 file');
    expect(status.textContent).toContain('25%');

    // Now simulate failure
    act(() => { rejectUpload!(new Error('HTTP 500')); });

    await waitFor(() => {
      expect(screen.getByTestId('dicom-import-status').textContent).toContain('HTTP 500');
    });

    // Avoid unused-var lint
    void resolveUpload;
  });

  it('toggles QA rules and resets them', () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    const duplicateRoiRule = screen.getByLabelText('Duplicate ROI name QA rule') as HTMLInputElement;
    expect(duplicateRoiRule.checked).toBe(true);

    fireEvent.click(duplicateRoiRule);
    expect(duplicateRoiRule.checked).toBe(false);
    expect(screen.getByText('QA rule configuration saved for this browser.')).toBeTruthy();
    expect(qaRuleConfig.getQaRuleConfig()['duplicate-roi-name']).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Reset QA Rules' }));
    expect((screen.getByLabelText('Duplicate ROI name QA rule') as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText('QA rule configuration reset to the application default.')).toBeTruthy();
  });

  it('shows product information in the about section', () => {
    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    expect(screen.getByRole('heading', { name: 'About' })).toBeTruthy();
    expect(screen.getByText('Version')).toBeTruthy();
    expect(screen.getByText('0.1.0')).toBeTruthy();
    expect(screen.getByText('Contour review and RTSTRUCT round-trip')).toBeTruthy();
  });
});
