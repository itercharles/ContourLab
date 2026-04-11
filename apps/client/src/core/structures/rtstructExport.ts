import type { StructureSet } from '@webtps/shared-types';
import type { LoadedSeries } from '../store/volumeStore';
import { DicomMetadataStore } from '../dicom/DicomMetadataStore';

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

function mapRoiType(type: string): string {
  switch (type) {
    case 'GTV':
    case 'CTV':
    case 'PTV':
      return type;
    case 'EXTERNAL':
      return 'EXTERNAL';
    default:
      return 'ORGAN';
  }
}

export async function exportRtstructBlob(
  loadedSeries: LoadedSeries,
  structureSet: StructureSet
): Promise<Blob> {
  const dcmjs = await import('dcmjs');
  const { DicomMetaDictionary, DicomDict } = dcmjs.data;

  const now = new Date();
  const sopInstanceUID = DicomMetaDictionary.uid();
  const seriesInstanceUID = DicomMetaDictionary.uid();
  const imageMetadata = DicomMetadataStore.getFirstImageMetadataForSeries(loadedSeries.seriesUID);
  const referencedFrameOfReferenceUID = imageMetadata?.frameOfReferenceUID ?? DicomMetaDictionary.uid();
  const referencedSOPClassUID = getImageStorageSOPClassUID(loadedSeries.series.modality);

  const structureSetROISequence = structureSet.structures.map((structure, index) => ({
    ROINumber: index + 1,
    ReferencedFrameOfReferenceUID: referencedFrameOfReferenceUID,
    ROIName: structure.name,
    ROIGenerationAlgorithm: 'MANUAL',
  }));

  const roiContourSequence = structureSet.structures.map((structure, index) => ({
    ReferencedROINumber: index + 1,
   ROIDisplayColor: structure.color,
    ContourSequence: structure.contours.map((contour) => ({
      ContourGeometricType: 'CLOSED_PLANAR',
      NumberOfContourPoints: contour.points.length / 3,
      ContourData: Array.from(contour.points),
      ContourImageSequence: [
        {
          ReferencedSOPClassUID: referencedSOPClassUID,
          ReferencedSOPInstanceUID: contour.referencedSOPInstanceUID,
        },
      ],
    })),
  }));

  const rtRoiObservationsSequence = structureSet.structures.map((structure, index) => ({
    ObservationNumber: index + 1,
    ReferencedROINumber: index + 1,
    ROIObservationLabel: structure.name,
    RTROIInterpretedType: mapRoiType(structure.type),
    ROIInterpreter: '',
  }));

  const dataset = {
    SOPClassUID: RT_STRUCTURE_SET_STORAGE_UID,
    SOPInstanceUID: sopInstanceUID,
    StudyInstanceUID: loadedSeries.study.studyInstanceUID,
    SeriesInstanceUID: seriesInstanceUID,
    Modality: 'RTSTRUCT',
    SeriesDescription: `RTSTRUCT ${loadedSeries.series.seriesDescription ?? loadedSeries.seriesUID}`,
    StructureSetLabel: structureSet.label.slice(0, 16) || 'RTSTRUCT',
    StructureSetName: structureSet.label,
    StructureSetDate: formatDate(now),
    StructureSetTime: formatTime(now),
    SeriesDate: formatDate(now),
    SeriesTime: formatTime(now),
    ContentDate: formatDate(now),
    ContentTime: formatTime(now),
    InstanceCreationDate: formatDate(now),
    InstanceCreationTime: formatTime(now),
    PatientName: formatPatientName(loadedSeries.patient.name),
    PatientID: loadedSeries.patient.mrn || loadedSeries.patient.id,
    PatientBirthDate: loadedSeries.patient.dateOfBirth?.replaceAll('-', '') || '',
    StudyDate: loadedSeries.study.studyDate?.replaceAll('-', '') || formatDate(now),
    StudyDescription: loadedSeries.study.studyDescription ?? '',
    SeriesNumber: 500,
    InstanceNumber: 1,
    Manufacturer: 'WebTPS',
    ReferencedFrameOfReferenceSequence: [
      {
        FrameOfReferenceUID: referencedFrameOfReferenceUID,
      },
    ],
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
    ImplementationVersionName: 'WEBTPS_1',
  };

  const dicomDict = new DicomDict(DicomMetaDictionary.denaturalizeDataset(meta));
  dicomDict.dict = DicomMetaDictionary.denaturalizeDataset(dataset);
  const buffer = dicomDict.write();

  return new Blob([buffer], { type: 'application/dicom' });
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
