import type { StructureSet } from '@contourlab/shared-types';
import type { LoadedSeries } from '../store/volumeStore';
import { DicomMetadataStore } from '../dicom/DicomMetadataStore';
import { slicePositionZ } from '../dicom/slicePosition';

const RT_STRUCTURE_SET_STORAGE_UID = '1.2.840.10008.5.1.4.1.1.481.3';
const EXPLICIT_VR_LITTLE_ENDIAN_UID = '1.2.840.10008.1.2.1';
const IMPLEMENTATION_CLASS_UID = '2.25.2026041101';

const IMAGE_STORAGE_UID_BY_MODALITY: Record<string, string> = {
  CT: '1.2.840.10008.5.1.4.1.1.2',
  MR: '1.2.840.10008.5.1.4.1.1.4',
  PT: '1.2.840.10008.5.1.4.1.1.128',
};

function getImageStorageSOPClassUID(modality: string): string {
  return IMAGE_STORAGE_UID_BY_MODALITY[modality] ?? IMAGE_STORAGE_UID_BY_MODALITY.CT;
}

function formatPatientName(name: LoadedSeries['patient']['name']): string {
  return `${name.family || 'Anonymous'}^${name.given || ''}`;
}

function formatDate(date = new Date()): string {
  return date.toISOString().slice(0, 10).replaceAll('-', '');
}

function formatTime(date = new Date()): string {
  return date.toISOString().slice(11, 19).replaceAll(':', '');
}

// RTROIInterpretedType values; the importer maps each of these back to the same structure type.
function mapRoiType(type: string): string {
  switch (type) {
    case 'GTV':
    case 'CTV':
    case 'PTV':
    case 'EXTERNAL':
    case 'AVOIDANCE':
    case 'SUPPORT':
      return type;
    default:
      return 'ORGAN';
  }
}

/** The structure set cannot be exported faithfully; nothing is written. */
export class RtstructExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RtstructExportError';
  }
}

/**
 * The image each contour lies on. A contour that carries no reference (one imported without a
 * ContourImageSequence) is matched to the image at its position; a contour that matches none gets no
 * reference at all, never an empty one.
 */
function referencedImageUID(
  contour: { referencedSOPInstanceUID: string; slicePosition: number },
  instances: LoadedSeries['series']['instances'],
  tolerance_mm: number
): string | undefined {
  if (contour.referencedSOPInstanceUID) return contour.referencedSOPInstanceUID;
  const match = instances.find((instance) => {
    const z = slicePositionZ(instance);
    return z !== undefined && Math.abs(z - contour.slicePosition) <= tolerance_mm;
  });
  return match?.sopInstanceUID;
}

export async function exportRtstructBlob(
  loadedSeries: LoadedSeries,
  structureSet: StructureSet
): Promise<Blob> {
  return (await exportRtstructObject(loadedSeries, structureSet)).blob;
}

export interface ExportedRtstructObject {
  blob: Blob;
  identifiers: {
    studyInstanceUID: string;
    seriesInstanceUID: string;
    sopInstanceUID: string;
    seriesDescription: string;
    seriesDate: string;
    seriesTime: string;
  };
}

