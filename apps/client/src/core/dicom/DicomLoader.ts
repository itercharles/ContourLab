import { parseDicomTags, buildMetadata, DicomMetadataStore } from './DicomMetadataStore';
import type { SeriesMetadata } from './DicomMetadataStore';

export interface ParsedInstance {
  file: File;
  blobUrl: string;
  wadouriId: string;
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
 */
export async function loadFiles(
  files: File[],
  onProgress?: (loaded: number, total: number) => void
): Promise<ParsedSeries[]> {
  const seriesMap = new Map<string, ParsedInstance[]>();
  const metadataMap = new Map<string, SeriesMetadata>();

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    onProgress?.(i, files.length);

    try {
      const tags = await parseDicomTags(file);
      const { patient, study, series, instance } = buildMetadata(tags);

      const blobUrl = URL.createObjectURL(file);
      const wadouriId = `wadouri:${blobUrl}`;

      const parsed: ParsedInstance = {
        file,
        blobUrl,
        wadouriId,
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
        // Accumulate instances into the series
        const existing = metadataMap.get(tags.seriesInstanceUID)!;
        existing.series.instances.push(instance);
      }
    } catch (err) {
      console.warn(`Failed to parse DICOM file: ${file.name}`, err);
    }
  }

  onProgress?.(files.length, files.length);

  // Sort each series by instance number then slice location
  const result: ParsedSeries[] = [];
  for (const [seriesUID, instances] of seriesMap.entries()) {
    instances.sort(
      (a, b) =>
        a.instanceNumber - b.instanceNumber ||
        a.sliceLocation - b.sliceLocation
    );

    const metadata = metadataMap.get(seriesUID)!;
    result.push({ seriesUID, instances, metadata });
  }

  return result;
}

/**
 * Release blob URLs created for a series to free memory.
 */
export function releaseSeries(series: ParsedSeries): void {
  for (const instance of series.instances) {
    URL.revokeObjectURL(instance.blobUrl);
  }
}
