import { describe, expect, it } from 'vitest';
import type { ContourSlice, Volume } from '@contourlab/shared-types';
import { computeBooleanContoursForStructure } from '../BooleanContourEngine';

function makeVolume(): Volume {
  return {
    seriesUID: 'series-1',
    dimensions: [32, 32, 3],
    spacing: [1, 1, 10],
    origin: [0, 0, 0],
    directionCosines: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    pixelData: new Float32Array(32 * 32 * 3),
    windowCenter: 40,
    windowWidth: 400,
  };
}

function squareContour(z: number, min: number, max: number, sop = `sop-${z}`): ContourSlice {
  return {
    referencedSOPInstanceUID: sop,
    slicePosition: z,
    points: new Float32Array([
      min, min, z,
      max, min, z,
      max, max, z,
      min, max, z,
    ]),
    isClosed: true,
  };
}

function area(contour: ContourSlice): number {
  let total = 0;
  const count = contour.points.length / 3;
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    total += contour.points[index * 3] * contour.points[next * 3 + 1] - contour.points[next * 3] * contour.points[index * 3 + 1];
  }
  return Math.abs(total / 2);
}

describe('BooleanContourEngine @links:SRS-014 @testing:T7', () => {
  it('builds union contours for overlapping slices', () => {
    const contours = computeBooleanContoursForStructure(
      [squareContour(0, 4, 12)],
      [squareContour(0, 10, 18)],
      [{ sopInstanceUID: 'sop-0', sliceLocation: 0 }],
      makeVolume(),
      'union'
    );

    expect(contours).toHaveLength(1);
    expect(contours[0].slicePosition).toBe(0);
    expect(contours[0].points.length).toBeGreaterThan(0);
  });

  it('removes non-overlapping slices for intersect', () => {
    const contours = computeBooleanContoursForStructure(
      [squareContour(0, 4, 12)],
      [squareContour(10, 10, 18)],
      [
        { sopInstanceUID: 'sop-0', sliceLocation: 0 },
        { sopInstanceUID: 'sop-10', sliceLocation: 10 },
      ],
      makeVolume(),
      'intersect'
    );

    expect(contours).toHaveLength(0);
  });

  it('keeps source-only area for subtract, leaving a hole where the target sits inside the source', () => {
    const contours = computeBooleanContoursForStructure(
      [squareContour(0, 4, 14)],
      [squareContour(0, 8, 12)],
      [{ sopInstanceUID: 'sop-0', sliceLocation: 0 }],
      makeVolume(),
      'subtract'
    );

    // An outer outline and the hole cut by the target: two contours on the same slice.
    expect(contours).toHaveLength(2);
    expect(contours.every((contour) => contour.slicePosition === 0)).toBe(true);
    const areas = contours.map(area).sort((a, b) => b - a);
    expect(areas[0]).toBeCloseTo(100);
    expect(areas[1]).toBeCloseTo(16);
    expect(areas[0] - areas[1]).toBeCloseTo(84);
  });

  it('keeps every separate piece of a union, not only the largest', () => {
    const contours = computeBooleanContoursForStructure(
      [squareContour(0, 2, 8)],
      [squareContour(0, 20, 30)],
      [{ sopInstanceUID: 'sop-0', sliceLocation: 0 }],
      makeVolume(),
      'union'
    );

    expect(contours).toHaveLength(2);
    expect(contours.map(area).sort((a, b) => a - b)).toEqual([36, 100]);
  });

  it('keeps the source contours on slices that match no image frame', () => {
    const orphan = squareContour(50, 4, 12, 'sop-50');
    const contours = computeBooleanContoursForStructure(
      [squareContour(0, 4, 12), orphan],
      [squareContour(0, 8, 16)],
      [{ sopInstanceUID: 'sop-0', sliceLocation: 0 }],
      makeVolume(),
      'union'
    );

    expect(contours.some((contour) => contour === orphan)).toBe(true);
    expect(contours.some((contour) => contour.slicePosition === 0)).toBe(true);
  });

  it('works on a head-first-prone volume whose columns run along -x and rows along -y', () => {
    const volume: Volume = { ...makeVolume(), origin: [31, 31, 0], directionCosines: [-1, 0, 0, 0, -1, 0, 0, 0, 1] };
    const contours = computeBooleanContoursForStructure(
      [squareContour(0, 10, 20)],
      [squareContour(0, 10, 20)],
      [{ sopInstanceUID: 'sop-0', sliceLocation: 0 }],
      volume,
      'union'
    );

    expect(contours).toHaveLength(1);
    expect(area(contours[0])).toBeCloseTo(100);
    const xs = Array.from(contours[0].points).filter((_, index) => index % 3 === 0);
    expect(Math.min(...xs)).toBeGreaterThan(9);
    expect(Math.max(...xs)).toBeLessThan(22);
  });

  it('writes negative slice positions on a feet-first volume', () => {
    const volume: Volume = { ...makeVolume(), directionCosines: [1, 0, 0, 0, 1, 0, 0, 0, -1] };
    const contours = computeBooleanContoursForStructure(
      [squareContour(-10, 4, 12)],
      [squareContour(-10, 8, 16)],
      [{ sopInstanceUID: 'sop-m10', sliceLocation: -10 }],
      volume,
      'union'
    );

    expect(contours).toHaveLength(1);
    expect(contours[0].slicePosition).toBe(-10);
    expect(Array.from(contours[0].points).filter((_, index) => index % 3 === 2).every((z) => z === -10)).toBe(true);
  });
});
