import { describe, expect, it } from 'vitest';
import type { Volume } from '@contourlab/shared-types';
import { computeMarginContoursForStructure } from '../MarginContourEngine';

const volume: Volume = {
  seriesUID: 'series-1',
  dimensions: [32, 32, 2],
  spacing: [1, 1, 10],
  origin: [0, 0, 0],
  directionCosines: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  pixelData: new Float32Array(32 * 32 * 2),
  windowCenter: 40,
  windowWidth: 400,
};

describe('computeMarginContoursForStructure @links:SRS-014 @testing:T8', () => {
  it('expands contours on occupied slices', () => {
    const contours = [
      {
        referencedSOPInstanceUID: 'sop-0',
        slicePosition: 0,
        points: new Float32Array([8, 8, 0, 16, 8, 0, 16, 16, 0, 8, 16, 0]),
        isClosed: true,
      },
    ];
    const frames = [
      { sopInstanceUID: 'sop-0', sliceLocation: 0 },
      { sopInstanceUID: 'sop-10', sliceLocation: 10 },
    ];

    const nextContours = computeMarginContoursForStructure(contours, frames, volume, 2);

    expect(nextContours).toHaveLength(1);
    const xs = Array.from(nextContours[0].points).filter((_, index) => index % 3 === 0);
    const ys = Array.from(nextContours[0].points).filter((_, index) => index % 3 === 1);
    expect(Math.min(...xs)).toBeLessThan(8);
    expect(Math.max(...xs)).toBeGreaterThan(16);
    expect(Math.min(...ys)).toBeLessThan(8);
    expect(Math.max(...ys)).toBeGreaterThan(16);
  });

  it('contracts contours and can remove tiny slices', () => {
    const contours = [
      {
        referencedSOPInstanceUID: 'sop-0',
        slicePosition: 0,
        points: new Float32Array([8, 8, 0, 10, 8, 0, 10, 10, 0, 8, 10, 0]),
        isClosed: true,
      },
    ];
    const frames = [
      { sopInstanceUID: 'sop-0', sliceLocation: 0 },
      { sopInstanceUID: 'sop-10', sliceLocation: 10 },
    ];

    const nextContours = computeMarginContoursForStructure(contours, frames, volume, -2);

    expect(nextContours).toHaveLength(0);
  });

  it('grows every separate piece, not only the largest', () => {
    const square = (min: number, max: number) => ({
      referencedSOPInstanceUID: 'sop-0',
      slicePosition: 0,
      points: new Float32Array([min, min, 0, max, min, 0, max, max, 0, min, max, 0]),
      isClosed: true,
    });
    const frames = [{ sopInstanceUID: 'sop-0', sliceLocation: 0 }];

    const nextContours = computeMarginContoursForStructure([square(2, 8), square(20, 30)], frames, volume, 1);

    expect(nextContours).toHaveLength(2);
  });

  it('keeps a hole when a ring is grown, and the hole gets smaller', () => {
    const square = (min: number, max: number) => ({
      referencedSOPInstanceUID: 'sop-0',
      slicePosition: 0,
      points: new Float32Array([min, min, 0, max, min, 0, max, max, 0, min, max, 0]),
      isClosed: true,
    });
    const frames = [{ sopInstanceUID: 'sop-0', sliceLocation: 0 }];
    const spanOf = (contour: { points: Float32Array }) => {
      const xs = Array.from(contour.points).filter((_, index) => index % 3 === 0);
      return Math.max(...xs) - Math.min(...xs);
    };

    // An outer outline with a nested one inside it is a ring (even-odd).
    const nextContours = computeMarginContoursForStructure([square(4, 24), square(10, 18)], frames, volume, 2);

    expect(nextContours).toHaveLength(2);
    const spans = nextContours.map(spanOf).sort((a, b) => a - b);
    expect(spans[0]).toBeLessThan(8); // hole was 8 wide
    expect(spans[1]).toBeGreaterThan(20); // outline was 20 wide
  });

  it('keeps the contours on slices that match no image frame', () => {
    const orphan = {
      referencedSOPInstanceUID: 'sop-50',
      slicePosition: 50,
      points: new Float32Array([8, 8, 50, 16, 8, 50, 16, 16, 50, 8, 16, 50]),
      isClosed: true,
    };
    const inFrame = {
      referencedSOPInstanceUID: 'sop-0',
      slicePosition: 0,
      points: new Float32Array([8, 8, 0, 16, 8, 0, 16, 16, 0, 8, 16, 0]),
      isClosed: true,
    };

    const nextContours = computeMarginContoursForStructure(
      [inFrame, orphan],
      [{ sopInstanceUID: 'sop-0', sliceLocation: 0 }],
      volume,
      1
    );

    expect(nextContours).toContain(orphan);
  });

  it('works on a volume whose columns run along -x', () => {
    const flipped: Volume = { ...volume, origin: [31, 31, 0], directionCosines: [-1, 0, 0, 0, -1, 0, 0, 0, 1] };
    const contour = {
      referencedSOPInstanceUID: 'sop-0',
      slicePosition: 0,
      points: new Float32Array([10, 10, 0, 20, 10, 0, 20, 20, 0, 10, 20, 0]),
      isClosed: true,
    };

    const nextContours = computeMarginContoursForStructure(
      [contour],
      [{ sopInstanceUID: 'sop-0', sliceLocation: 0 }],
      flipped,
      2
    );

    expect(nextContours).toHaveLength(1);
    const xs = Array.from(nextContours[0].points).filter((_, index) => index % 3 === 0);
    expect(Math.min(...xs)).toBeLessThan(10);
    expect(Math.max(...xs)).toBeGreaterThan(20);
  });
});
