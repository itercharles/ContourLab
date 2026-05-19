import { describe, expect, it } from 'vitest';
import type { DicomWebRtstructInstance } from './dicomWebClient';
import { buildRtstructHistoryGroups, findRtstructHistoryGroup } from './rtstructHistory';

function rtstruct(
  sopInstanceUID: string,
  predecessorSopInstanceUID?: string
): DicomWebRtstructInstance {
  return {
    studyInstanceUID: 'study-1',
    seriesInstanceUID: `rtss-series-${sopInstanceUID}`,
    sopClassUID: '1.2.840.10008.5.1.4.1.1.481.3',
    sopInstanceUID,
    seriesDescription: `RTSTRUCT ${sopInstanceUID}`,
    seriesDate: '20260411',
    seriesTime: sopInstanceUID === 'rtss-3' ? '120000' : sopInstanceUID === 'rtss-2' ? '110000' : '100000',
    structureSetLabel: 'RTSS',
    structureSetName: 'RTSS',
    structureSetDescription: '',
    structureSetDate: '20260411',
    structureSetTime: sopInstanceUID === 'rtss-3' ? '120000' : sopInstanceUID === 'rtss-2' ? '110000' : '100000',
    predecessorSopClassUID: predecessorSopInstanceUID ? '1.2.840.10008.5.1.4.1.1.481.3' : undefined,
    predecessorSopInstanceUID,
    referencedSeriesInstanceUIDs: ['series-1'],
  };
}

describe('rtstructHistory @links:SRS-019', () => {
  it('groups RTSTRUCT objects by the standard predecessor chain', () => {
    const groups = buildRtstructHistoryGroups([
      rtstruct('rtss-1'),
      rtstruct('rtss-2', 'rtss-1'),
      rtstruct('rtss-3', 'rtss-2'),
      rtstruct('standalone'),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups[0].versions.map((version) => version.sopInstanceUID)).toEqual([
      'rtss-3',
      'rtss-2',
      'rtss-1',
    ]);
    expect(groups[1].versions.map((version) => version.sopInstanceUID)).toEqual([
      'standalone',
    ]);
  });

  it('marks a referenced predecessor as missing when it is not query-visible', () => {
    const group = findRtstructHistoryGroup([
      rtstruct('rtss-2', 'rtss-missing'),
    ], 'rtss-2');

    expect(group?.versions.map((version) => version.sopInstanceUID)).toEqual(['rtss-2']);
    expect(group?.hasMissingPredecessor).toBe(true);
  });
});
