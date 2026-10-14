import { describe, expect, it } from 'vitest';
import type { ContourSlice, Volume } from '@contourlab/shared-types';
import {
  findInterpolationBounds,
  interpolateContourForSlice,
  interpolateMissingContoursForFrames,
} from '../InterpolationEngine';
import { rasterizeContoursToMask } from '../sliceMask';

const volume: Volume = {
  seriesUID: 'series-1',
  dimensions: [48, 48, 4],
  spacing: [1, 1, 10],
  origin: [0, 0, 0],
  directionCosines: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  pixelData: new Float32Array(48 * 48 * 4),
  windowCenter: 40,
  windowWidth: 400,
};

function polygon(z: number, coordinates: Array<[number, number]>): ContourSlice {
  return {
    referencedSOPInstanceUID: `sop-${z}`,
    slicePosition: z,
    points: new Float32Array(coordinates.flatMap(([x, y]) => [x, y, z])),
    isClosed: true,
  };
}

function box(z: number, x0: number, y0: number, x1: number, y1: number): ContourSlice {
  return polygon(z, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]);
}

const squareContour = (z: number, size: number) => box(z, 10, 10, 10 + size, 10 + size);

function area(contours: ContourSlice[]): number {
  // Pixels filled when the contours are rasterised the same way the engine does (even-odd).
  return rasterizeContoursToMask(contours, volume).reduce((sum, value) => sum + value, 0);
}

function pixelsOf(contours: ContourSlice[]): Uint8Array {
  return rasterizeContoursToMask(contours, volume);
}

