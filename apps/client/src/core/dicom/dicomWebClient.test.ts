import { beforeEach, describe, expect, it } from 'vitest';
import {
  __testables__,
  getDefaultDicomWebBaseUrl,
  getDicomWebBaseUrl,
  resetDicomWebBaseUrl,
  setDicomWebBaseUrl,
} from './dicomWebClient';

beforeEach(() => {
  resetDicomWebBaseUrl();
});

describe('dicomWebClient summary parsing', () => {
  it('uses a browser-local DICOMweb endpoint override when configured @links:SRS-002', () => {
    expect(getDicomWebBaseUrl()).toBe(getDefaultDicomWebBaseUrl());

    setDicomWebBaseUrl('/orthanc/dicom-web/');

    expect(getDicomWebBaseUrl()).toBe('/orthanc/dicom-web');

    resetDicomWebBaseUrl();

    expect(getDicomWebBaseUrl()).toBe(getDefaultDicomWebBaseUrl());
  });

  it('routes the local Orthanc development endpoint through the same-origin proxy @links:SRS-002', () => {
    setDicomWebBaseUrl('http://localhost:8042/dicom-web/');

    expect(getDicomWebBaseUrl()).toBe('/dicom-web');
  });

  it('extracts patient, study, and series fields from DICOMweb QIDO rows @links:SRS-001', () => {
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

  it('keeps planning CT series and excludes non-planning modalities or CBCT-like series @links:SRS-021', () => {
    expect(__testables__.isPlanningCtSeries({
      patientId: 'MRN-1',
      patientName: 'DOE^JANE',
      studyDate: '20260411',
      studyDescription: 'CT Simulation',
      studyInstanceUID: 'study-1',
      seriesDescription: 'CT SIM AXIAL 2.5mm',
      seriesInstanceUID: 'series-1',
      modality: 'CT',
      instanceCount: 128,
    })).toBe(true);

    expect(__testables__.isPlanningCtSeries({
      patientId: 'MRN-1',
      patientName: 'DOE^JANE',
      studyDate: '20260411',
      studyDescription: 'MR Simulation',
      studyInstanceUID: 'study-1',
      seriesDescription: 'MR T2',
      seriesInstanceUID: 'series-2',
      modality: 'MR',
      instanceCount: 64,
    })).toBe(false);

    expect(__testables__.isPlanningCtSeries({
      patientId: 'MRN-1',
      patientName: 'DOE^JANE',
      studyDate: '20260411',
      studyDescription: 'Treatment CBCT',
      studyInstanceUID: 'study-1',
      seriesDescription: 'CBCT Pelvis',
      seriesInstanceUID: 'series-3',
      modality: 'CT',
      instanceCount: 64,
    })).toBe(false);
  });

  it('extracts a DICOM object from a multipart WADO-RS response @links:SRS-002', () => {
    const encoder = new TextEncoder();
    const payload = new Uint8Array([1, 2, 3, 4]);
    const prefix = encoder.encode(
      '--boundary-1\r\nContent-Type: application/dicom\r\n\r\n'
    );
    const suffix = encoder.encode('\r\n--boundary-1--\r\n');
    const multipart = new Uint8Array(prefix.length + payload.length + suffix.length);
    multipart.set(prefix, 0);
    multipart.set(payload, prefix.length);
    multipart.set(suffix, prefix.length + payload.length);

    const extracted = __testables__.extractDicomPart(
      multipart.buffer,
      'multipart/related; type=application/dicom; boundary=boundary-1'
    );

    expect(Array.from(new Uint8Array(extracted))).toEqual([1, 2, 3, 4]);
  });

  it('extracts referenced image series from RTSTRUCT metadata @links:SRS-001', () => {
    const metadata = {
      '30060010': {
        Value: [
          {
            '30060012': {
              Value: [
                {
                  '30060014': {
                    Value: [
                      {
                        '0020000E': { Value: ['series-a'] },
                        '30060016': {
                          Value: [
                            { '00081155': { Value: ['image-1'] } },
                          ],
                        },
                      },
                      {
                        '0020000E': { Value: ['series-b'] },
                        '30060016': { Value: [] },
                      },
                    ],
                  },
                },
              ],
            },
          },
        ],
      },
    };

    expect(__testables__.getRtstructReferencedSeriesInstanceUIDs(metadata)).toEqual([
      'series-a',
      'series-b',
    ]);
  });
});
