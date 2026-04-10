import type { Patient, Study, Series, Instance } from '@webtps/shared-types';

export interface SeriesMetadata {
  patient: Patient;
  study: Study;
  series: Series;
}

// Keyed by seriesInstanceUID
const metadataBySeriesUID = new Map<string, SeriesMetadata>();

export const DicomMetadataStore = {
  set(seriesUID: string, metadata: SeriesMetadata): void {
    metadataBySeriesUID.set(seriesUID, metadata);
  },

  get(seriesUID: string): SeriesMetadata | undefined {
    return metadataBySeriesUID.get(seriesUID);
  },

  getAll(): SeriesMetadata[] {
    return Array.from(metadataBySeriesUID.values());
  },

  clear(): void {
    metadataBySeriesUID.clear();
  },
};

/**
 * Parse minimal DICOM tags from a File using dicom-parser.
 * Returns the tag values needed for metadata grouping.
 */
export async function parseDicomTags(file: File): Promise<{
  sopInstanceUID: string;
  seriesInstanceUID: string;
  studyInstanceUID: string;
  instanceNumber: number;
  sliceLocation: number;
  patientName: string;
  patientID: string;
  studyDate: string;
  studyDescription: string;
  seriesDescription: string;
  modality: string;
  rows: number;
  columns: number;
  pixelSpacing: [number, number];
  sliceThickness: number;
  imagePositionPatient: [number, number, number];
}> {
  const { default: dicomParser } = await import('dicom-parser');

  const buffer = await file.arrayBuffer();
  const byteArray = new Uint8Array(buffer);
  const dataSet = dicomParser.parseDicom(byteArray, { untilTag: '7FE00010' });

  const getString = (tag: string, fallback = '') =>
    (dataSet.string(tag) ?? fallback).trim();

  const getFloat = (tag: string, fallback = 0) =>
    parseFloat(dataSet.string(tag) ?? String(fallback)) || fallback;

  const getInt = (tag: string, fallback = 0) =>
    parseInt(dataSet.string(tag) ?? String(fallback), 10) || fallback;

  const pixelSpacingStr = dataSet.string('x00280030') ?? '1\\1';
  const [rowSpacing, colSpacing] = pixelSpacingStr.split('\\').map(Number);

  const ippStr = dataSet.string('x00200032') ?? '0\\0\\0';
  const [ippX, ippY, ippZ] = ippStr.split('\\').map(Number);

  return {
    sopInstanceUID: getString('x00080018'),
    seriesInstanceUID: getString('x0020000e'),
    studyInstanceUID: getString('x0020000d'),
    instanceNumber: getInt('x00200013', 0),
    sliceLocation: getFloat('x00201041', ippZ),
    patientName: getString('x00100010', 'Anonymous'),
    patientID: getString('x00100020'),
    studyDate: getString('x00080020'),
    studyDescription: getString('x00081030'),
    seriesDescription: getString('x0008103e'),
    modality: getString('x00080060', 'CT'),
    rows: getInt('x00280010', 512),
    columns: getInt('x00280011', 512),
    pixelSpacing: [rowSpacing || 1, colSpacing || 1],
    sliceThickness: getFloat('x00180050', 1),
    imagePositionPatient: [ippX, ippY, ippZ],
  };
}

/**
 * Build shared-types metadata objects from parsed DICOM tags.
 */
export function buildMetadata(
  tags: Awaited<ReturnType<typeof parseDicomTags>>
): { patient: Patient; study: Study; series: Series; instance: Instance } {
  const instance: Instance = {
    sopInstanceUID: tags.sopInstanceUID,
    instanceNumber: tags.instanceNumber,
    sliceLocation: tags.sliceLocation,
  };

  const series: Series = {
    seriesInstanceUID: tags.seriesInstanceUID,
    seriesDescription: tags.seriesDescription,
    modality: tags.modality as Series['modality'],
    instances: [instance],
  };

  const study: Study = {
    studyInstanceUID: tags.studyInstanceUID,
    studyDate: tags.studyDate,
    studyDescription: tags.studyDescription,
    series: [series],
  };

  const patient: Patient = {
    id: tags.patientID || tags.studyInstanceUID,
    mrn: tags.patientID,
    name: { given: '', family: tags.patientName },
    dateOfBirth: '',
    studies: [study],
  };

  return { patient, study, series, instance };
}
