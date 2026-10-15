import { describe, expect, it } from 'vitest';
import type { DicomWebRtstructInstance } from '../../dicom/dicomWebClient';
import { checkDraftAgainstRepository } from '../draftFreshness';

function rtstruct(patch: Partial<DicomWebRtstructInstance> = {}): DicomWebRtstructInstance {
  return {
    studyInstanceUID: 'study-1',
    seriesInstanceUID: 'rt-series',
    sopClassUID: '1.2.840.10008.5.1.4.1.1.481.3',
    sopInstanceUID: 'rt-sop',
    seriesDescription: 'RTSTRUCT Thorax',
    seriesDate: '20261001',
    seriesTime: '100000',
    structureSetLabel: 'Colleague set',
    structureSetName: '',
    structureSetDescription: '',
    structureSetDate: '20261001',
    structureSetTime: '100000',
    referencedSeriesInstanceUIDs: ['series-1'],
    ...patch,
  };
}

// `study` is null for an unknown study; undefined would pick the default.
const check = (instances: DicomWebRtstructInstance[], draftSavedAt = '2026-10-01T09:00:00.000Z', study: string | null = 'study-1') =>
  checkDraftAgainstRepository(study ?? undefined, 'series-1', draftSavedAt, async () => instances);

describe('checkDraftAgainstRepository @links:SRS-009 @testing:T6', () => {
  it('says the repository is newer when it holds a later structure set for the series', async () => {
    const result = await check([rtstruct()]);

    expect(result).toMatchObject({ status: 'repository-newer', label: 'Colleague set' });
    expect(result.status === 'repository-newer' && result.repositorySavedAt.toISOString()).toBe('2026-10-01T10:00:00.000Z');
  });

  it('is current when the draft is newer than every structure set in the repository', async () => {
    expect(await check([rtstruct()], '2026-10-01T11:00:00.000Z')).toEqual({ status: 'current' });
  });

  it('is current when there is nothing in the repository for the series', async () => {
    expect(await check([])).toEqual({ status: 'current' });
  });

  it('ignores structure sets that belong to another image series', async () => {
    expect(await check([rtstruct({ referencedSeriesInstanceUIDs: ['series-2'] })])).toEqual({ status: 'current' });
  });

  it('compares the newest structure set, whatever order they come in', async () => {
    const older = rtstruct({ structureSetTime: '080000', structureSetLabel: 'Old' });
    const newer = rtstruct({ structureSetTime: '120000', structureSetLabel: 'New' });

    expect(await check([newer, older])).toMatchObject({ label: 'New' });
    expect(await check([older, newer])).toMatchObject({ label: 'New' });
  });

  it('reads a time with fractional seconds, or no time, or only the series date', async () => {
    expect(await check([rtstruct({ structureSetTime: '100000.123456' })])).toMatchObject({ status: 'repository-newer' });
    expect(await check([rtstruct({ structureSetTime: '' })], '2026-09-30T23:00:00.000Z')).toMatchObject({ status: 'repository-newer' });
    expect(
      await check([rtstruct({ structureSetDate: '', structureSetTime: '', seriesDate: '20261001', seriesTime: '110000' })])
    ).toMatchObject({ status: 'repository-newer' });
  });

  it('skips a structure set whose date cannot be read', async () => {
    expect(
      await check([rtstruct({ structureSetDate: 'unknown', seriesDate: '', structureSetTime: '', seriesTime: '' })])
    ).toEqual({ status: 'current' });
  });

  it('does not block when the repository cannot be read, or the study or the draft time is unknown', async () => {
    const failing = await checkDraftAgainstRepository('study-1', 'series-1', '2026-10-01T09:00:00.000Z', async () => {
      throw new Error('Failed to query DICOM repository (503)');
    });
    expect(failing).toEqual({ status: 'unchecked', reason: 'Failed to query DICOM repository (503)' });

    expect(await check([rtstruct()], '2026-10-01T09:00:00.000Z', null)).toMatchObject({ status: 'unchecked' });
    expect(await check([rtstruct()], 'not a date')).toMatchObject({ status: 'unchecked' });
  });
});
