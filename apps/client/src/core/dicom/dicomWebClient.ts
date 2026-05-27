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

type DicomWebSequenceItem = Record<string, DicomWebElement>;
type DicomWebValue = Array<string | number | boolean | { Alphabetic?: string } | DicomWebSequenceItem>;
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
  bodyPartExamined?: string;
  modality: string;
  instanceCount: number;
}

export interface DicomWebRtstructInstance {
  studyInstanceUID: string;
  seriesInstanceUID: string;
  sopClassUID: string;
  sopInstanceUID: string;
  seriesDescription: string;
  seriesDate: string;
  seriesTime: string;
  structureSetLabel: string;
  structureSetName: string;
  structureSetDescription: string;
  structureSetDate: string;
  structureSetTime: string;
  predecessorSopClassUID?: string;
  predecessorSopInstanceUID?: string;
  approvalStatus?: string;
  reviewerName?: string;
  reviewDate?: string;
  reviewTime?: string;
  roiCount?: number;
  referencedSeriesInstanceUIDs: string[];
}

const DICOMWEB_BASE_URL_STORAGE_KEY = 'contourlab.dicomweb.baseUrl';

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
  return normalizeDicomWebBaseUrl(stored || DEFAULT_DICOMWEB_BASE_URL);
}

export function getDefaultDicomWebBaseUrl(): string {
  return normalizeDicomWebBaseUrl(DEFAULT_DICOMWEB_BASE_URL);
}

export function setDicomWebBaseUrl(baseUrl: string): void {
  const normalized = normalizeDicomWebBaseUrl(baseUrl);
  if (!normalized) {
    throw new Error('DICOMweb endpoint is required.');
  }

  storeDicomWebBaseUrl(normalized);
}

export function resetDicomWebBaseUrl(): void {
  clearStoredDicomWebBaseUrl();
}

const ORTHANC_UI_PATH = '/ui/app/index.html';

// Set VITE_ORTHANC_UI_URL when Orthanc is not reachable at port 8042 on the
// same host as ContourLab — e.g. reverse-proxy deployments serving it under a
// path prefix on port 80/443.
export function getOrthancUiUrl(): string {
  const explicit = (import.meta.env?.VITE_ORTHANC_UI_URL as string | undefined)?.trim();
  if (explicit) {
    try {
      const url = new URL(explicit);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        return explicit;
      }
    } catch {
      // fall through to the derived URL
    }
  }

  const base = getDicomWebBaseUrl();
  try {
    const absolute = new URL(base, window.location.origin);
    absolute.port = '8042';
    absolute.pathname = ORTHANC_UI_PATH;
    absolute.search = '';
    absolute.hash = '';
    return absolute.toString();
  } catch {
    return ORTHANC_UI_PATH;
  }
}

function normalizeDicomWebBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/$/, '');
  if (!trimmed) return '';

  try {
    const parsed = new URL(trimmed, window.location.origin);
    const isLocalOrthanc =
      ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname) &&
      parsed.port === '8042' &&
      parsed.pathname.replace(/\/$/, '') === '/dicom-web';
    const currentPort = new URL(window.location.href).port;

    if (isLocalOrthanc && currentPort !== '8042') {
      return '/dicom-web';
    }
  } catch {
    // Keep the original relative value when URL parsing is unavailable.
  }

  return trimmed;
}

export async function queryDicomWebSeries(): Promise<DicomWebSeriesSummary[]> {
  const url = new URL(`${getDicomWebBaseUrl()}/series`, window.location.origin);

  for (const field of [
    'PatientName',
    'PatientID',
    'StudyDate',
    'StudyDescription',
    'SeriesDescription',
    'BodyPartExamined',
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

function multipartBoundary(): string {
  return `contourlab-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export async function uploadDicomBlobToRepository(blob: Blob): Promise<void> {
  const boundary = multipartBoundary();
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
        const predecessor = getRtstructPredecessorReference(dataset);

        return [{
          studyInstanceUID,
          seriesInstanceUID: series.seriesInstanceUID,
          sopClassUID: getStringValue(dataset, '00080016', '1.2.840.10008.5.1.4.1.1.481.3'),
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
          structureSetLabel: getStringValue(dataset, '30060002'),
          structureSetName: getStringValue(dataset, '30060004'),
          structureSetDescription: getStringValue(dataset, '30060006'),
          structureSetDate: getStringValue(dataset, '30060008'),
          structureSetTime: getStringValue(dataset, '30060009'),
          predecessorSopClassUID: predecessor?.sopClassUID,
          predecessorSopInstanceUID: predecessor?.sopInstanceUID,
          approvalStatus: getOptionalStringValue(dataset, '300E0002'),
          reviewerName: getPersonName(dataset, '300E0008') || undefined,
          reviewDate: getOptionalStringValue(dataset, '300E0004'),
          reviewTime: getOptionalStringValue(dataset, '300E0005'),
          roiCount: getSequenceLength(dataset, '30060020'),
          referencedSeriesInstanceUIDs: getRtstructReferencedSeriesInstanceUIDs(dataset),
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

function getSequenceItems(dataset: DicomWebDataset, tag: string): DicomWebSequenceItem[] {
  const value = dataset[tag]?.Value;
  if (!Array.isArray(value)) return [];

  return value.filter((item): item is DicomWebSequenceItem => (
    typeof item === 'object' &&
    item !== null &&
    !Array.isArray(item) &&
    !('Alphabetic' in item)
  ));
}

function getRtstructReferencedSeriesInstanceUIDs(dataset: DicomWebDataset): string[] {
  const referencedSeriesUIDs = new Set<string>();

  for (const frameReference of getSequenceItems(dataset, '30060010')) {
    for (const studyReference of getSequenceItems(frameReference, '30060012')) {
      for (const seriesReference of getSequenceItems(studyReference, '30060014')) {
        const seriesUID = getStringValue(seriesReference, '0020000E');
        if (seriesUID) {
          referencedSeriesUIDs.add(seriesUID);
        }
      }
    }
  }

  return Array.from(referencedSeriesUIDs);
}

function getRtstructPredecessorReference(dataset: DicomWebDataset): {
  sopClassUID: string;
  sopInstanceUID: string;
} | null {
  const predecessor = getSequenceItems(dataset, '30060018')[0];
  if (!predecessor) return null;

  const sopClassUID = getStringValue(predecessor, '00081150');
  const sopInstanceUID = getStringValue(predecessor, '00081155');
  if (!sopClassUID || !sopInstanceUID) return null;

  return { sopClassUID, sopInstanceUID };
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
    imagePositionZ: instance.imagePositionZ,
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
  getRtstructPredecessorReference,
  getRtstructReferencedSeriesInstanceUIDs,
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
      bodyPartExamined: getOptionalStringValue(dataset, '00180015'),
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
    imagePositionZ: normalized.imagePositionPatient[2],
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
    bodyPartExamined: summary.bodyPartExamined,
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

function getOptionalStringValue(dataset: DicomWebDataset, tag: string): string | undefined {
  const value = getStringValue(dataset, tag);
  return value || undefined;
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
