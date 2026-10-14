import { describe, expect, it } from 'vitest';
import { buildMetadata, type NormalizedDicomMetadata } from './DicomMetadataStore';

function tags(patch: Partial<NormalizedDicomMetadata> = {}): NormalizedDicomMetadata {
  return {
    sopInstanceUID: 'sop-1',
    seriesInstanceUID: 'series-1',
    studyInstanceUID: 'study-1',
    instanceNumber: 1,
    sliceLocation: 0,
    patientName: 'Lovelace^Ada',
    patientID: 'MRN-1',
    studyDate: '20260101',
    studyDescription: '',
    seriesDescription: 'CT',
    modality: 'CT',
    rows: 1,
    columns: 1,
    pixelSpacing: [1, 1],
    sliceThickness: 1,
    imagePositionPatient: [0, 0, 0],
    imageOrientationPatient: [1, 0, 0, 0, 1, 0],
    samplesPerPixel: 1,
    photometricInterpretation: 'MONOCHROME2',
    bitsAllocated: 16,
    bitsStored: 16,
    highBit: 15,
    pixelRepresentation: 0,
    transferSyntaxUID: '1.2.840.10008.1.2.1',
    frameOfReferenceUID: '1.2.frame',
    windowCenter: undefined,
    windowWidth: undefined,
    ...patch,
  };
}

describe('buildMetadata patient @links:SRS-010 @testing:T13', () => {
  it('carries the patient ID, birth date and sex of the images', () => {
    const { patient } = buildMetadata(tags({ patientBirthDate: '19601231', patientSex: 'F' }));

    expect(patient.mrn).toBe('MRN-1');
    expect(patient.dateOfBirth).toBe('19601231');
    expect(patient.sex).toBe('F');
  });

  it('leaves the MRN empty, not the study UID, when the images have no Patient ID', () => {
    const { patient } = buildMetadata(tags({ patientID: '' }));

    // The id may still fall back to the study UID for internal use, but the MRN, which is what is
    // exported as the Patient ID, must not.
    expect(patient.mrn).toBe('');
  });
});
