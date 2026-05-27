import type { Patient, Study, Series, Instance } from '@contourlab/shared-types';

export interface SeriesMetadata {
  patient: Patient;
  study: Study;
  series: Series;
}

// Per-imageId metadata for Cornerstone3D's metadata provider
export interface ImageMetadata {
  // imagePixelModule
  samplesPerPixel: number;
  photometricInterpretation: string;
  rows: number;
  columns: number;
  bitsAllocated: number;
  bitsStored: number;
  highBit: number;
  pixelRepresentation: number;
  // imagePlaneModule
  imageOrientationPatient: number[];
  imagePositionPatient: number[];
  rowPixelSpacing: number;
  columnPixelSpacing: number;
  sliceThickness: number;
  sliceLocation: number;
  frameOfReferenceUID: string;
  // generalSeriesModule
  modality: string;
  seriesInstanceUID: string;
  // transferSyntax
  transferSyntaxUID: string;
  // voiLutModule (optional)
  windowCenter?: number;
  windowWidth?: number;
}

export interface NormalizedDicomMetadata {
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
  bodyPartExamined?: string;
  modality: string;
  rows: number;
  columns: number;
  pixelSpacing: [number, number];
  sliceThickness: number;
  imagePositionPatient: [number, number, number];
  imageOrientationPatient: number[];
  samplesPerPixel: number;
  photometricInterpretation: string;
  bitsAllocated: number;
  bitsStored: number;
  highBit: number;
  pixelRepresentation: number;
  transferSyntaxUID: string;
  frameOfReferenceUID: string;
  windowCenter: number | undefined;
  windowWidth: number | undefined;
}

// Keyed by seriesInstanceUID
const metadataBySeriesUID = new Map<string, SeriesMetadata>();

// Keyed by imageId
const metadataByImageId = new Map<string, ImageMetadata>();

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

  setImageMetadata(imageId: string, meta: ImageMetadata): void {
    metadataByImageId.set(imageId, meta);
  },

  getImageMetadata(imageId: string): ImageMetadata | undefined {
    return metadataByImageId.get(imageId);
  },

  getFirstImageMetadataForSeries(seriesUID: string): ImageMetadata | undefined {
    for (const meta of metadataByImageId.values()) {
      if (meta.seriesInstanceUID === seriesUID) {
        return meta;
      }
    }

    return undefined;
  },

  clearImageMetadata(): void {
    metadataByImageId.clear();
  },
};

/**
 * Cornerstone3D metadata provider backed by our pre-parsed DICOM tags.
 * Register this with `metaData.addProvider(cornerstoneMetadataProvider, 10000)`
 * (high priority so it runs before the wadouri fallback provider).
 */
export function cornerstoneMetadataProvider(type: string, imageId: string): unknown {
  const meta = metadataByImageId.get(imageId);
  if (!meta) return undefined;

  switch (type) {
    case 'imagePixelModule':
      return {
        samplesPerPixel: meta.samplesPerPixel,
        photometricInterpretation: meta.photometricInterpretation,
        rows: meta.rows,
        columns: meta.columns,
        bitsAllocated: meta.bitsAllocated,
        bitsStored: meta.bitsStored,
        highBit: meta.highBit,
        pixelRepresentation: meta.pixelRepresentation,
      };

    case 'imagePlaneModule':
      return {
        frameOfReferenceUID: meta.frameOfReferenceUID,
        rows: meta.rows,
        columns: meta.columns,
        imageOrientationPatient: meta.imageOrientationPatient,
        rowCosines: meta.imageOrientationPatient.slice(0, 3),
        columnCosines: meta.imageOrientationPatient.slice(3, 6),
        imagePositionPatient: meta.imagePositionPatient,
        pixelSpacing: [meta.rowPixelSpacing, meta.columnPixelSpacing],
        rowPixelSpacing: meta.rowPixelSpacing,
        columnPixelSpacing: meta.columnPixelSpacing,
        sliceThickness: meta.sliceThickness,
        sliceLocation: meta.sliceLocation,
      };

    case 'generalSeriesModule':
      return {
        modality: meta.modality,
        seriesInstanceUID: meta.seriesInstanceUID,
      };

    case 'transferSyntax':
      return { transferSyntaxUID: meta.transferSyntaxUID };

    case 'voiLutModule':
      if (meta.windowCenter !== undefined && meta.windowWidth !== undefined) {
        return { windowCenter: meta.windowCenter, windowWidth: meta.windowWidth };
      }
      // Some CT exports omit the WindowCenter / WindowWidth DICOM tags
      // entirely. When that happens Cornerstone3D's setDefaultVolumeVOI
      // falls back to fetching the middle slice with `ignoreCache: true`
      // and computing min/max — and that fetch contends with the 199
      // in-flight streaming requests for the volume, blocking the
      // viewport.setVolumes() promise for several seconds on cold load.
      // Hand it a modality-appropriate default so the slow path is never
      // taken.
      //
      // These are first-paint placeholders, not clinical presets. CT 40/400
      // is soft-tissue (thorax/abdomen); head CTs would prefer 35/80
      // (brain) or 600/2800 (bone), MR varies by sequence. Users adjust
      // windowing from the toolbar's W/L preset menu after load.
      if (meta.modality === 'CT') {
        return { windowCenter: 40, windowWidth: 400 };
      }
      if (meta.modality === 'MR') {
        return { windowCenter: 600, windowWidth: 1500 };
      }
      return undefined;

    default:
      return undefined;
  }
}

