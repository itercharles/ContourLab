import { describe, expect, it } from 'vitest';
import type { Structure, StructureSet } from '@contourlab/shared-types';
import { analyzeRtssQuality } from '../rtssQuality';

function makeStructure(overrides: Partial<Structure> = {}): Structure {
  return {
    id: 'structure-1',
    name: 'PTV',
    type: 'PTV',
    color: [0, 0, 255],
    contours: [
      {
        referencedSOPInstanceUID: 'sop-1',
        slicePosition: 10,
        points: new Float32Array([0, 0, 10, 10, 0, 10, 10, 10, 10]),
        isClosed: true,
      },
    ],
    isVisible: true,
    isLocked: false,
    ...overrides,
  };
}

function makeStructureSet(overrides: Partial<StructureSet> = {}): StructureSet {
  return {
    id: 'ss-1',
    label: 'RTSS',
    referencedSeriesUID: 'series-1',
    version: 1,
    structures: [makeStructure()],
    source: {
      type: 'rtstruct',
      sopInstanceUID: 'rtss-sop-1',
    },
    ...overrides,
  };
}

describe('analyzeRtssQuality @links:SRS-024', () => {
  it('does not report contour geometry issues as RTSS issues', () => {
    const summary = analyzeRtssQuality(makeStructureSet({
      structures: [
        makeStructure({
          contours: [
            {
              referencedSOPInstanceUID: 'sop-1',
              slicePosition: 10,
              points: new Float32Array([0, 0, 10, 10, 0, 10, 10, 10, 10]),
              isClosed: false,
            },
          ],
        }),
      ],
    }), {
      activeSeriesUID: 'series-1',
      imageSopInstanceUIDs: ['sop-1'],
    });

    expect(summary.issues.map((issue) => issue.type)).not.toContain('open-contour');
    expect(summary.warningCount).toBe(0);
  });

  it('detects RTSS-level reference and naming issues', () => {
    const summary = analyzeRtssQuality(makeStructureSet({
      referencedSeriesUID: 'series-2',
      source: { type: 'rtstruct' },
      structures: [
        makeStructure({
          id: 'structure-1',
          name: 'PTV',
          contours: [
            {
              referencedSOPInstanceUID: 'sop-outside',
              slicePosition: 10,
              points: new Float32Array([0, 0, 10, 10, 0, 10, 10, 10, 10]),
              isClosed: true,
            },
          ],
        }),
        makeStructure({
          id: 'structure-2',
          name: 'ptv',
          contours: [],
        }),
      ],
    }), {
      activeSeriesUID: 'series-1',
      imageSopInstanceUIDs: ['sop-1'],
    });

    expect(summary.issues.map((issue) => issue.type)).toEqual(expect.arrayContaining([
      'series-mismatch',
      'missing-rtstruct-source',
      'duplicate-roi-name',
      'foreign-contour-reference',
      'empty-roi',
    ]));
    expect(summary.warningCount).toBeGreaterThanOrEqual(3);
  });

  it('skips disabled RTSS QA rules', () => {
    const summary = analyzeRtssQuality(makeStructureSet({
      structures: [
        makeStructure({ id: 'structure-1', name: 'PTV' }),
        makeStructure({ id: 'structure-2', name: 'ptv' }),
      ],
    }), {
      activeSeriesUID: 'series-1',
      imageSopInstanceUIDs: ['sop-1'],
      enabledRules: {
        'duplicate-roi-name': false,
      },
    });

    expect(summary.issues.some((issue) => issue.type === 'duplicate-roi-name')).toBe(false);
  });
});
