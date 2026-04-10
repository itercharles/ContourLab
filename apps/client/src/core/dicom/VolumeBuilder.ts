import type { Volume } from '@webtps/shared-types';
import type { ParsedSeries } from './DicomLoader';
import type { LoadedSeries } from '../store/volumeStore';

/**
 * Build a Cornerstone3D streaming volume from a parsed DICOM series.
 * Returns the Cornerstone volume ID and shared-types Volume metadata.
 */
export async function buildVolume(parsedSeries: ParsedSeries): Promise<LoadedSeries> {
  const {
    cornerstoneStreamingImageVolumeLoader,
    volumeLoader,
  } = await import('@cornerstonejs/core');

  const { seriesUID, instances, metadata } = parsedSeries;
  const volumeId = `cornerstoneStreamingImageVolume:${seriesUID}`;

  // Register the streaming volume loader if not already done
  volumeLoader.registerUnknownVolumeLoader(
    cornerstoneStreamingImageVolumeLoader.createAndCacheVolume as Parameters<typeof volumeLoader.registerUnknownVolumeLoader>[0]
  );

  const imageIds = instances.map((i) => i.wadouriId);

  const volume = await volumeLoader.createAndCacheVolume(volumeId, { imageIds });
  await (volume as { load: () => Promise<void> }).load();

  // Extract volume geometry from Cornerstone's loaded volume
  const csVolume = volume as {
    dimensions: [number, number, number];
    spacing: [number, number, number];
    origin: [number, number, number];
    direction: number[];
    windowCenter?: number;
    windowWidth?: number;
  };

  const sharedVolume: Volume = {
    seriesUID,
    dimensions: csVolume.dimensions,
    spacing: csVolume.spacing,
    origin: csVolume.origin,
    directionCosines: csVolume.direction,
    pixelData: new Float32Array(0), // managed by Cornerstone, not copied here
    windowCenter: csVolume.windowCenter ?? 40,
    windowWidth: csVolume.windowWidth ?? 400,
  };

  return {
    seriesUID,
    cornerstoneVolumeId: volumeId,
    volume: sharedVolume,
    patient: metadata.patient,
    study: metadata.study,
    series: metadata.series,
  };
}
