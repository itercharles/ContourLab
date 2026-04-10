/**
 * One-time Cornerstone3D initialization.
 * Must be called before any viewport is created.
 * Safe to call multiple times — subsequent calls are no-ops.
 */

let initialized = false;

export async function cornerstoneInit(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const { init } = await import('@cornerstonejs/core');
  const cornerstoneDICOMImageLoader = await import(
    '@cornerstonejs/dicom-image-loader'
  );
  const dicomParser = await import('dicom-parser');

  // Initialize the core rendering engine
  init();

  // Configure the DICOM image loader with dicom-parser
  cornerstoneDICOMImageLoader.init({
    maxWebWorkers: Math.max(1, navigator.hardwareConcurrency - 1),
  });

  // Provide dicom-parser to the loader
  cornerstoneDICOMImageLoader.wadouri.dataSetCacheManager.purge();

  // Register the external dependency (dicom-parser)
  cornerstoneDICOMImageLoader.configure({
    useWebWorkers: true,
    decodeConfig: {
      convertFloatPixelDataToInt: false,
      use16BitDataType: false,
    },
  });

  // Make dicom-parser available to the loader
  (
    cornerstoneDICOMImageLoader as unknown as {
      external: { dicomParser: typeof dicomParser.default };
    }
  ).external = { dicomParser: dicomParser.default };
}

export function isCornerstoneInitialized(): boolean {
  return initialized;
}

/** Reset for testing purposes only */
export function _resetInitFlag(): void {
  initialized = false;
}
