import type { DicomWebRtstructInstance } from './dicomWebClient';

export interface RtstructHistoryGroup {
  id: string;
  latest: DicomWebRtstructInstance;
  versions: DicomWebRtstructInstance[];
  hasMissingPredecessor: boolean;
}

export function compareRtstructVersions(
  a: DicomWebRtstructInstance,
  b: DicomWebRtstructInstance
): number {
  const dateTimeA = `${a.structureSetDate || a.seriesDate}${a.structureSetTime || a.seriesTime}`;
  const dateTimeB = `${b.structureSetDate || b.seriesDate}${b.structureSetTime || b.seriesTime}`;
  const dateCompare = dateTimeB.localeCompare(dateTimeA);
  if (dateCompare !== 0) return dateCompare;

  return b.sopInstanceUID.localeCompare(a.sopInstanceUID);
}

export function buildRtstructHistoryGroups(
  instances: DicomWebRtstructInstance[]
): RtstructHistoryGroup[] {
  const bySop = new Map(instances.map((instance) => [instance.sopInstanceUID, instance]));
  const predecessorSops = new Set(
    instances
      .map((instance) => instance.predecessorSopInstanceUID)
      .filter((sop): sop is string => Boolean(sop))
  );
  const latestCandidates = instances.filter(
    (instance) => !predecessorSops.has(instance.sopInstanceUID)
  );
  const visited = new Set<string>();

  const groups = latestCandidates.map((latest) => {
    const versions: DicomWebRtstructInstance[] = [];
    let cursor: DicomWebRtstructInstance | undefined = latest;
    let hasMissingPredecessor = false;

    while (cursor && !visited.has(cursor.sopInstanceUID)) {
      versions.push(cursor);
      visited.add(cursor.sopInstanceUID);
      const predecessorSop = cursor.predecessorSopInstanceUID;
      if (!predecessorSop) break;

      const predecessor = bySop.get(predecessorSop);
      if (!predecessor) {
        hasMissingPredecessor = true;
        break;
      }
      cursor = predecessor;
    }

    return {
      id: latest.sopInstanceUID,
      latest,
      versions,
      hasMissingPredecessor,
    };
  });

  const unvisitedGroups = instances
    .filter((instance) => !visited.has(instance.sopInstanceUID))
    .map((instance) => ({
      id: instance.sopInstanceUID,
      latest: instance,
      versions: [instance],
      hasMissingPredecessor: Boolean(instance.predecessorSopInstanceUID),
    }));

  return [...groups, ...unvisitedGroups].sort((a, b) =>
    compareRtstructVersions(a.latest, b.latest)
  );
}

export function findRtstructHistoryGroup(
  instances: DicomWebRtstructInstance[],
  sopInstanceUID: string | undefined
): RtstructHistoryGroup | null {
  if (!sopInstanceUID) return null;
  return buildRtstructHistoryGroups(instances).find((group) =>
    group.versions.some((version) => version.sopInstanceUID === sopInstanceUID)
  ) ?? null;
}
