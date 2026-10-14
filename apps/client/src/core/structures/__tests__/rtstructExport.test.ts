import { beforeEach, describe, expect, it, vi } from 'vitest';
import { exportRtstructBlob, exportRtstructObject, RtstructExportError } from '../rtstructExport';
import { importRtstructDataset } from '../rtstructImport';
import { DicomMetadataStore, type ImageMetadata } from '../../dicom/DicomMetadataStore';
import type { LoadedSeries } from '../../store/volumeStore';
import type { StructureSet } from '@contourlab/shared-types';

const dicomMock = vi.hoisted(() => ({
  writtenDatasets: [] as object[],
}));

const loadedSeries = {
  seriesUID: '1.2.3',
  cornerstoneVolumeId: 'vol-1',
  volume: {
    seriesUID: '1.2.3',
    dimensions: [1, 1, 1],
    spacing: [1, 1, 1],
    origin: [0, 0, 0],
    directionCosines: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    pixelData: new Float32Array(0),
    windowCenter: 40,
    windowWidth: 400,
  },
  patient: {
    id: 'patient-1',
    mrn: '123',
    name: { given: 'Ada', family: 'Lovelace' },
    dateOfBirth: '1815-12-10',
    sex: 'F',
    studies: [],
  },
  study: {
    studyInstanceUID: '1.2.study',
    studyDate: '2026-04-11',
    series: [],
  },
  series: {
    seriesInstanceUID: '1.2.3',
    seriesDescription: 'Thorax CT',
    modality: 'CT',
    instances: [],
  },
} satisfies LoadedSeries;

const structureSet: StructureSet = {
  id: 'ss-1',
  label: 'Main RT Structure Set',
  referencedSeriesUID: '1.2.3',
  version: 1,
  structures: [],
};

vi.mock('dcmjs', () => ({
  data: {
    DicomMetaDictionary: {
      uid: () => '2.25.1',
      denaturalizeDataset: (dataset: object) => dataset,
    },
    DicomDict: class {
      dict: object = {};

      constructor(public meta: object) {}

      write() {
        dicomMock.writtenDatasets.push(this.dict);
        return new Uint8Array([1, 2, 3]).buffer;
      }
    },
  },
}));

function imageMetadata(patch: Partial<ImageMetadata> = {}): ImageMetadata {
  return {
    samplesPerPixel: 1,
    photometricInterpretation: 'MONOCHROME2',
    rows: 1,
    columns: 1,
    bitsAllocated: 16,
    bitsStored: 16,
    highBit: 15,
    pixelRepresentation: 0,
    imageOrientationPatient: [1, 0, 0, 0, 1, 0],
    imagePositionPatient: [0, 0, 0],
    rowPixelSpacing: 1,
    columnPixelSpacing: 1,
    sliceThickness: 1,
    sliceLocation: 0,
    frameOfReferenceUID: '1.2.frame',
    modality: 'CT',
    seriesInstanceUID: '1.2.3',
    transferSyntaxUID: '1.2.840.10008.1.2.1',
    ...patch,
  };
}

beforeEach(() => {
  DicomMetadataStore.clearImageMetadata();
  DicomMetadataStore.setImageMetadata('img-1', imageMetadata());
  dicomMock.writtenDatasets = [];
});

describe('exportRtstructBlob @links:SRS-010,SYS-006,CRS-005', () => {
  it('does not write a predecessor reference for a manual structure set @links:SRS-010 @testing:T1', async () => {
    dicomMock.writtenDatasets = [];

    await exportRtstructObject(loadedSeries, structureSet);

    expect(dicomMock.writtenDatasets[0]).not.toHaveProperty('PredecessorStructureSetSequence');
  });

  it('writes a standard predecessor reference for a repository RTSTRUCT revision @links:SRS-010 @testing:T2', async () => {
    dicomMock.writtenDatasets = [];
    const revisionStructureSet: StructureSet = {
      ...structureSet,
      source: {
        type: 'rtstruct',
        sopClassUID: '1.2.840.10008.5.1.4.1.1.481.3',
        sopInstanceUID: 'rtss-previous',
      },
    };

    await exportRtstructObject(loadedSeries, revisionStructureSet);

    expect(dicomMock.writtenDatasets[0]).toMatchObject({
      PredecessorStructureSetSequence: [
        {
          ReferencedSOPClassUID: '1.2.840.10008.5.1.4.1.1.481.3',
          ReferencedSOPInstanceUID: 'rtss-previous',
        },
      ],
    });
  });

  it('creates a DICOM blob for a structure set @testing:T3', async () => {
    await expect(exportRtstructBlob(loadedSeries, structureSet)).resolves.toBeInstanceOf(Blob);
  });

  it('returns identifiers for the newly generated RTSTRUCT object @testing:T4', async () => {
    const exported = await exportRtstructObject(loadedSeries, structureSet);

    expect(exported.blob).toBeInstanceOf(Blob);
    expect(exported.identifiers).toEqual(expect.objectContaining({
      studyInstanceUID: '1.2.study',
      seriesInstanceUID: '2.25.1',
      sopInstanceUID: '2.25.1',
      seriesDescription: 'RTSTRUCT Thorax CT',
    }));
  });
});

