import type {
  AutoContourJobCreateRequest,
  AutoContourJobCreateResponse,
  AutoContourJobStatus,
  AutoContourModelProfile,
  AutoContourResultPayload,
  ContourSlice,
  Series,
  Structure,
  StructureSet,
} from '@contourlab/shared-types';
import type { LoadedSeries } from '../store/volumeStore';
import { computeVolume } from '../structures/VolumeCalculator';

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

function normalizeStructureSet(structureSet: SerializableStructureSet, sliceThickness_mm: number): StructureSet {
  return {
    ...structureSet,
    structures: structureSet.structures.map((structure) => {
      const contours = structure.contours.map((contour) => ({
        ...contour,
        points: new Float32Array(contour.points),
      }));
      const normalized: Structure = { ...structure, contours };
      normalized.volume_cc = computeVolume(normalized, sliceThickness_mm);
      return normalized;
    }),
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
        imagePositionZ: instance.imagePositionZ,
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

export async function getAutoContourJobResult(jobId: string, sliceThickness_mm: number, signal?: AbortSignal): Promise<AutoContourResultPayload> {
  const response = await fetch(`/api/autocontour/jobs/${jobId}/result`, { signal });
  const payload = await readJson<SerializableAutoContourResultPayload>(response);
  return {
    structureSet: normalizeStructureSet(payload.structureSet, sliceThickness_mm),
  };
}

const BODY_PART_SCOPE_RULES: Array<{ pattern: RegExp; keyword: string }> = [
  { pattern: /HEAD|NECK|BRAIN|CERVICAL|CRANIAL|SKULL|FACIAL|ORBIT|PAROTID|MANDIB/, keyword: 'Head' },
  { pattern: /CHEST|THORAX|LUNG|CARDIAC|HEART|MEDIASTIN|PULMON/, keyword: 'Thorax' },
  { pattern: /ABDOMEN|ABD|LIVER|PANCREA|SPLEEN|KIDNEY|RENAL|GASTRIC|STOMACH/, keyword: 'Abdomen' },
  { pattern: /PELVIS|PROSTATE|BLADDER|RECTUM|FEMUR|GYNECOLOG|UTERUS/, keyword: 'Pelvis' },
];

const DESC_SCOPE_RULES: Array<{ pattern: RegExp; keyword: string }> = [
  { pattern: /head|neck|brain|cervical|cranial|skull|orbit|parotid|mandible/, keyword: 'Head' },
  { pattern: /chest|thorax|lung|cardiac|heart/, keyword: 'Thorax' },
  { pattern: /abdomen|liver|pancrea|spleen|kidney/, keyword: 'Abdomen' },
  { pattern: /pelvis|prostate|bladder|rectum|femur/, keyword: 'Pelvis' },
];

export function inferAutoContourProfile(
  series: Series,
  models: AutoContourModelProfile[]
): string | null {
  const ctModels = models.filter((m) => m.modality === series.modality);
  if (ctModels.length === 0) return null;

  const bodyPart = (series.bodyPartExamined ?? '').toUpperCase();
  const description = (series.seriesDescription ?? '').toLowerCase();

  let matchedKeyword: string | null = null;

  for (const rule of BODY_PART_SCOPE_RULES) {
    if (rule.pattern.test(bodyPart)) {
      matchedKeyword = rule.keyword;
      break;
    }
  }

  if (!matchedKeyword) {
    for (const rule of DESC_SCOPE_RULES) {
      if (rule.pattern.test(description)) {
        matchedKeyword = rule.keyword;
        break;
      }
    }
  }

  if (!matchedKeyword) return null;

  return ctModels.find((m) => m.anatomyScope.toLowerCase().includes(matchedKeyword!.toLowerCase()))?.id ?? null;
}
