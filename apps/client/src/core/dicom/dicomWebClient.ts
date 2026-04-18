import { wadors, type Types as DicomImageLoaderTypes } from '@cornerstonejs/dicom-image-loader';
import type { LoadedSeries } from '../store/volumeStore';
import { buildVolume } from './VolumeBuilder';
import {
  buildImageMetadata,
  buildMetadata,
  DicomMetadataStore,
  type NormalizedDicomMetadata,
} from './DicomMetadataStore';
import type { ParsedInstance, ParsedSeries } from './DicomLoader';

type DicomWebValue = string[] | number[] | boolean[] | Array<{ Alphabetic?: string }>;
type DicomWebElement = { Value?: DicomWebValue };
type DicomWebDataset = Record<string, DicomWebElement>;

export interface DicomWebSeriesSummary {
  studyInstanceUID: string;
  seriesInstanceUID: string;
  patientName: string;
  patientId: string;
  studyDate: string;
  studyDescription: string;
  seriesDescription: string;
  modality: string;
  instanceCount: number;
}

export interface DicomWebRtstructInstance {
  studyInstanceUID: string;
  seriesInstanceUID: string;
  sopInstanceUID: string;
  seriesDescription: string;
  seriesDate: string;
  seriesTime: string;
  roiCount?: number;
}

const DICOMWEB_BASE_URL_STORAGE_KEY = 'webtps.dicomweb.baseUrl';

const DEFAULT_DICOMWEB_BASE_URL =
  (import.meta.env.VITE_DICOMWEB_BASE_URL as string | undefined) ?? '/dicom-web';
let fallbackDicomWebBaseUrl: string | null = null;

function getStoredDicomWebBaseUrl(): string | null {
  try {
    const storage = window.localStorage;
    if (typeof storage?.getItem !== 'function') {
      return fallbackDicomWebBaseUrl;
    }

    return storage.getItem(DICOMWEB_BASE_URL_STORAGE_KEY) ?? fallbackDicomWebBaseUrl;
  } catch {
    return fallbackDicomWebBaseUrl;
  }
}

function storeDicomWebBaseUrl(baseUrl: string): void {
  fallbackDicomWebBaseUrl = baseUrl;
  try {
    const storage = window.localStorage;
    if (typeof storage?.setItem === 'function') {
      storage.setItem(DICOMWEB_BASE_URL_STORAGE_KEY, baseUrl);
    }
  } catch {
    // Browser storage may be unavailable in restricted or test environments.
  }
}

function clearStoredDicomWebBaseUrl(): void {
  fallbackDicomWebBaseUrl = null;
  try {
    const storage = window.localStorage;
    if (typeof storage?.removeItem === 'function') {
      storage.removeItem(DICOMWEB_BASE_URL_STORAGE_KEY);
    }
  } catch {
    // Browser storage may be unavailable in restricted or test environments.
  }
}

export function getDicomWebBaseUrl(): string {
  const stored = getStoredDicomWebBaseUrl();
  return (stored || DEFAULT_DICOMWEB_BASE_URL).replace(/\/$/, '');
}

export function getDefaultDicomWebBaseUrl(): string {
  return DEFAULT_DICOMWEB_BASE_URL.replace(/\/$/, '');
}

export function setDicomWebBaseUrl(baseUrl: string): void {
  const normalized = baseUrl.trim().replace(/\/$/, '');
  if (!normalized) {
    throw new Error('DICOMweb endpoint is required.');
  }

  storeDicomWebBaseUrl(normalized);
}

export function resetDicomWebBaseUrl(): void {
  clearStoredDicomWebBaseUrl();
}

