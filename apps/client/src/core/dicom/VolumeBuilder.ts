import type { Volume } from '@contourlab/shared-types';
import type { ParsedSeries } from './DicomLoader';
import type { LoadedSeries } from '../store/volumeStore';
import { cornerstoneInit } from '../rendering/cornerstoneInit';
import { logClientDebug } from '../debug/clientDebugLog';
import { addUserActivity } from '../store/activityStore';
import { DicomMetadataStore } from './DicomMetadataStore';
import { SeriesGeometryError, validateSeriesGeometry } from './seriesGeometry';

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

  // Refuse a series whose slices cannot be stacked faithfully, rather than load it with defaults.
  const geometry = validateSeriesGeometry(
    instances.flatMap((instance) => {
      const slice = DicomMetadataStore.getImageMetadata(instance.imageId);
      return slice ? [slice] : [];
    })
  );
  if (geometry.errors.length > 0) {
    throw new SeriesGeometryError(metadata.series.seriesDescription ?? '', geometry.errors);
  }
  for (const warning of geometry.warnings) {
    addUserActivity({
      title: 'Check the slice geometry',
      message: `${metadata.series.seriesDescription || 'This series'}: ${warning}`,
      tone: 'warning',
    });
  }

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

  // Diagnostic logs are useful when triaging direction / spacing / streaming
  // issues but are noise during steady-state operation. Gate behind DEV so
  // the production debug-log ring buffer doesn't fill with metadata that's
  // already in the volume store.
  if (import.meta.env.DEV) {
    logClientDebug(
      'VolumeBuilder',
      `geometry uid=${seriesUID} dims=${csVolume.dimensions.join('x')} ` +
        `origin=[${csVolume.origin.map((v) => v.toFixed(2)).join(',')}] ` +
        `spacing=[${csVolume.spacing.map((v) => v.toFixed(3)).join(',')}] ` +
        `direction=[${csVolume.direction.map((v) => v.toFixed(3)).join(',')}]`
    );
  }

  // Fire-and-forget: streaming loads frames in the background. Keep the shared
  // pixelData reference current so tools such as HU probe can read loaded voxels.
  // The load callback fires once every imageId in the streaming volume has been
  // fetched, parsed, and inserted into the volume's voxel manager. The wall-
  // clock between createAndCacheVolume returning and this callback is the
  // network fetch + parse time on a cold load — the dominant slice of "patient
  // load" that's NOT 3D rendering. Gated to DEV for the same reason as above.
  const loadStartedAt = performance.now();
  (volume as { load: (callback?: () => void) => void }).load(() => {
    sharedVolume.pixelData = getPixelData();
    if (import.meta.env.DEV) {
      logClientDebug(
        'VolumeBuilder',
        `streaming-loaded uid=${seriesUID} ms=${Math.round(performance.now() - loadStartedAt)} ` +
          `imageIds=${imageIds.length}`
      );
    }
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
