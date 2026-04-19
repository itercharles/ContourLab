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
  const imageIds = instances.map((i) => i.imageId);

  const volume = await volumeLoader.createAndCacheVolume(volumeId, { imageIds });

  const csVolume = volume as {
    dimensions: [number, number, number];
    spacing: [number, number, number];
    origin: [number, number, number];
    direction: number[];
    windowCenter?: number;
    windowWidth?: number;
    getScalarData?: () => Volume['pixelData'];
    voxelManager?: {
      getScalarData?: () => Volume['pixelData'];
    };
  };
  const getPixelData = (): Volume['pixelData'] => {
    try {
      return csVolume.getScalarData?.() ?? csVolume.voxelManager?.getScalarData?.() ?? new Float32Array(0);
    } catch {
      return new Float32Array(0);
    }
  };

  const sharedVolume: Volume = {
    seriesUID,
    dimensions: csVolume.dimensions,
    spacing: csVolume.spacing,
    origin: csVolume.origin,
    directionCosines: csVolume.direction,
    pixelData: new Float32Array(0),
    windowCenter: csVolume.windowCenter ?? 40,
    windowWidth: csVolume.windowWidth ?? 400,
  };

  // Fire-and-forget: streaming loads frames in the background. Keep the shared
  // pixelData reference current so tools such as HU probe can read loaded voxels.
  (volume as { load: (callback?: () => void) => void }).load(() => {
    sharedVolume.pixelData = getPixelData();
  });

  return {
    seriesUID,
    cornerstoneVolumeId: volumeId,
    volume: sharedVolume,
    patient: metadata.patient,
    study: metadata.study,
    series: metadata.series,
  };
}