export async function queryDicomWebSeries(): Promise<DicomWebSeriesSummary[]> {
  const url = new URL(`${getDicomWebBaseUrl()}/series`, window.location.origin);

  for (const field of [
    'PatientName',
    'PatientID',
    'StudyDate',
    'StudyDescription',
    'SeriesDescription',
    'Modality',
    'StudyInstanceUID',
    'SeriesInstanceUID',
    'NumberOfSeriesRelatedInstances',
  ]) {
    url.searchParams.append('includefield', field);
  }

  const response = await fetch(url, {
    headers: {
      Accept: 'application/dicom+json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to query DICOM repository (${response.status})`);
  }

  const payload = (await response.json()) as DicomWebDataset[];
  return buildSeriesSummaries(payload)
    .filter(isPlanningCtSeries)
    .sort((a, b) => {
      const dateCompare = b.studyDate.localeCompare(a.studyDate);
      if (dateCompare !== 0) {
        return dateCompare;
      }

      return a.seriesDescription.localeCompare(b.seriesDescription);
    });
}

export async function uploadDicomWebStudies(files: File[]): Promise<void> {
  if (files.length === 0) {
    return;
  }

  const boundary = `webtps-${crypto.randomUUID()}`;
  const bodyParts: BlobPart[] = [];

  for (const file of files) {
    bodyParts.push(`--${boundary}\r\n`);
    bodyParts.push('Content-Type: application/dicom\r\n');
    bodyParts.push('\r\n');
    bodyParts.push(file);
    bodyParts.push('\r\n');
  }

  bodyParts.push(`--${boundary}--\r\n`);

  const response = await fetch(`${getDicomWebBaseUrl()}/studies`, {
    method: 'POST',
    headers: {
      Accept: 'application/dicom+json',
      'Content-Type': `multipart/related; type=application/dicom; boundary=${boundary}`,
    },
    body: new Blob(bodyParts),
  });

  if (!response.ok) {
    throw new Error(`Failed to upload DICOM instances (${response.status})`);
  }
}

export async function uploadDicomBlobToRepository(blob: Blob): Promise<void> {
  const boundary = `webtps-${crypto.randomUUID()}`;
  const body = new Blob([
    `--${boundary}\r\n`,
    'Content-Type: application/dicom\r\n',
    '\r\n',
    blob,
    '\r\n',
    `--${boundary}--\r\n`,
  ]);

  const response = await fetch(`${getDicomWebBaseUrl()}/studies`, {
    method: 'POST',
    headers: {
      Accept: 'application/dicom+json',
      'Content-Type': `multipart/related; type=application/dicom; boundary=${boundary}`,
    },
    body,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload DICOM object (${response.status})`);
  }
}

export async function queryRtstructInstancesForStudy(
  studyInstanceUID: string
): Promise<DicomWebRtstructInstance[]> {
  const seriesUrl = new URL(`${getDicomWebBaseUrl()}/series`, window.location.origin);
  seriesUrl.searchParams.append('StudyInstanceUID', studyInstanceUID);
  for (const field of [
    'StudyInstanceUID',
    'SeriesInstanceUID',
    'SeriesDescription',
    'SeriesDate',
    'SeriesTime',
    'Modality',
  ]) {
    seriesUrl.searchParams.append('includefield', field);
  }

  const seriesResponse = await fetch(seriesUrl, {
    headers: {
      Accept: 'application/dicom+json',
    },
  });

  if (!seriesResponse.ok) {
    throw new Error(`Failed to query RTSTRUCT series (${seriesResponse.status})`);
  }

  const seriesPayload = (await seriesResponse.json()) as DicomWebDataset[];
  const rtstructSeries = buildSeriesSummaries(seriesPayload)
    .filter((series) => series.studyInstanceUID === studyInstanceUID && series.modality === 'RTSTRUCT')
    .sort((a, b) => b.seriesDescription.localeCompare(a.seriesDescription));

  const instances = await Promise.all(
    rtstructSeries.map(async (series) => {
      const metadataUrl = `${getDicomWebBaseUrl()}/studies/${encodeURIComponent(
        studyInstanceUID
      )}/series/${encodeURIComponent(series.seriesInstanceUID)}/metadata`;
      const metadataResponse = await fetch(metadataUrl, {
        headers: {
          Accept: 'application/dicom+json',
        },
      });

      if (!metadataResponse.ok) {
        throw new Error(`Failed to query RTSTRUCT metadata (${metadataResponse.status})`);
      }

      const metadataPayload = (await metadataResponse.json()) as DicomWebDataset[];
      return metadataPayload.flatMap((dataset) => {
        const sopInstanceUID = getStringValue(dataset, '00080018');
        if (!sopInstanceUID) return [];

        return [{
          studyInstanceUID,
          seriesInstanceUID: series.seriesInstanceUID,
          sopInstanceUID,
          seriesDescription: series.seriesDescription,
          seriesDate: getStringValue(
            dataset,
            '00080021',
            getStringValue(dataset, '00080023', getStringValue(dataset, '00080012'))
          ),
          seriesTime: getStringValue(
            dataset,
            '00080031',
            getStringValue(dataset, '00080033', getStringValue(dataset, '00080013'))
          ),
          roiCount: getSequenceLength(dataset, '30060020'),
        }];
      });
    })
  );

  return instances
    .flat()
    .sort((a, b) => `${b.seriesDate}${b.seriesTime}`.localeCompare(`${a.seriesDate}${a.seriesTime}`));
}

function getSequenceLength(dataset: DicomWebDataset, tag: string): number | undefined {
  const value = dataset[tag]?.Value;
  return Array.isArray(value) ? value.length : undefined;
}

export async function retrieveDicomWebInstance(instance: DicomWebRtstructInstance): Promise<ArrayBuffer> {
  const response = await fetch(
    `${getDicomWebBaseUrl()}/studies/${encodeURIComponent(instance.studyInstanceUID)}` +
      `/series/${encodeURIComponent(instance.seriesInstanceUID)}` +
      `/instances/${encodeURIComponent(instance.sopInstanceUID)}`,
    {
      headers: {
        Accept: 'multipart/related; type=application/dicom, application/dicom',
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to retrieve DICOM instance (${response.status})`);
  }

  const buffer = await response.arrayBuffer();
  const contentType = response.headers.get('content-type') ?? '';
  return extractDicomPart(buffer, contentType);
}

export async function loadSeriesFromDicomWeb(
  summary: DicomWebSeriesSummary
): Promise<LoadedSeries> {
  const metadataUrl = `${getDicomWebBaseUrl()}/studies/${encodeURIComponent(
    summary.studyInstanceUID
  )}/series/${encodeURIComponent(summary.seriesInstanceUID)}/metadata`;

  const response = await fetch(metadataUrl, {
    headers: {
      Accept: 'application/dicom+json',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch series metadata (${response.status})`);
  }

  const payload = (await response.json()) as DicomWebDataset[];

  if (payload.length === 0) {
    throw new Error('Series metadata is empty');
  }

  const instances: ParsedInstance[] = payload
    .map((dataset) => parseInstance(dataset, summary))
    .sort(
      (a, b) =>
        a.instanceNumber - b.instanceNumber ||
        a.sliceLocation - b.sliceLocation
    );

  const firstInstance = parseNormalizedMetadata(payload[0], summary);
  const metadata = buildMetadata(firstInstance);
  metadata.series.instances = instances.map((instance) => ({
    sopInstanceUID: instance.sopInstanceUID,
    instanceNumber: instance.instanceNumber,
    sliceLocation: instance.sliceLocation,
  }));

  const parsedSeries: ParsedSeries = {
    seriesUID: summary.seriesInstanceUID,
    instances,
    metadata,
  };

  DicomMetadataStore.set(summary.seriesInstanceUID, parsedSeries.metadata);

  return buildVolume(parsedSeries);
}

export const __testables__ = {
  buildSeriesSummaries,
  extractDicomPart,
  isPlanningCtSeries,
};

function isPlanningCtSeries(series: DicomWebSeriesSummary): boolean {
  if (series.modality !== 'CT') return false;

  return !/\b(cbct|cone[-\s]?beam|localizer|scout)\b/i.test(series.seriesDescription);
}

function buildSeriesSummaries(payload: DicomWebDataset[]): DicomWebSeriesSummary[] {
  return payload
    .map((dataset) => ({
      studyInstanceUID: getStringValue(dataset, '0020000D'),
      seriesInstanceUID: getStringValue(dataset, '0020000E'),
      patientName: getPersonName(dataset, '00100010'),
      patientId: getStringValue(dataset, '00100020'),
      studyDate: getStringValue(dataset, '00080020'),
      studyDescription: getStringValue(dataset, '00081030'),
      seriesDescription: getStringValue(dataset, '0008103E'),
      modality: getStringValue(dataset, '00080060', 'CT'),
      instanceCount: getNumberValue(dataset, '00201209', 0),
    }))
    .filter((series) => Boolean(series.studyInstanceUID && series.seriesInstanceUID));
}

function extractDicomPart(buffer: ArrayBuffer, contentType: string): ArrayBuffer {
  if (!contentType.toLowerCase().includes('multipart/related')) {
    return buffer;
  }

  const boundary = contentType.match(/boundary="?([^";]+)"?/i)?.[1];
  if (!boundary) {
    return buffer;
  }

  const bytes = new Uint8Array(buffer);
  const latin1 = new TextDecoder('latin1').decode(bytes);
  const partHeaderStart = latin1.indexOf(`--${boundary}`);
  if (partHeaderStart === -1) {
    return buffer;
  }

  const headerEnd = latin1.indexOf('\r\n\r\n', partHeaderStart);
  if (headerEnd === -1) {
    return buffer;
  }

  const dataStart = headerEnd + 4;
  const nextBoundary = latin1.indexOf(`\r\n--${boundary}`, dataStart);
  const dataEnd = nextBoundary === -1 ? bytes.length : nextBoundary;
  return bytes.slice(dataStart, dataEnd).buffer;
}

function parseInstance(
  dataset: DicomWebDataset,
  summary: DicomWebSeriesSummary
): ParsedInstance {
  const normalized = parseNormalizedMetadata(dataset, summary);
  const imageId =
    `wadors:${getDicomWebBaseUrl()}/studies/${encodeURIComponent(summary.studyInstanceUID)}` +
    `/series/${encodeURIComponent(summary.seriesInstanceUID)}` +
    `/instances/${encodeURIComponent(normalized.sopInstanceUID)}/frames/1`;

  wadors.metaDataManager.add(
    imageId,
    dataset as unknown as DicomImageLoaderTypes.WADORSMetaData
  );
  DicomMetadataStore.setImageMetadata(imageId, buildImageMetadata(normalized));

  return {
    imageId,
    seriesUID: summary.seriesInstanceUID,
    sopInstanceUID: normalized.sopInstanceUID,
    instanceNumber: normalized.instanceNumber,
    sliceLocation: normalized.sliceLocation,
  };
}

function parseNormalizedMetadata(
  dataset: DicomWebDataset,
  summary: DicomWebSeriesSummary
): NormalizedDicomMetadata {
  const imagePositionPatient = getNumberArray(dataset, '00200032', [0, 0, 0]);
  const imageOrientationPatient = getNumberArray(dataset, '00200037', [
    1, 0, 0, 0, 1, 0,
  ]);
  const pixelSpacing = getNumberArray(dataset, '00280030', [1, 1]);

  return {
    sopInstanceUID: getStringValue(dataset, '00080018'),
    seriesInstanceUID: summary.seriesInstanceUID,
    studyInstanceUID: summary.studyInstanceUID,
    instanceNumber: getNumberValue(dataset, '00200013', 0),
    sliceLocation: getNumberValue(dataset, '00201041', imagePositionPatient[2] ?? 0),
    patientName: summary.patientName,
    patientID: summary.patientId,
    studyDate: summary.studyDate,
    studyDescription: summary.studyDescription,
    seriesDescription: summary.seriesDescription,
    modality: summary.modality,
    rows: getNumberValue(dataset, '00280010', 512),
    columns: getNumberValue(dataset, '00280011', 512),
    pixelSpacing: [pixelSpacing[0] ?? 1, pixelSpacing[1] ?? 1],
    sliceThickness: getNumberValue(dataset, '00180050', 1),
    imagePositionPatient: [
      imagePositionPatient[0] ?? 0,
      imagePositionPatient[1] ?? 0,
      imagePositionPatient[2] ?? 0,
    ],
    imageOrientationPatient,
    samplesPerPixel: getNumberValue(dataset, '00280002', 1),
    photometricInterpretation: getStringValue(dataset, '00280004', 'MONOCHROME2'),
    bitsAllocated: getNumberValue(dataset, '00280100', 16),
    bitsStored: getNumberValue(dataset, '00280101', 16),
    highBit: getNumberValue(dataset, '00280102', 15),
    pixelRepresentation: getNumberValue(dataset, '00280103', 1),
    transferSyntaxUID: getStringValue(dataset, '00020010', '1.2.840.10008.1.2.1'),
    frameOfReferenceUID: getStringValue(dataset, '00200052'),
    windowCenter: getNumberValueOrUndefined(dataset, '00281050'),
    windowWidth: getNumberValueOrUndefined(dataset, '00281051'),
  };
}

function getStringValue(dataset: DicomWebDataset, tag: string, fallback = ''): string {
  const value = dataset[tag]?.Value?.[0];

  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number') {
    return String(value);
  }

  return fallback;
}

function getPersonName(dataset: DicomWebDataset, tag: string): string {
  const value = dataset[tag]?.Value?.[0];

  if (value && typeof value === 'object' && 'Alphabetic' in value && typeof value.Alphabetic === 'string') {
    return value.Alphabetic.trim();
  }

  if (typeof value === 'string') {
    return value.trim();
  }

  return '';
}

function getNumberValue(dataset: DicomWebDataset, tag: string, fallback = 0): number {
  const value = dataset[tag]?.Value?.[0];

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function getNumberValueOrUndefined(dataset: DicomWebDataset, tag: string): number | undefined {
  const value = dataset[tag]?.Value?.[0];

  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function getNumberArray(dataset: DicomWebDataset, tag: string, fallback: number[]): number[] {
  const values = dataset[tag]?.Value;

  if (!Array.isArray(values)) {
    return fallback;
  }

  const parsed = values
    .map((value) => (typeof value === 'number' ? value : Number(value)))
    .filter((value) => Number.isFinite(value));

  return parsed.length > 0 ? parsed : fallback;
}
