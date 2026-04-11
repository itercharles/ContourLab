import type { ContourSlice, Structure, StructureSet } from '@webtps/shared-types';

const STRUCTURE_EXPORT_VERSION = 1;

interface SerializableContourSlice {
  referencedSOPInstanceUID: string;
  slicePosition: number;
  points: number[];
  isClosed: boolean;
}

interface SerializableStructure extends Omit<Structure, 'contours' | 'meshData'> {
  contours: SerializableContourSlice[];
}

interface SerializableStructureSet extends Omit<StructureSet, 'structures'> {
  structures: SerializableStructure[];
}

export interface StructureExportPayload {
  version: number;
  exportedAt: string;
  activeStructureSetId: string | null;
  activeStructureId: string | null;
  structureSets: SerializableStructureSet[];
}

export interface ImportedStructurePayload {
  version: number;
  exportedAt: string;
  activeStructureSetId: string | null;
  activeStructureId: string | null;
  structureSets: StructureSet[];
}

function serializeContourSlice(contour: ContourSlice): SerializableContourSlice {
  return {
    referencedSOPInstanceUID: contour.referencedSOPInstanceUID,
    slicePosition: contour.slicePosition,
    points: Array.from(contour.points),
    isClosed: contour.isClosed,
  };
}

function deserializeContourSlice(contour: SerializableContourSlice): ContourSlice {
  return {
    referencedSOPInstanceUID: contour.referencedSOPInstanceUID,
    slicePosition: contour.slicePosition,
    points: new Float32Array(contour.points),
    isClosed: contour.isClosed,
  };
}

export function exportStructureSets(
  structureSets: StructureSet[],
  activeStructureSetId: string | null,
  activeStructureId: string | null
): StructureExportPayload {
  return {
    version: STRUCTURE_EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    activeStructureSetId,
    activeStructureId,
    structureSets: structureSets.map((structureSet) => ({
      ...structureSet,
      structures: structureSet.structures.map((structure) => ({
        ...structure,
        contours: structure.contours.map(serializeContourSlice),
      })),
    })),
  };
}

function validatePayload(payload: unknown): asserts payload is StructureExportPayload {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Invalid structure JSON payload.');
  }

  const candidate = payload as Partial<StructureExportPayload>;
  if (candidate.version !== STRUCTURE_EXPORT_VERSION) {
    throw new Error(`Unsupported structure JSON version: ${candidate.version ?? 'unknown'}.`);
  }

  if (!Array.isArray(candidate.structureSets)) {
    throw new Error('Structure JSON is missing structureSets.');
  }
}

export function importStructureSets(json: string): ImportedStructurePayload {
  const payload = JSON.parse(json) as unknown;
  validatePayload(payload);

  return {
    ...payload,
    structureSets: payload.structureSets.map((structureSet) => ({
      ...structureSet,
      structures: structureSet.structures.map((structure) => ({
        ...structure,
        contours: structure.contours.map(deserializeContourSlice),
      })),
    })),
  };
}
