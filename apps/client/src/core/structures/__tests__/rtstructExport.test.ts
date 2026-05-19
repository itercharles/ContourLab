import { describe, expect, it, vi } from 'vitest';
import { exportRtstructBlob, exportRtstructObject } from '../rtstructExport';
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

describe('exportRtstructBlob @links:SRS-018,SYS-006,CRS-005', () => {
  it('does not write a predecessor reference for a manual structure set @links:SRS-018', async () => {
    dicomMock.writtenDatasets = [];

    await exportRtstructObject(loadedSeries, structureSet);

    expect(dicomMock.writtenDatasets[0]).not.toHaveProperty('PredecessorStructureSetSequence');
  });

  it('writes a standard predecessor reference for a repository RTSTRUCT revision @links:SRS-018', async () => {
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

  it('creates a DICOM blob for a structure set', async () => {
    await expect(exportRtstructBlob(loadedSeries, structureSet)).resolves.toBeInstanceOf(Blob);
  });

  it('returns identifiers for the newly generated RTSTRUCT object', async () => {
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
