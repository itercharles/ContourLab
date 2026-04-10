/**
 * One-time Cornerstone3D v4 initialization.
 * Stores the in-flight promise so callers can await readiness
 * regardless of when they call cornerstoneInit().
 */

let initPromise: Promise<void> | null = null;

export function cornerstoneInit(): Promise<void> {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const {
      init,
      volumeLoader,
      cornerstoneStreamingImageVolumeLoader,
    } = await import('@cornerstonejs/core');

    const csTools = await import('@cornerstonejs/tools');

    const { init: dicomImageLoaderInit } = await import(
      '@cornerstonejs/dicom-image-loader'
    );

    // Initialize core rendering engine
    init();

    // Initialize tools library
    csTools.init();

    // Register the streaming volume loader
    volumeLoader.registerVolumeLoader(
      'cornerstoneStreamingImageVolume',
      cornerstoneStreamingImageVolumeLoader
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
