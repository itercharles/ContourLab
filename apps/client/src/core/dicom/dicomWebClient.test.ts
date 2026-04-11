import { describe, expect, it } from 'vitest';
import { __testables__ } from './dicomWebClient';

describe('dicomWebClient summary parsing', () => {
  it('extracts patient, study, and series fields from DICOMweb QIDO rows', () => {
    const rows = [
      {
        '00100010': { Value: [{ Alphabetic: 'DOE^JANE' }] },
        '00100020': { Value: ['MRN-1'] },
        '00080020': { Value: ['20260411'] },
        '00081030': { Value: ['Chest CT'] },
        '0008103E': { Value: ['Axial'] },
        '00080060': { Value: ['CT'] },
        '0020000D': { Value: ['study-1'] },
        '0020000E': { Value: ['series-1'] },
        '00201209': { Value: [128] },
      },
    ];

    expect(__testables__.buildSeriesSummaries(rows)).toEqual([
      {
        patientId: 'MRN-1',
        patientName: 'DOE^JANE',
        studyDate: '20260411',
        studyDescription: 'Chest CT',
        studyInstanceUID: 'study-1',
        seriesDescription: 'Axial',
        seriesInstanceUID: 'series-1',
        modality: 'CT',
        instanceCount: 128,
      },
    ]);
  });
});
