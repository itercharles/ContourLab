import { describe, expect, it } from 'vitest';
import type { Volume } from '@contourlab/shared-types';
import { maskToContourSlices, rasterizeContoursToMask } from '../sliceMask';

const volume: Volume = {
  seriesUID: 'series-1',
  dimensions: [8, 8, 1],
  spacing: [1, 1, 1],
  origin: [0, 0, 0],
  directionCosines: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  pixelData: new Float32Array(64),
  windowCenter: 40,
  windowWidth: 400,
};

function maskOf(cells: Array<[number, number]>): Uint8Array {
  const mask = new Uint8Array(64);
  for (const [i, j] of cells) mask[j * 8 + i] = 1;
  return mask;
}

describe('sliceMask @links:SRS-014 @testing:T7', () => {
  it('traces a filled block as one outline', () => {
    const contours = maskToContourSlices(maskOf([[2, 2], [3, 2], [2, 3], [3, 3]]), volume, 0, 'sop');
    expect(contours).toHaveLength(1);
    expect(contours[0].points.length / 3).toBe(4);
  });

  it('keeps two pixels that touch only at a corner as two separate outlines', () => {
    const contours = maskToContourSlices(maskOf([[2, 2], [3, 3]]), volume, 0, 'sop');
    expect(contours).toHaveLength(2);
    expect(contours.every((contour) => contour.points.length / 3 === 4)).toBe(true);
  });

  it('traces a ring as an outer outline plus a hole', () => {
    const ring: Array<[number, number]> = [];
    for (let j = 1; j <= 5; j += 1) {
      for (let i = 1; i <= 5; i += 1) {
        if (i === 3 && j === 3) continue;
        ring.push([i, j]);
      }
    }
    const contours = maskToContourSlices(maskOf(ring), volume, 0, 'sop');
    expect(contours).toHaveLength(2);
  });

  it('fills a contour nested inside another as a hole (even-odd)', () => {
    const square = (min: number, max: number) => ({
      referencedSOPInstanceUID: 'sop',
      slicePosition: 0,
      points: new Float32Array([min, min, 0, max, min, 0, max, max, 0, min, max, 0]),
      isClosed: true,
    });
    const mask = rasterizeContoursToMask([square(1, 7), square(3, 5)], volume);

    expect(mask[4 * 8 + 4]).toBe(0); // inside the hole
    expect(mask[2 * 8 + 2]).toBe(1); // in the ring
  });

  it('rasterises on a flipped volume where column i runs along -x', () => {
    const flipped: Volume = { ...volume, origin: [7, 7, 0], directionCosines: [-1, 0, 0, 0, -1, 0, 0, 0, 1] };
    const contour = {
      referencedSOPInstanceUID: 'sop',
      slicePosition: 0,
      points: new Float32Array([5, 5, 0, 7, 5, 0, 7, 7, 0, 5, 7, 0]),
      isClosed: true,
    };
    const mask = rasterizeContoursToMask([contour], flipped);

    expect(mask.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(0);
  });
});
