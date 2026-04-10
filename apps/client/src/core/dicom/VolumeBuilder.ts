import type { Volume } from '@webtps/shared-types';
import type { ParsedSeries } from './DicomLoader';
import type { LoadedSeries } from '../store/volumeStore';
import { cornerstoneInit } from '../rendering/cornerstoneInit';

/**
 * Build a Cornerstone3D streaming volume from a parsed DICOM series.
 *
 * NOTE: createAndCacheVolume registers the volume; load() kicks off
 * background streaming of image frames. We do NOT await load() — the
 * streaming volume loader is fire-and-forget. Viewports render
 * progressively as frames arrive via events.
 */
export async function buildVolume(parsedSeries: ParsedSeries): Promise<LoadedSeries> {
  // Ensure Cornerstone3D is fully initialized before attempting to create volumes
  await cornerstoneInit();

  const { volumeLoader } = await import('@cornerstonejs/core');

  const { seriesUID, instances, metadata } = parsedSeries;
  const volumeId = `cornerstoneStreamingImageVolume:${seriesUID}`;
  const imageIds = instances.map((i) => i.wadouriId);

  const volume = await volumeLoader.createAndCacheVolume(volumeId, { imageIds });

  // Fire-and-forget: streaming loads frames in the background
  (volume as { load: () => void }).load();

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
    pixelData: new Float32Array(0), // pixel data managed by Cornerstone
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
