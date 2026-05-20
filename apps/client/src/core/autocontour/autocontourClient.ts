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

const MAX_AUTOCONTOUR_VOXELS = 512 * 512 * 300;

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
  if (loadedSeries.volume.pixelData.length > MAX_AUTOCONTOUR_VOXELS) {
    throw new Error(
      `Series too large for auto-contouring (${loadedSeries.volume.pixelData.length} voxels).`
    );
  }

  return {
    modelProfileId,
    series: {
      seriesUID: loadedSeries.seriesUID,
      studyInstanceUID: loadedSeries.study.studyInstanceUID,
      studyDate: loadedSeries.study.studyDate,
      seriesDescription: loadedSeries.series.seriesDescription,
      modality: loadedSeries.series.modality,
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

export async function listAutoContourModels(signal?: AbortSignal): Promise<AutoContourModelProfile[]> {
  const response = await fetch('/api/autocontour/models', { signal });
  return readJson<AutoContourModelProfile[]>(response);
}

export async function submitAutoContourJob(
  request: AutoContourJobCreateRequest,
  signal?: AbortSignal
): Promise<AutoContourJobCreateResponse> {
  const response = await fetch('/api/autocontour/jobs', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
    signal,
  });

  return readJson<AutoContourJobCreateResponse>(response);
}

export async function getAutoContourJobStatus(jobId: string, signal?: AbortSignal): Promise<AutoContourJobStatus> {
  const response = await fetch(`/api/autocontour/jobs/${jobId}`, { signal });
  return readJson<AutoContourJobStatus>(response);
}

export async function getAutoContourJobResult(jobId: string, signal?: AbortSignal): Promise<AutoContourResultPayload> {
  const response = await fetch(`/api/autocontour/jobs/${jobId}/result`, { signal });
  const payload = await readJson<SerializableAutoContourResultPayload>(response);
  return {
    structureSet: normalizeStructureSet(payload.structureSet),
  };
}
