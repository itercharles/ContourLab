import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Settings from './Settings';
import { version } from '../../package.json';
import * as qaRuleConfig from '../core/qa/qaRuleConfig';

const mocks = vi.hoisted(() => ({
  getDefaultDicomWebBaseUrl: vi.fn(() => '/dicom-web'),
  getDicomWebBaseUrl: vi.fn(() => '/dicom-web'),
  getOrthancUiUrl: vi.fn(() => 'http://localhost:8042/ui/app/index.html'),
  resetDicomWebBaseUrl: vi.fn(),
  setDicomWebBaseUrl: vi.fn(),
}));

vi.mock('../core/dicom/dicomWebClient', () => ({
  getDefaultDicomWebBaseUrl: mocks.getDefaultDicomWebBaseUrl,
  getDicomWebBaseUrl: mocks.getDicomWebBaseUrl,
  getOrthancUiUrl: mocks.getOrthancUiUrl,
  resetDicomWebBaseUrl: mocks.resetDicomWebBaseUrl,
  setDicomWebBaseUrl: mocks.setDicomWebBaseUrl,
}));

beforeEach(() => {
  vi.clearAllMocks();
  qaRuleConfig.resetQaRuleConfig();
  mocks.getDicomWebBaseUrl.mockReturnValue('/dicom-web');
  mocks.getOrthancUiUrl.mockReturnValue('http://localhost:8042/ui/app/index.html');
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

  it('opens the Orthanc UI in a new tab when Import DICOM Files is clicked', () => {
    mocks.getOrthancUiUrl.mockReturnValue('http://10.140.115.109:8042/ui/app/index.html');
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);

    render(
      <MemoryRouter>
        <Settings />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Import DICOM Files/i }));

    expect(openSpy).toHaveBeenCalledWith(
      'http://10.140.115.109:8042/ui/app/index.html',
      '_blank',
      'noopener,noreferrer',
    );
    expect(screen.getByText('http://10.140.115.109:8042/ui/app/index.html')).toBeTruthy();

    openSpy.mockRestore();
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
    expect(screen.getByText(version)).toBeTruthy();
    expect(screen.getByText('Contour review and RTSTRUCT round-trip')).toBeTruthy();
  });
});
