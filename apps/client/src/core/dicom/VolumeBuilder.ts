import type { Volume } from '@webtps/shared-types';
import type { ParsedSeries } from './DicomLoader';
import type { LoadedSeries } from '../store/volumeStore';
import { cornerstoneInit } from '../rendering/cornerstoneInit';

/**
 * Build a Cornerstone3D streaming volume from a parsed DICOM series.
 *
 * For browser-local uploads we first cache each image, then derive an
 * in-memory volume from that cached stack. This avoids depending on the
 * streaming loader to bootstrap metadata and first-frame rendering.
 */
export async function buildVolume(parsedSeries: ParsedSeries): Promise<LoadedSeries> {
  // Ensure Cornerstone3D is fully initialized before attempting to create volumes
  await cornerstoneInit();

  const { imageLoader, volumeLoader } = await import('@cornerstonejs/core');

  const { seriesUID, instances, metadata } = parsedSeries;
  const volumeId = `local:${seriesUID}`;
  const imageIds = instances.map((i) => i.imageId);

  // Prime Cornerstone's dataset cache so metadata providers can answer
  // imagePixelModule/imagePlaneModule queries during volume construction.
  await Promise.all(
    imageIds.map((imageId) =>
      imageLoader.loadAndCacheImage(imageId, {
        priority: 0,
        requestType: 'prefetch',
      })
    )
  );

  const volume = await volumeLoader.createAndCacheVolumeFromImages(volumeId, imageIds);

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
