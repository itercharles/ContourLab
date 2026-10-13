import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedSeries } from './DicomLoader';
import { DicomMetadataStore, type ImageMetadata } from './DicomMetadataStore';
import { useActivityStore } from '../store/activityStore';

const createAndCacheVolume = vi.fn();

vi.mock('../rendering/cornerstoneInit', () => ({ cornerstoneInit: vi.fn().mockResolvedValue(undefined) }));
vi.mock('@cornerstonejs/core', () => ({ volumeLoader: { createAndCacheVolume } }));
vi.mock('../debug/clientDebugLog', () => ({ logClientDebug: vi.fn() }));

import { buildVolume } from './VolumeBuilder';

function imageMeta(z: number, patch: Partial<ImageMetadata> = {}): ImageMetadata {
  return {
    samplesPerPixel: 1,
    photometricInterpretation: 'MONOCHROME2',
    rows: 64,
    columns: 64,
    bitsAllocated: 16,
    bitsStored: 16,
    highBit: 15,
    pixelRepresentation: 0,
    imageOrientationPatient: [1, 0, 0, 0, 1, 0],
    imagePositionPatient: [0, 0, z],
    rowPixelSpacing: 1,
    columnPixelSpacing: 1,
    sliceThickness: 3,
    sliceLocation: z,
    frameOfReferenceUID: '1.2.3',
    modality: 'CT',
    seriesInstanceUID: 'series-1',
    transferSyntaxUID: '1.2.840.10008.1.2.1',
    ...patch,
  };
}

function seriesOf(zs: number[], patchFor: (index: number) => Partial<ImageMetadata> = () => ({})): ParsedSeries {
  const instances = zs.map((z, index) => {
    const imageId = `img-${index}`;
    DicomMetadataStore.setImageMetadata(imageId, imageMeta(z, patchFor(index)));
    return { imageId, seriesUID: 'series-1', sopInstanceUID: `sop-${index}`, instanceNumber: index + 1, sliceLocation: z };
  });
  return {
    seriesUID: 'series-1',
    instances,
    metadata: {
      patient: { id: 'p', mrn: 'p', name: { given: '', family: 'Test' }, dateOfBirth: '', studies: [] },
      study: { studyInstanceUID: 's', studyDate: '', studyDescription: '', series: [] },
      series: { seriesInstanceUID: 'series-1', seriesDescription: 'Thorax CT', modality: 'CT', instances: [] },
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  DicomMetadataStore.clearImageMetadata();
  useActivityStore.getState().clearActivities();
  createAndCacheVolume.mockResolvedValue({
    dimensions: [64, 64, 3],
    spacing: [1, 1, 3],
    origin: [0, 0, 0],
    direction: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    load: vi.fn(),
  });
});

describe('buildVolume series geometry gate @links:SRS-001 @testing:T3', () => {
  it('refuses a series with inconsistent geometry before touching Cornerstone', async () => {
    const series = seriesOf([0, 3, 6], (index) => (index === 2 ? { imageOrientationPatient: [1, 0, 0, 0, 0, -1] } : {}));

    await expect(buildVolume(series)).rejects.toThrow('Series "Thorax CT" was not loaded.');
    expect(createAndCacheVolume).not.toHaveBeenCalled();
  });

  it('refuses a series that lacks a geometry tag', async () => {
    const series = seriesOf([0, 3, 6], (index) => (index === 1 ? { missingGeometryTags: ['ImagePositionPatient'] } : {}));

    await expect(buildVolume(series)).rejects.toThrow('ImagePositionPatient');
    expect(createAndCacheVolume).not.toHaveBeenCalled();
  });

  it('loads an evenly spaced series without a warning', async () => {
    const loaded = await buildVolume(seriesOf([0, 3, 6]));

    expect(loaded.seriesUID).toBe('series-1');
    expect(createAndCacheVolume).toHaveBeenCalledTimes(1);
    expect(useActivityStore.getState().activities).toHaveLength(0);
  });

  it('loads an unevenly spaced series and tells the user', async () => {
    await buildVolume(seriesOf([0, 2.5, 5, 10]));

    expect(createAndCacheVolume).toHaveBeenCalledTimes(1);
    const [activity] = useActivityStore.getState().activities;
    expect(activity.title).toBe('Check the slice geometry');
    expect(activity.tone).toBe('warning');
    expect(activity.message).toContain('Thorax CT');
    expect(activity.message).toContain('not evenly spaced');
  });
});
