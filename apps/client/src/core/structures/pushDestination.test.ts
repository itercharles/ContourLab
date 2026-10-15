import { describe, expect, it } from 'vitest';
import type { StructureSet } from '@contourlab/shared-types';
import type { LoadedSeries } from '../store/volumeStore';
import { describePushDestination } from './pushDestination';

function loaded(overrides: Partial<LoadedSeries['patient']> = {}): LoadedSeries {
  return {
    seriesUID: 's1',
    cornerstoneVolumeId: 'v1',
    volume: {} as LoadedSeries['volume'],
    patient: {
      id: 'p1',
      mrn: 'MRN-42',
      name: { given: 'Ada', family: 'Lovelace' },
      dateOfBirth: '1815-12-10',
      sex: 'F',
      studies: [],
      ...overrides,
    },
    study: { studyInstanceUID: 'st1', studyDate: '2026-04-11', studyDescription: 'Thorax', series: [] },
    series: {
      seriesInstanceUID: 's1',
      seriesDescription: 'Planning CT',
      modality: 'CT',
      instances: [
        { sopInstanceUID: 'a', instanceNumber: 1 },
        { sopInstanceUID: 'b', instanceNumber: 2 },
      ],
    },
  };
}

const set: StructureSet = { id: 'ss', label: 'RTSTRUCT set', referencedSeriesUID: 's1', structures: [], version: 1 };
const oneStructure: StructureSet = {
  ...set,
  structures: [{ id: 'x', name: 'PTV', type: 'PTV', color: '#f00', visible: true, locked: false, contours: [] } as unknown as StructureSet['structures'][number]],
};
const valueOf = (rows: ReturnType<typeof describePushDestination>, label: string) =>
  rows.find((row) => row.label === label)?.value;

describe('describePushDestination @links:SRS-010', () => {
  it('lists the patient, identifiers, study, series, structure set and repository @testing:T16', () => {
    const rows = describePushDestination(loaded(), set, 'http://repo/dicom-web');

    expect(valueOf(rows, 'Patient')).toBe('Ada Lovelace');
    expect(valueOf(rows, 'Patient ID')).toBe('MRN-42');
    expect(valueOf(rows, 'Born, sex')).toBe('born 1815-12-10, sex F');
    expect(valueOf(rows, 'Study')).toBe('Thorax, 2026-04-11');
    expect(valueOf(rows, 'Image series')).toBe('Planning CT (CT, 2 images)');
    expect(valueOf(rows, 'Structure set')).toBe('RTSTRUCT set (0 structures)');
    expect(valueOf(rows, 'Repository')).toBe('http://repo/dicom-web');
  });

  it('uses the singular for one structure @testing:T16', () => {
    expect(valueOf(describePushDestination(loaded(), oneStructure, 'r'), 'Structure set')).toBe('RTSTRUCT set (1 structure)');
  });

  it('says "not recorded" for what the images do not carry, rather than leaving it blank @testing:T16', () => {
    const rows = describePushDestination(loaded({ mrn: '', dateOfBirth: '', sex: undefined }), set, 'r');

    expect(valueOf(rows, 'Patient ID')).toBe('not recorded');
    expect(valueOf(rows, 'Born, sex')).toBe('not recorded');
  });
});
