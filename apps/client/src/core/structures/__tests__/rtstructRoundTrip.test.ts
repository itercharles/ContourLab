// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import type { StructureSet } from '@contourlab/shared-types';
import { exportRtstructObject } from '../rtstructExport';
import { importRtstructArrayBuffer } from '../rtstructImport';
import { DicomMetadataStore, type ImageMetadata } from '../../dicom/DicomMetadataStore';
import type { LoadedSeries } from '../../store/volumeStore';

// Runs the real dcmjs (no mock): the other RTSTRUCT tests mock it or bypass it, so a library
// upgrade is otherwise untested. Contour coordinates are deliberately fractional and negative.
const loadedSeries = {
  seriesUID: '1.2.826.0.1.3680043.8.498.1',
  cornerstoneVolumeId: 'vol-1',
  volume: {
    seriesUID: '1.2.826.0.1.3680043.8.498.1',
    dimensions: [1, 1, 2],
    spacing: [1, 1, 2.5],
    origin: [0, 0, 0],
    directionCosines: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    pixelData: new Float32Array(0),
    windowCenter: 40,
    windowWidth: 400,
  },
  patient: {
    id: 'patient-1',
    mrn: 'PHANTOM-001',
    name: { given: 'Ada', family: 'Lovelace' },
    dateOfBirth: '1815-12-10',
    sex: 'F',
    studies: [],
  },
  study: { studyInstanceUID: '1.2.826.0.1.3680043.8.498.2', studyDate: '2026-04-11', series: [] },
  series: {
    seriesInstanceUID: '1.2.826.0.1.3680043.8.498.1',
    seriesDescription: 'Phantom CT',
    modality: 'CT',
    instances: [
      { sopInstanceUID: '1.2.826.0.1.3680043.8.498.10', instanceNumber: 1, imagePositionZ: -12.5 },
      { sopInstanceUID: '1.2.826.0.1.3680043.8.498.11', instanceNumber: 2, imagePositionZ: -10 },
    ],
  },
} as unknown as LoadedSeries;

const imageMetadata: ImageMetadata = {
  samplesPerPixel: 1,
  photometricInterpretation: 'MONOCHROME2',
  rows: 1,
  columns: 1,
  bitsAllocated: 16,
  bitsStored: 16,
  highBit: 15,
  pixelRepresentation: 0,
  imageOrientationPatient: [1, 0, 0, 0, 1, 0],
  imagePositionPatient: [0, 0, -12.5],
  rowPixelSpacing: 1,
  columnPixelSpacing: 1,
  sliceThickness: 2.5,
  sliceLocation: -12.5,
  frameOfReferenceUID: '1.2.826.0.1.3680043.8.498.3',
  modality: 'CT',
  seriesInstanceUID: '1.2.826.0.1.3680043.8.498.1',
  transferSyntaxUID: '1.2.840.10008.1.2.1',
};

const gtvPoints = [-10.125, 5.5, -12.5, 3.333333, -7.25, -12.5, 0.1, 12.0625, -12.5];
const oarPoints = [1.5, -2.25, -10, -4.75, 8.875, -10, 6.0625, 0.3125, -10];

const structureSet: StructureSet = {
  id: 'ss-roundtrip',
  label: 'Round trip',
  referencedSeriesUID: loadedSeries.seriesUID,
  version: 1,
  structures: [
    {
      id: 'roi-1',
      name: 'GTV',
      type: 'GTV',
      color: [255, 0, 10],
      contours: [{
        referencedSOPInstanceUID: '1.2.826.0.1.3680043.8.498.10',
        slicePosition: -12.5,
        points: new Float32Array(gtvPoints),
        isClosed: true,
      }],
      isVisible: true,
      isLocked: false,
      volume_cc: 0,
    },
    {
      id: 'roi-2',
      name: 'Cord',
      type: 'OAR',
      color: [0, 128, 255],
      contours: [{
        referencedSOPInstanceUID: '1.2.826.0.1.3680043.8.498.11',
        slicePosition: -10,
        points: new Float32Array(oarPoints),
        isClosed: true,
      }],
      isVisible: true,
      isLocked: false,
      volume_cc: 0,
    },
  ],
};

beforeEach(() => {
  DicomMetadataStore.clearImageMetadata();
  DicomMetadataStore.setImageMetadata('img-1', imageMetadata);
});

describe('RTSTRUCT export then import with the real dcmjs @links:SRS-010,SYS-006,SYS-007', () => {
  it('keeps names, types, colours, contour counts, references and fractional points', async () => {
    const exported = await exportRtstructObject(loadedSeries, structureSet);
    const buffer = await exported.blob.arrayBuffer();
    const imported = await importRtstructArrayBuffer(buffer, loadedSeries.seriesUID, 2.5);

    expect(imported.structures.map((s) => s.name)).toEqual(['GTV', 'Cord']);
    expect(imported.structures.map((s) => s.type)).toEqual(['GTV', 'OAR']);
    expect(imported.structures.map((s) => s.color)).toEqual([[255, 0, 10], [0, 128, 255]]);
    expect(imported.referencedSeriesUID).toBe(loadedSeries.seriesUID);

    const expected = [gtvPoints, oarPoints];
    imported.structures.forEach((structure, index) => {
      expect(structure.contours).toHaveLength(1);
      const contour = structure.contours[0];
      expect(contour.referencedSOPInstanceUID).toBe(
        structureSet.structures[index].contours[0].referencedSOPInstanceUID
      );
      expect(contour.points).toHaveLength(expected[index].length);
      expected[index].forEach((value, i) => {
        expect(contour.points[i]).toBeCloseTo(value, 4);
      });
    });
  });
});