describe('InterpolationEngine @links:SRS-014', () => {
  it('finds the drawn slices on either side of a target slice @testing:T1', () => {
    const bounds = findInterpolationBounds([squareContour(0, 10), squareContour(20, 20)], 10, volume);

    expect(bounds?.lower.position).toBe(0);
    expect(bounds?.upper.position).toBe(20);
    expect(findInterpolationBounds([squareContour(0, 10), squareContour(20, 20)], 30, volume)).toBeNull();
  });

  it('keeps every contour of a drawn slice, not only one @testing:T1', () => {
    const bounds = findInterpolationBounds(
      [box(0, 2, 2, 10, 10), box(0, 20, 20, 30, 30), box(20, 2, 2, 12, 12)],
      10,
      volume
    );

    expect(bounds?.lower.contours).toHaveLength(2);
    expect(bounds?.upper.contours).toHaveLength(1);
  });

  it('creates closed contours at the target slice @testing:T2', () => {
    const contours = interpolateContourForSlice([squareContour(0, 10), squareContour(20, 20)], 10, 'sop-10', volume);

    expect(contours.length).toBeGreaterThan(0);
    for (const contour of contours) {
      expect(contour.referencedSOPInstanceUID).toBe('sop-10');
      expect(contour.slicePosition).toBe(10);
      expect(contour.isClosed).toBe(true);
      expect(Array.from(contour.points).filter((_, index) => index % 3 === 2).every((z) => z === 10)).toBe(true);
    }
  });

  it('gives a shape between the two drawn shapes, midway when the target is midway @testing:T2', () => {
    // A 10 x 10 box on one slice and a 20 x 20 box 40 mm away: halfway is about 15 x 15 = 225.
    const drawn = [squareContour(0, 10), squareContour(40, 20)];
    const middle = interpolateContourForSlice(drawn, 20, 'sop', volume);
    expect(area(middle)).toBeGreaterThan(190);
    expect(area(middle)).toBeLessThan(260);

    // A quarter of the way it is nearer the first, and a quarter from the other end nearer the second.
    const near = interpolateContourForSlice(drawn, 10, 'sop', volume);
    const far = interpolateContourForSlice(drawn, 30, 'sop', volume);
    expect(area(near)).toBeGreaterThan(area([drawn[0]]));
    expect(area(near)).toBeLessThan(area(middle));
    expect(area(far)).toBeGreaterThan(area(middle));
    expect(area(far)).toBeLessThan(area([drawn[1]]));
  });

  it('treats a target within half a slice thickness of a drawn slice as that slice, and interpolates nothing there @testing:T2', () => {
    expect(interpolateContourForSlice([squareContour(0, 10), squareContour(40, 20)], 4, 'sop', volume)).toEqual([]);
  });

  it('returns a slice identical to its neighbours when both are the same @testing:T2', () => {
    const same = [box(0, 5, 5, 25, 25), box(20, 5, 5, 25, 25)];
    const middle = interpolateContourForSlice(same, 10, 'sop', volume);

    expect(Array.from(pixelsOf(middle))).toEqual(Array.from(pixelsOf([same[0]])));
  });

  it('does not depend on which point a contour starts at, or which way it winds @testing:T2', () => {
    const lower = box(0, 5, 5, 25, 25);
    const upper = box(20, 8, 8, 30, 30);
    const reference = interpolateContourForSlice([lower, upper], 10, 'sop', volume);

    // The same upper outline, started at another corner and drawn the other way round.
    const turned = polygon(20, [[30, 30], [30, 8], [8, 8], [8, 30]]);
    const result = interpolateContourForSlice([lower, turned], 10, 'sop', volume);

    expect(Array.from(pixelsOf(result))).toEqual(Array.from(pixelsOf(reference)));
    // And it is one simple outline, not a figure of eight.
    expect(result).toHaveLength(1);
    expect(result[0].points.length / 3).toBeLessThan(40);
  });

  it('interpolates two separate pieces, keeping both @testing:T11', () => {
    const lower = [box(0, 2, 2, 12, 12), box(0, 30, 30, 40, 40)];
    const upper = [box(20, 2, 2, 12, 12), box(20, 30, 30, 40, 40)];

    const middle = interpolateContourForSlice([...lower, ...upper], 10, 'sop', volume);

    expect(middle).toHaveLength(2);
    expect(area(middle)).toBe(area(lower));
  });

  it('keeps a hole, and lets it close up as the slices change @testing:T11', () => {
    const ring = (z: number, hole: number) => [
      box(z, 5, 5, 35, 35),
      box(z, 20 - hole, 20 - hole, 20 + hole, 20 + hole),
    ];
    const middle = interpolateContourForSlice([...ring(0, 5), ...ring(20, 5)], 10, 'sop', volume);
    // An outer outline and its hole: two contours, and the filled area is the ring.
    expect(middle).toHaveLength(2);
    expect(area(middle)).toBe(area(ring(0, 5)));

    // A hole that is larger above is in between at the middle.
    const growing = interpolateContourForSlice([...ring(0, 3), ...ring(20, 9)], 10, 'sop', volume);
    expect(area(growing)).toBeLessThan(area(ring(0, 3)));
    expect(area(growing)).toBeGreaterThan(area(ring(20, 9)));
  });

  it('handles a piece that splits in two between the slices @testing:T11', () => {
    const joined = box(0, 5, 15, 40, 25);
    const split = [box(20, 5, 15, 15, 25), box(20, 30, 15, 40, 25)];

    const middle = interpolateContourForSlice([joined, ...split], 10, 'sop', volume);

    expect(middle.length).toBeGreaterThanOrEqual(1);
    expect(area(middle)).toBeGreaterThan(area(split));
    expect(area(middle)).toBeLessThan(area([joined]));
  });

  it('works on a volume whose columns run along -x @testing:T11', () => {
    const flipped: Volume = { ...volume, origin: [47, 47, 0], directionCosines: [-1, 0, 0, 0, -1, 0, 0, 0, 1] };
    const [lower, upper] = [box(0, 10, 10, 20, 20), box(20, 10, 10, 20, 20)];

    const middle = interpolateContourForSlice([lower, upper], 10, 'sop', flipped);

    expect(middle.length).toBeGreaterThan(0);
    const mask = rasterizeContoursToMask(middle, flipped);
    expect(Array.from(mask)).toEqual(Array.from(rasterizeContoursToMask([lower], flipped)));
  });

  it('creates contours for missing image frames between drawn slices @testing:T3', () => {
    const contours = [squareContour(0, 10), squareContour(30, 20)];
    const interpolated = interpolateMissingContoursForFrames(contours, [
      { sopInstanceUID: 'sop-0', sliceLocation: 0 },
      { sopInstanceUID: 'sop-10', sliceLocation: 10 },
      { sopInstanceUID: 'sop-20', sliceLocation: 20 },
      { sopInstanceUID: 'sop-30', sliceLocation: 30 },
    ], volume);

    expect([...new Set(interpolated.map((contour) => contour.slicePosition))]).toEqual([10, 20]);
    expect([...new Set(interpolated.map((contour) => contour.referencedSOPInstanceUID))]).toEqual(['sop-10', 'sop-20']);
  });

  it('leaves frames that already have contours alone, and interpolates between every pair of drawn slices @testing:T3', () => {
    const contours = [squareContour(0, 10), squareContour(20, 14), squareContour(40, 20)];
    const frames = [0, 10, 20, 30, 40].map((z) => ({ sopInstanceUID: `sop-${z}`, sliceLocation: z }));

    const interpolated = interpolateMissingContoursForFrames(contours, frames, volume);

    expect([...new Set(interpolated.map((contour) => contour.slicePosition))]).toEqual([10, 30]);
  });

  it('interpolates between the slices of a structure with several pieces on each @testing:T3', () => {
    const contours = [
      box(0, 2, 2, 12, 12), box(0, 30, 30, 40, 40),
      box(20, 2, 2, 12, 12), box(20, 30, 30, 40, 40),
    ];
    const interpolated = interpolateMissingContoursForFrames(
      contours,
      [0, 10, 20].map((z) => ({ sopInstanceUID: `sop-${z}`, sliceLocation: z })),
      volume
    );

    expect(interpolated).toHaveLength(2);
    expect(interpolated.every((contour) => contour.slicePosition === 10)).toBe(true);
  });

  it('skips interpolation when the contour gap exceeds the configured maximum @testing:T4', () => {
    const contours = [squareContour(0, 10), squareContour(40, 20)];
    const interpolated = interpolateMissingContoursForFrames(contours, [
      { sopInstanceUID: 'sop-0', sliceLocation: 0 },
      { sopInstanceUID: 'sop-10', sliceLocation: 10 },
      { sopInstanceUID: 'sop-20', sliceLocation: 20 },
      { sopInstanceUID: 'sop-30', sliceLocation: 30 },
      { sopInstanceUID: 'sop-40', sliceLocation: 40 },
    ], volume, 2);

    expect(interpolated).toHaveLength(0);
  });
});
