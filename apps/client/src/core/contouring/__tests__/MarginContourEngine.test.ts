import { describe, expect, it } from 'vitest';
import type { Volume } from '@webtps/shared-types';
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

describe('computeMarginContoursForStructure @links:SRS-026', () => {
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
});
