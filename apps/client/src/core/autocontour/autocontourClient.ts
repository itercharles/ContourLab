import type {
  AutoContourJobCreateRequest,
  AutoContourJobCreateResponse,
  AutoContourJobStatus,
  AutoContourModelProfile,
  AutoContourResultPayload,
  ContourSlice,
  Structure,
  StructureSet,
} from '@contourlab/shared-types';
import type { LoadedSeries } from '../store/volumeStore';

interface SerializableContourSlice extends Omit<ContourSlice, 'points'> {
  points: number[];
}

interface SerializableStructure extends Omit<Structure, 'contours'> {
  contours: SerializableContourSlice[];
}

interface SerializableStructureSet extends Omit<StructureSet, 'structures'> {
  structures: SerializableStructure[];
}

interface SerializableAutoContourResultPayload extends Omit<AutoContourResultPayload, 'structureSet'> {
  structureSet: SerializableStructureSet;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed with status ${response.status}.`);
  }

  return response.json() as Promise<T>;
}

function normalizeStructureSet(structureSet: SerializableStructureSet): StructureSet {
  return {
    ...structureSet,
    structures: structureSet.structures.map((structure) => ({
      ...structure,
      contours: structure.contours.map((contour) => ({
        ...contour,
        points: new Float32Array(contour.points),
      })),
    })),
  };
}

export function buildAutoContourRequest(
  loadedSeries: LoadedSeries,
  modelProfileId: string
): AutoContourJobCreateRequest {
  if (loadedSeries.series.modality !== 'CT') {
    throw new Error(`Auto-contouring currently supports CT series only, not ${loadedSeries.series.modality}.`);
  }

  return {
    modelProfileId,
    series: {
      seriesUID: loadedSeries.seriesUID,
      studyInstanceUID: loadedSeries.study.studyInstanceUID,
      studyDate: loadedSeries.study.studyDate,
      seriesDescription: loadedSeries.series.seriesDescription,
      modality: 'CT',
      dimensions: loadedSeries.volume.dimensions,
      spacing: loadedSeries.volume.spacing,
      origin: loadedSeries.volume.origin,
      directionCosines: loadedSeries.volume.directionCosines,
      windowCenter: loadedSeries.volume.windowCenter,
      windowWidth: loadedSeries.volume.windowWidth,
      pixelData: Array.from(loadedSeries.volume.pixelData),
      slices: loadedSeries.series.instances.map((instance) => ({
        sopInstanceUID: instance.sopInstanceUID,
        sliceLocation: instance.sliceLocation,
        instanceNumber: instance.instanceNumber,
      })),
    },
  };
}

export async function listAutoContourModels(): Promise<AutoContourModelProfile[]> {
  const response = await fetch('/api/autocontour/models');
  return readJson<AutoContourModelProfile[]>(response);
}

export async function submitAutoContourJob(
  request: AutoContourJobCreateRequest
): Promise<AutoContourJobCreateResponse> {
  const response = await fetch('/api/autocontour/jobs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  return readJson<AutoContourJobCreateResponse>(response);
}

export async function getAutoContourJobStatus(jobId: string): Promise<AutoContourJobStatus> {
  const response = await fetch(`/api/autocontour/jobs/${jobId}`);
  return readJson<AutoContourJobStatus>(response);
}

export async function getAutoContourJobResult(jobId: string): Promise<AutoContourResultPayload> {
  const response = await fetch(`/api/autocontour/jobs/${jobId}/result`);
  const payload = await readJson<SerializableAutoContourResultPayload>(response);
  return {
    structureSet: normalizeStructureSet(payload.structureSet),
  };
}
