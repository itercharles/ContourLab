import { describe, expect, it } from 'vitest';
import type { Structure } from '@webtps/shared-types';
import { analyzeContourQuality } from '../contourQuality';

function makeStructure(contours: Structure['contours']): Structure {
  return {
    id: 'structure-1',
    name: 'PTV',
    type: 'PTV',
    color: [0, 0, 255],
    contours,
    isVisible: true,
    isLocked: false,
  };
}

function squareContour(z: number, size: number, isClosed = true): Structure['contours'][number] {
  return {
    referencedSOPInstanceUID: `sop-${z}`,
    slicePosition: z,
    points: new Float32Array([
      0, 0, z,
      size, 0, z,
      size, size, z,
      0, size, z,
    ]),
    isClosed,
  };
}

describe('analyzeContourQuality', () => {
  it('reports empty structures as informational QA items', () => {
    const summary = analyzeContourQuality(makeStructure([]), 2.5);

    expect(summary.warningCount).toBe(0);
    expect(summary.issues[0]).toEqual(expect.objectContaining({
      type: 'empty',
      severity: 'info',
    }));
  });

  it('detects open contours, slice gaps, and abrupt area changes', () => {
    const summary = analyzeContourQuality(makeStructure([
      squareContour(0, 10),
      squareContour(5, 10, false),
      squareContour(10, 40),
    ]), 2.5);

    expect(summary.issues.map((issue) => issue.type)).toEqual(expect.arrayContaining([
      'open-contour',
      'slice-gap',
      'area-jump',
    ]));
    expect(summary.warningCount).toBeGreaterThanOrEqual(3);
  });

  it('detects centroid jumps and contours outside image bounds', () => {
    const summary = analyzeContourQuality(
      makeStructure([
        squareContour(0, 10),
        {
          referencedSOPInstanceUID: 'sop-5',
          slicePosition: 5,
          points: new Float32Array([
            40, 0, 5,
            50, 0, 5,
            50, 10, 5,
            40, 10, 5,
          ]),
          isClosed: true,
        },
        {
          referencedSOPInstanceUID: 'sop-10',
          slicePosition: 10,
          points: new Float32Array([
            -2, 0, 10,
            8, 0, 10,
            8, 10, 10,
            -2, 10, 10,
          ]),
          isClosed: true,
        },
      ]),
      {
        sliceSpacingMm: 2.5,
        imageBounds: {
          minX: 0,
          maxX: 30,
          minY: 0,
          maxY: 30,
        },
      }
    );

    expect(summary.issues.map((issue) => issue.type)).toEqual(expect.arrayContaining([
      'centroid-jump',
      'out-of-bounds',
    ]));
  });

  it('skips disabled contour QA rules', () => {
    const summary = analyzeContourQuality(
      makeStructure([
        squareContour(0, 10),
        squareContour(5, 10, false),
      ]),
      {
        sliceSpacingMm: 2.5,
        enabledRules: {
          'open-contour': false,
        },
      }
    );

    expect(summary.issues.some((issue) => issue.type === 'open-contour')).toBe(false);
  });
});