describe('exportRtstructObject identity @links:SRS-010', () => {
  const square = (z: number, referencedSOPInstanceUID = ''): StructureSet['structures'][number]['contours'][number] => ({
    referencedSOPInstanceUID,
    slicePosition: z,
    points: new Float32Array([0, 0, z, 1, 0, z, 1, 1, z, 0, 1, z]),
    isClosed: true,
  });
  const withStructures = (structures: StructureSet['structures']): StructureSet => ({ ...structureSet, structures });
  const oneStructure = (contours: StructureSet['structures'][number]['contours'], type: StructureSet['structures'][number]['type'] = 'PTV') =>
    withStructures([{ id: 's1', name: 'S1', type, color: [1, 2, 3], contours, isVisible: true, isLocked: false, volume_cc: 0 }]);
  const seriesWithImages = {
    ...loadedSeries,
    series: {
      ...loadedSeries.series,
      instances: [
        { sopInstanceUID: 'sop-a', instanceNumber: 1, imagePositionZ: 0 },
        { sopInstanceUID: 'sop-b', instanceNumber: 2, imagePositionZ: 3 },
      ],
    },
  };
  const written = () => dicomMock.writtenDatasets[0] as Record<string, unknown> & {
    ROIContourSequence: Array<{ ContourSequence: Array<{ ContourImageSequence?: Array<{ ReferencedSOPInstanceUID: string }> }> }>;
    RTROIObservationsSequence: Array<{ RTROIInterpretedType: string }>;
  };

  it('refuses a series with no Frame of Reference UID instead of inventing one @testing:T12', async () => {
    DicomMetadataStore.clearImageMetadata();
    await expect(exportRtstructObject(loadedSeries, structureSet)).rejects.toThrow(RtstructExportError);

    DicomMetadataStore.setImageMetadata('img-1', imageMetadata({ frameOfReferenceUID: '' }));
    await expect(exportRtstructObject(loadedSeries, structureSet)).rejects.toThrow('Frame of Reference UID');
    DicomMetadataStore.setImageMetadata('img-1', imageMetadata({ frameOfReferenceUID: '   ' }));
    await expect(exportRtstructObject(loadedSeries, structureSet)).rejects.toThrow('Nothing was exported');

    expect(dicomMock.writtenDatasets).toHaveLength(0);
  });

  it('writes the Frame of Reference UID of the images @testing:T12', async () => {
    await exportRtstructObject(loadedSeries, structureSet);
    expect(written()).toMatchObject({ ReferencedFrameOfReferenceSequence: [{ FrameOfReferenceUID: '1.2.frame' }] });
  });

  it('refuses images with no Patient ID rather than file the structure set under the study UID @testing:T13', async () => {
    const noPatientId = { ...loadedSeries, patient: { ...loadedSeries.patient, mrn: '', id: loadedSeries.study.studyInstanceUID } };

    await expect(exportRtstructObject(noPatientId, structureSet)).rejects.toThrow('Patient ID');
    expect(dicomMock.writtenDatasets).toHaveLength(0);
  });

  it('writes the patient ID, birth date and sex of the images @testing:T13', async () => {
    await exportRtstructObject(loadedSeries, structureSet);
    expect(written()).toMatchObject({ PatientID: '123', PatientBirthDate: '18151210', PatientSex: 'F' });
  });

  it('references the image each contour lies on: its own reference, else the image at its position, else none @testing:T14', async () => {
    const set = oneStructure([square(0, 'sop-own'), square(3), square(99)]);

    await exportRtstructObject(seriesWithImages, set);

    const contours = written().ROIContourSequence[0].ContourSequence;
    expect(contours[0].ContourImageSequence?.[0].ReferencedSOPInstanceUID).toBe('sop-own');
    expect(contours[1].ContourImageSequence?.[0].ReferencedSOPInstanceUID).toBe('sop-b');
    expect(contours[2]).not.toHaveProperty('ContourImageSequence');
  });

  it('never writes an empty image reference @testing:T14', async () => {
    await exportRtstructObject(loadedSeries, oneStructure([square(0), square(5)]));

    const contours = written().ROIContourSequence[0].ContourSequence;
    expect(JSON.stringify(contours)).not.toContain('"ReferencedSOPInstanceUID":""');
    expect(contours.every((contour) => !('ContourImageSequence' in contour))).toBe(true);
  });

  it('keeps the structure types, including avoidance and support, through export and import @testing:T15', async () => {
    const types = ['GTV', 'CTV', 'PTV', 'OAR', 'EXTERNAL', 'AVOIDANCE', 'SUPPORT'] as const;
    const set = withStructures(
      types.map((type, index) => ({
        id: `s${index}`, name: type, type, color: [1, 2, 3], contours: [square(0, 'sop-a')], isVisible: true, isLocked: false, volume_cc: 0,
      }))
    );

    await exportRtstructObject(seriesWithImages, set);
    const imported = importRtstructDataset(written() as unknown as Parameters<typeof importRtstructDataset>[0], '1.2.3');

    expect(imported.structures.map((structure) => structure.type)).toEqual([...types]);
  });
});

