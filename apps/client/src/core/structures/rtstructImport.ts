import type { ContourSlice, Structure, StructureSet, StructureType } from '@webtps/shared-types';
import { computeVolume } from './VolumeCalculator';

interface RtstructDataset {
  StructureSetLabel?: string;
  StructureSetName?: string;
  StructureSetROISequence?: RtstructRoi[];
  ROIContourSequence?: RtstructRoiContour[];
  RTROIObservationsSequence?: RtstructObservation[];
}

interface RtstructRoi {
  ROINumber?: number | string;
  ROIName?: string;
}

interface RtstructRoiContour {
  ReferencedROINumber?: number | string;
  ROIDisplayColor?: number[] | string[];
  ContourSequence?: RtstructContour[];
}

interface RtstructContour {
  ContourData?: number[] | string[];
  NumberOfContourPoints?: number | string;
  ContourImageSequence?: Array<{
    ReferencedSOPInstanceUID?: string;
  }>;
}

interface RtstructObservation {
  ReferencedROINumber?: number | string;
  RTROIInterpretedType?: string;
}

function toNumber(value: number | string | undefined): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toNumberArray(values: number[] | string[] | undefined): number[] {
  if (!Array.isArray(values)) return [];
  return values
    .map((value) => (typeof value === 'number' ? value : Number(value)))
    .filter((value) => Number.isFinite(value));
}

function mapRtRoiType(type: string | undefined): StructureType {
  switch (type) {
    case 'GTV':
    case 'CTV':
    case 'PTV':
    case 'EXTERNAL':
      return type;
    case 'AVOIDANCE':
      return 'AVOIDANCE';
    case 'SUPPORT':
      return 'SUPPORT';
    default:
      return 'OAR';
  }
}

function getSlicePosition(points: number[]): number {
  const zValues: number[] = [];
  for (let index = 2; index < points.length; index += 3) {
    zValues.push(points[index]);
  }

  if (zValues.length === 0) return 0;
  return zValues.reduce((sum, z) => sum + z, 0) / zValues.length;
}

function buildId(prefix: string, value: string | number): string {
  return `${prefix}-${String(value).replace(/[^a-z0-9_-]+/gi, '-')}`;
}

export function importRtstructDataset(
  dataset: RtstructDataset,
  referencedSeriesUID: string,
  sliceThickness_mm?: number
): StructureSet {
  const observationsByRoi = new Map<number, RtstructObservation>();
  for (const observation of dataset.RTROIObservationsSequence ?? []) {
    observationsByRoi.set(toNumber(observation.ReferencedROINumber), observation);
  }

  const contoursByRoi = new Map<number, RtstructRoiContour>();
  for (const roiContour of dataset.ROIContourSequence ?? []) {
    contoursByRoi.set(toNumber(roiContour.ReferencedROINumber), roiContour);
  }

  const structures: Structure[] = (dataset.StructureSetROISequence ?? []).map((roi, index) => {
    const roiNumber = toNumber(roi.ROINumber) || index + 1;
    const roiContour = contoursByRoi.get(roiNumber);
    const observation = observationsByRoi.get(roiNumber);
    const color = toNumberArray(roiContour?.ROIDisplayColor);
    const contours: ContourSlice[] = (roiContour?.ContourSequence ?? []).flatMap((contour) => {
      const points = toNumberArray(contour.ContourData);
      const expectedLength = toNumber(contour.NumberOfContourPoints) * 3;
      if (points.length < 9 || (expectedLength > 0 && points.length < expectedLength)) {
        return [];
      }

      return [{
        referencedSOPInstanceUID:
          contour.ContourImageSequence?.[0]?.ReferencedSOPInstanceUID ?? '',
        slicePosition: getSlicePosition(points),
        points: new Float32Array(points),
        isClosed: true,
      }];
    });

    const structure: Structure = {
      id: buildId('roi', roiNumber),
      name: roi.ROIName?.trim() || `ROI ${roiNumber}`,
      type: mapRtRoiType(observation?.RTROIInterpretedType),
      color: [
        color[0] ?? 255,
        color[1] ?? 255,
        color[2] ?? 0,
      ],
      contours,
      isVisible: true,
      isLocked: false,
      volume_cc: 0,
    };
    if (sliceThickness_mm && sliceThickness_mm > 0) {
      structure.volume_cc = computeVolume(structure, sliceThickness_mm);
    }
    return structure;
  });

  return {
    id: buildId('rtstruct', dataset.StructureSetLabel || dataset.StructureSetName || 'imported'),
    label: dataset.StructureSetName || dataset.StructureSetLabel || 'Imported RTSTRUCT',
    referencedSeriesUID,
    structures,
    version: 1,
  };
}

export async function importRtstructArrayBuffer(
  buffer: ArrayBuffer,
  referencedSeriesUID: string,
  sliceThickness_mm?: number
): Promise<StructureSet> {
  const dcmjs = await import('dcmjs');
  const { DicomMessage, DicomMetaDictionary } = dcmjs.data;
  const dicomData = DicomMessage.readFile(buffer);
  const dataset = DicomMetaDictionary.naturalizeDataset(dicomData.dict) as RtstructDataset;
  return importRtstructDataset(dataset, referencedSeriesUID, sliceThickness_mm);
}