/**
 * Parse minimal DICOM tags from a File using dicom-parser.
 * Returns the tag values needed for metadata grouping and Cornerstone3D metadata.
 */
export async function parseDicomTags(file: File): Promise<NormalizedDicomMetadata> {
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

  const getUint16 = (tag: string, fallback = 0): number =>
    dataSet.uint16(tag) ?? fallback;

  const pixelSpacingStr = dataSet.string('x00280030') ?? '1\\1';
  const [rowSpacing, colSpacing] = pixelSpacingStr.split('\\').map(Number);

  const ippStr = dataSet.string('x00200032') ?? '0\\0\\0';
  const [ippX, ippY, ippZ] = ippStr.split('\\').map(Number);

  const iopStr = dataSet.string('x00200037') ?? '1\\0\\0\\0\\1\\0';
  const imageOrientationPatient = iopStr.split('\\').map(Number);

  const rows = getUint16('x00280010', 512);
  const columns = getUint16('x00280011', 512);
  const bitsAllocated = getUint16('x00280100', 16);
  const bitsStored = getUint16('x00280101', bitsAllocated);
  const highBit = getUint16('x00280102', bitsStored - 1);
  const pixelRepresentation = getUint16('x00280103', 0);

  // Transfer syntax is in the File Meta Information (group 0002)
  const transferSyntaxUID = getString('x00020010', '1.2.840.10008.1.2.1'); // default: explicit VR little endian

  const wcStr = dataSet.string('x00281050');
  const wwStr = dataSet.string('x00281051');
  const windowCenter = wcStr ? parseFloat(wcStr.split('\\')[0]) : undefined;
  const windowWidth = wwStr ? parseFloat(wwStr.split('\\')[0]) : undefined;

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
    bodyPartExamined: getString('x00180015') || undefined,
    modality: getString('x00080060', 'CT'),
    rows,
    columns,
    pixelSpacing: [rowSpacing || 1, colSpacing || 1],
    sliceThickness: getFloat('x00180050', 1),
    imagePositionPatient: [ippX, ippY, ippZ],
    imageOrientationPatient,
    samplesPerPixel: getUint16('x00280002', 1),
    photometricInterpretation: getString('x00280004', 'MONOCHROME2'),
    bitsAllocated,
    bitsStored,
    highBit,
    pixelRepresentation,
    transferSyntaxUID,
    frameOfReferenceUID: getString('x00200052'),
    windowCenter,
    windowWidth,
  };
}

export function buildImageMetadata(tags: NormalizedDicomMetadata): ImageMetadata {
  return {
    samplesPerPixel: tags.samplesPerPixel,
    photometricInterpretation: tags.photometricInterpretation,
    rows: tags.rows,
    columns: tags.columns,
    bitsAllocated: tags.bitsAllocated,
    bitsStored: tags.bitsStored,
    highBit: tags.highBit,
    pixelRepresentation: tags.pixelRepresentation,
    imageOrientationPatient: tags.imageOrientationPatient,
    imagePositionPatient: tags.imagePositionPatient,
    rowPixelSpacing: tags.pixelSpacing[0],
    columnPixelSpacing: tags.pixelSpacing[1],
    sliceThickness: tags.sliceThickness,
    sliceLocation: tags.sliceLocation,
    frameOfReferenceUID: tags.frameOfReferenceUID,
    modality: tags.modality,
    seriesInstanceUID: tags.seriesInstanceUID,
    transferSyntaxUID: tags.transferSyntaxUID,
    windowCenter: tags.windowCenter,
    windowWidth: tags.windowWidth,
  };
}

/**
 * Build shared-types metadata objects from parsed DICOM tags.
 */
export function buildMetadata(
  tags: NormalizedDicomMetadata
): { patient: Patient; study: Study; series: Series; instance: Instance } {
  const instance: Instance = {
    sopInstanceUID: tags.sopInstanceUID,
    instanceNumber: tags.instanceNumber,
    sliceLocation: tags.sliceLocation,
    imagePositionZ: tags.imagePositionPatient[2],
  };

  const series: Series = {
    seriesInstanceUID: tags.seriesInstanceUID,
    seriesDescription: tags.seriesDescription,
    bodyPartExamined: tags.bodyPartExamined,
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
