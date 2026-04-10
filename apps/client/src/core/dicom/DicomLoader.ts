import { parseDicomTags, buildMetadata, DicomMetadataStore, type ImageMetadata } from './DicomMetadataStore';
import type { SeriesMetadata } from './DicomMetadataStore';

export interface ParsedInstance {
  file: File;
  imageId: string;
  seriesUID: string;
  sopInstanceUID: string;
  instanceNumber: number;
  sliceLocation: number;
}

export interface ParsedSeries {
  seriesUID: string;
  instances: ParsedInstance[];
  metadata: SeriesMetadata;
}

/**
 * Parse an array of DICOM files, group by series, and register blob URLs
 * for use with the Cornerstone3D wadouri: image loader.
 *
 * Files are parsed in parallel batches of 8. Directory entries and
 * zero-byte files (from webkitdirectory) are silently skipped.
 */
export async function loadFiles(
  files: File[],
  onProgress?: (loaded: number, total: number) => void
): Promise<ParsedSeries[]> {
  const { wadouri } = await import('@cornerstonejs/dicom-image-loader');

  // Filter out directory entries (size=0 or 4096) from webkitdirectory picks
  const dicomFiles = files.filter((f) => f.size > 128);

  const seriesMap = new Map<string, ParsedInstance[]>();
  const metadataMap = new Map<string, SeriesMetadata>();

  let loaded = 0;
  const BATCH = 8;

  for (let i = 0; i < dicomFiles.length; i += BATCH) {
    const batch = dicomFiles.slice(i, i + BATCH);

    await Promise.all(
      batch.map(async (file) => {
        try {
          const tags = await parseDicomTags(file);
          const { patient, study, series, instance } = buildMetadata(tags);

          const imageId = wadouri.fileManager.add(file);

          // Store per-imageId metadata so our Cornerstone3D provider can answer
          // imagePixelModule / imagePlaneModule / transferSyntax queries before
          // any DICOM file has been loaded by the wadouri image loader.
          const imageMeta: ImageMetadata = {
            samplesPerPixel: tags.samplesPerPixel,
            photometricInterpretation: tags.photometricInterpretation,
            rows: tags.rows,
            columns: tags.columns,
            bitsAllocated: tags.bitsAllocated,
            bitsStored: tags.bitsStored,
            highBit: tags.highBit,
            pixelRepresentation: tags.pixelRepresentation,
            imageOrientationPatient: tags.imageOrientationPatient,
            imagePositionPatient: tags.imagePositionPatient,
            rowPixelSpacing: tags.pixelSpacing[0],
            columnPixelSpacing: tags.pixelSpacing[1],
            sliceThickness: tags.sliceThickness,
            sliceLocation: tags.sliceLocation,
            frameOfReferenceUID: tags.frameOfReferenceUID,
            modality: tags.modality,
            seriesInstanceUID: tags.seriesInstanceUID,
            transferSyntaxUID: tags.transferSyntaxUID,
            windowCenter: tags.windowCenter,
            windowWidth: tags.windowWidth,
          };
          DicomMetadataStore.setImageMetadata(imageId, imageMeta);

          const parsed: ParsedInstance = {
            file,
            imageId,
            seriesUID: tags.seriesInstanceUID,
            sopInstanceUID: tags.sopInstanceUID,
            instanceNumber: tags.instanceNumber,
            sliceLocation: tags.sliceLocation,
          };

          if (!seriesMap.has(tags.seriesInstanceUID)) {
            seriesMap.set(tags.seriesInstanceUID, []);
          }
          seriesMap.get(tags.seriesInstanceUID)!.push(parsed);

          if (!metadataMap.has(tags.seriesInstanceUID)) {
            const meta: SeriesMetadata = { patient, study, series };
            metadataMap.set(tags.seriesInstanceUID, meta);
            DicomMetadataStore.set(tags.seriesInstanceUID, meta);
          } else {
            metadataMap.get(tags.seriesInstanceUID)!.series.instances.push(instance);
          }
        } catch (err) {
          console.warn(`Skipping file (not DICOM): ${file.name}`, err);
        } finally {
          loaded += 1;
          onProgress?.(loaded, dicomFiles.length);
        }
      })
    );
  }

  // Sort each series by instance number then slice location
  const result: ParsedSeries[] = [];
  for (const [seriesUID, instances] of seriesMap.entries()) {
    instances.sort(
      (a, b) =>
        a.instanceNumber - b.instanceNumber ||
        a.sliceLocation - b.sliceLocation
    );
    result.push({ seriesUID, instances, metadata: metadataMap.get(seriesUID)! });
  }

  return result;
}

/**
 * Release blob URLs created for a series to free memory.
 */
export function releaseSeries(series: ParsedSeries): void {
  // Uploaded browser files are registered in Cornerstone's fileManager rather
  // than as blob URLs, so there is nothing to revoke here.
  for (const instance of series.instances) {
    void instance;
  }
}