export async function exportRtstructObject(
  loadedSeries: LoadedSeries,
  structureSet: StructureSet
): Promise<ExportedRtstructObject> {
  const dcmjs = await import('dcmjs');
  const { DicomMetaDictionary, DicomDict } = dcmjs.data;

  const now = new Date();
  const sopInstanceUID = DicomMetaDictionary.uid();
  const seriesInstanceUID = DicomMetaDictionary.uid();
  const seriesDescription = `RTSTRUCT ${loadedSeries.series.seriesDescription ?? loadedSeries.seriesUID}`;
  const seriesDate = formatDate(now);
  const seriesTime = formatTime(now);
  const imageMetadata = DicomMetadataStore.getFirstImageMetadataForSeries(loadedSeries.seriesUID);
  // The structure set is tied to the images by the frame of reference and the patient. If either is
  // missing it is refused rather than made up: a random frame of reference matches no image, and a
  // study UID used as the patient ID files the structure set under a different patient.
  const referencedFrameOfReferenceUID = imageMetadata?.frameOfReferenceUID?.trim();
  if (!referencedFrameOfReferenceUID) {
    throw new RtstructExportError(
      'The image series has no Frame of Reference UID (0020,0052), so the structure set cannot be tied to it. Nothing was exported.'
    );
  }
  const patientId = loadedSeries.patient.mrn?.trim();
  if (!patientId) {
    throw new RtstructExportError(
      'The images carry no Patient ID (0010,0020), so the repository would file the structure set under another patient. Nothing was exported.'
    );
  }
  const contourTolerance_mm = Math.max((loadedSeries.volume.spacing[2] || 1) / 2, 0.01);
  const referencedSOPClassUID = getImageStorageSOPClassUID(loadedSeries.series.modality);
  const referencedImages = loadedSeries.series.instances.map((instance) => ({
    ReferencedSOPClassUID: referencedSOPClassUID,
    ReferencedSOPInstanceUID: instance.sopInstanceUID,
  }));

  const structureSetROISequence = structureSet.structures.map((structure, index) => ({
    ROINumber: index + 1,
    ReferencedFrameOfReferenceUID: referencedFrameOfReferenceUID,
    ROIName: structure.name,
    ROIGenerationAlgorithm: 'MANUAL',
  }));

  const roiContourSequence = structureSet.structures.map((structure, index) => ({
    ReferencedROINumber: index + 1,
    ROIDisplayColor: structure.color,
    ContourSequence: structure.contours.map((contour) => {
      const imageUID = referencedImageUID(contour, loadedSeries.series.instances, contourTolerance_mm);
      return {
        ContourGeometricType: 'CLOSED_PLANAR',
        NumberOfContourPoints: contour.points.length / 3,
        ContourData: Array.from(contour.points),
        ...(imageUID
          ? { ContourImageSequence: [{ ReferencedSOPClassUID: referencedSOPClassUID, ReferencedSOPInstanceUID: imageUID }] }
          : {}),
      };
    }),
  }));

  const rtRoiObservationsSequence = structureSet.structures.map((structure, index) => ({
    ObservationNumber: index + 1,
    ReferencedROINumber: index + 1,
    ROIObservationLabel: structure.name,
    RTROIInterpretedType: mapRoiType(structure.type),
    ROIInterpreter: '',
  }));
  const predecessorStructureSetSequence =
    structureSet.source?.type === 'rtstruct' && structureSet.source.sopInstanceUID
      ? [{
          ReferencedSOPClassUID: structureSet.source.sopClassUID ?? RT_STRUCTURE_SET_STORAGE_UID,
          ReferencedSOPInstanceUID: structureSet.source.sopInstanceUID,
        }]
      : undefined;

  const dataset = {
    SOPClassUID: RT_STRUCTURE_SET_STORAGE_UID,
    SOPInstanceUID: sopInstanceUID,
    StudyInstanceUID: loadedSeries.study.studyInstanceUID,
    SeriesInstanceUID: seriesInstanceUID,
    Modality: 'RTSTRUCT',
    SeriesDescription: seriesDescription,
    StructureSetLabel: structureSet.label.slice(0, 16) || 'RTSTRUCT',
    StructureSetName: structureSet.label,
    StructureSetDate: seriesDate,
    StructureSetTime: seriesTime,
    SeriesDate: seriesDate,
    SeriesTime: seriesTime,
    ContentDate: seriesDate,
    ContentTime: seriesTime,
    InstanceCreationDate: seriesDate,
    InstanceCreationTime: seriesTime,
    PatientName: formatPatientName(loadedSeries.patient.name),
    PatientID: patientId,
    PatientBirthDate: loadedSeries.patient.dateOfBirth?.replaceAll('-', '') || '',
    PatientSex: loadedSeries.patient.sex ?? '',
    StudyDate: loadedSeries.study.studyDate?.replaceAll('-', '') || formatDate(now),
    StudyDescription: loadedSeries.study.studyDescription ?? '',
    SeriesNumber: 500,
    InstanceNumber: 1,
    Manufacturer: 'ContourLab',
    ReferencedFrameOfReferenceSequence: [
      {
        FrameOfReferenceUID: referencedFrameOfReferenceUID,
        RTReferencedStudySequence: [
          {
            ReferencedSOPClassUID: '1.2.840.10008.3.1.2.3.2',
            ReferencedSOPInstanceUID: loadedSeries.study.studyInstanceUID,
            RTReferencedSeriesSequence: [
              {
                SeriesInstanceUID: loadedSeries.seriesUID,
                ContourImageSequence: referencedImages,
              },
            ],
          },
        ],
      },
    ],
    ...(predecessorStructureSetSequence ? {
      PredecessorStructureSetSequence: predecessorStructureSetSequence,
    } : {}),
    StructureSetROISequence: structureSetROISequence,
    ROIContourSequence: roiContourSequence,
    RTROIObservationsSequence: rtRoiObservationsSequence,
  };

  const meta = {
    FileMetaInformationVersion: new Uint8Array([0, 1]).buffer,
    MediaStorageSOPClassUID: RT_STRUCTURE_SET_STORAGE_UID,
    MediaStorageSOPInstanceUID: sopInstanceUID,
    TransferSyntaxUID: EXPLICIT_VR_LITTLE_ENDIAN_UID,
    ImplementationClassUID: IMPLEMENTATION_CLASS_UID,
    ImplementationVersionName: 'CONTOURLAB_1',
  };

  const dicomDict = new DicomDict(DicomMetaDictionary.denaturalizeDataset(meta));
  dicomDict.dict = DicomMetaDictionary.denaturalizeDataset(dataset);
  const buffer = dicomDict.write();

  return {
    blob: new Blob([buffer], { type: 'application/dicom' }),
    identifiers: {
      studyInstanceUID: loadedSeries.study.studyInstanceUID,
      seriesInstanceUID,
      sopInstanceUID,
      seriesDescription,
      seriesDate,
      seriesTime,
    },
  };
}

export function getRtstructFilename(loadedSeries: LoadedSeries, structureSet: StructureSet): string {
  const seriesPart = (loadedSeries.series.seriesDescription ?? loadedSeries.seriesUID)
    .replace(/[^a-z0-9_-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  const structurePart = structureSet.label
    .replace(/[^a-z0-9_-]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 24);

  return `${seriesPart || 'series'}-${structurePart || 'rtstruct'}.dcm`;
}
