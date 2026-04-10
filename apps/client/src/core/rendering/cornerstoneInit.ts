/**
 * One-time Cornerstone3D v4 initialization.
 * Stores the in-flight promise so callers can await readiness
 * regardless of when they call cornerstoneInit().
 */

import type { IRetrieveConfiguration, VolumeLoaderFn } from '@cornerstonejs/core/types';
import { cornerstoneMetadataProvider } from '../dicom/DicomMetadataStore';

let initPromise: Promise<void> | null = null;

export function cornerstoneInit(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const {
      init,
      metaData,
      volumeLoader,
      cornerstoneStreamingImageVolumeLoader,
    } = await import('@cornerstonejs/core');

    const csTools = await import('@cornerstonejs/tools');

    const { init: dicomImageLoaderInit } = await import(
      '@cornerstonejs/dicom-image-loader'
    );

    // Initialize core rendering engine
    init();

    // Register our pre-parsed DICOM metadata provider (high priority so it
    // runs before the wadouri fallback which requires datasets to be loaded)
    metaData.addProvider(cornerstoneMetadataProvider, 10000);

    // Initialize tools library
    csTools.init();

    // Register the streaming volume loader
    const streamingVolumeLoader: VolumeLoaderFn = (volumeId, options = {}) => {
      const { imageIds = [], progressiveRendering } = options as {
        imageIds?: string[];
        progressiveRendering?: boolean | IRetrieveConfiguration;
      };
      const loadObject = cornerstoneStreamingImageVolumeLoader(volumeId, {
        imageIds,
        progressiveRendering,
      });

      return {
        promise: loadObject.promise,
        cancelFn: loadObject.cancel,
        decache: loadObject.decache,
      };
    };

    volumeLoader.registerVolumeLoader(
      'cornerstoneStreamingImageVolume',
      streamingVolumeLoader
    );

    // Initialize DICOM image loader (v4 — bundles its own dicom-parser)
    dicomImageLoaderInit({
      maxWebWorkers: Math.max(1, Math.floor(navigator.hardwareConcurrency / 2)),
    });
  })();

  initPromise.catch((err) => {
    console.error('Cornerstone3D initialization failed:', err);
    initPromise = null; // allow retry
  });

  return initPromise;
}

export function isCornerstoneInitialized(): boolean {
  return initPromise !== null;
}

export function _resetInitFlag(): void {
  initPromise = null;
}
