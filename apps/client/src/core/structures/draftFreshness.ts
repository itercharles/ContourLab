import {
  queryRtstructInstancesForStudy,
  type DicomWebRtstructInstance,
} from '../dicom/dicomWebClient';

export type DraftCheck =
  | { status: 'current' }
  | { status: 'unchecked'; reason: string }
  | { status: 'repository-newer'; repositorySavedAt: Date; label: string };

// DICOM DA "YYYYMMDD" and TM "HHMMSS[.ffffff]" (the time may be shorter) as an instant. They carry no
// time zone; ContourLab writes them in UTC, so they are read as UTC, and a structure set from a system
// that writes local time can be off by the zone's offset.
function dicomInstant(date: string, time: string): Date | undefined {
  const day = /^(\d{4})(\d{2})(\d{2})$/.exec(date.trim());
  if (!day) return undefined;
  const clock = /^(\d{2})(\d{2})?(\d{2})?/.exec(time.trim());
  const instant = new Date(
    Date.UTC(
      Number(day[1]),
      Number(day[2]) - 1,
      Number(day[3]),
      Number(clock?.[1] ?? 0),
      Number(clock?.[2] ?? 0),
      Number(clock?.[3] ?? 0)
    )
  );
  return Number.isNaN(instant.getTime()) ? undefined : instant;
}

function savedAt(instance: DicomWebRtstructInstance): Date | undefined {
  return (
    dicomInstant(instance.structureSetDate, instance.structureSetTime) ??
    dicomInstant(instance.seriesDate, instance.seriesTime)
  );
}

/**
 * Whether the repository holds a structure set for this image series that is newer than a local
 * draft. A draft is restored without being asked for, and pushing it would replace work a colleague
 * has put in the repository since; this is what lets the caller ask first.
 *
 * It never blocks: if the repository cannot be reached the answer is 'unchecked' and the draft is
 * restored as before, because working offline from a draft is what the draft is for.
 */
export async function checkDraftAgainstRepository(
  studyInstanceUID: string | undefined,
  seriesInstanceUID: string,
  draftSavedAt: string,
  query: (studyInstanceUID: string) => Promise<DicomWebRtstructInstance[]> = queryRtstructInstancesForStudy
): Promise<DraftCheck> {
  const draftTime = new Date(draftSavedAt);
  if (!studyInstanceUID) return { status: 'unchecked', reason: 'the study is not known' };
  if (Number.isNaN(draftTime.getTime())) return { status: 'unchecked', reason: 'the draft has no save time' };

  let instances: DicomWebRtstructInstance[];
  try {
    instances = await query(studyInstanceUID);
  } catch (error) {
    return { status: 'unchecked', reason: error instanceof Error ? error.message : 'the repository could not be read' };
  }

  let newest: { at: Date; label: string } | undefined;
  for (const instance of instances) {
    if (!instance.referencedSeriesInstanceUIDs.includes(seriesInstanceUID)) continue;
    const at = savedAt(instance);
    if (!at || (newest && at <= newest.at)) continue;
    newest = { at, label: instance.structureSetLabel || instance.seriesDescription || 'RTSTRUCT' };
  }

  return newest && newest.at > draftTime
    ? { status: 'repository-newer', repositorySavedAt: newest.at, label: newest.label }
    : { status: 'current' };
}
