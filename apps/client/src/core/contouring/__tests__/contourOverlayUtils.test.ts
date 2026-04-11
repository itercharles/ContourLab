import { describe, expect, it } from 'vitest';
import {
  findContourOnSlice,
  findContourOnFrame,
  flattenWorldPoints,
  isContourOnFrame,
  isContourOnSlice,
  projectContourToCanvasPath,
} from '../contourOverlayUtils';
import type { ContourSlice } from '@webtps/shared-types';

describe('flattenWorldPoints', () => {
  it('converts tuple points into a flat Float32Array', () => {
    expect(flattenWorldPoints([
      [1, 2, 3],
      [4, 5, 6],
    ])).toEqual(new Float32Array([1, 2, 3, 4, 5, 6]));
  });
});

describe('isContourOnSlice', () => {
  it('returns true when the contour is within tolerance', () => {
    expect(isContourOnSlice(10, 10.4, 0.5)).toBe(true);
  });

  it('returns false when the contour is outside tolerance', () => {
    expect(isContourOnSlice(10, 11, 0.5)).toBe(false);
  });
});

describe('projectContourToCanvasPath', () => {
  it('projects flat world points into an SVG path string', () => {
    const path = projectContourToCanvasPath(
      new Float32Array([1, 2, 0, 3, 4, 0]),
      ([x, y]) => [x * 10, y * 10]
    );

    expect(path).toBe('M 10 20 L 30 40');
  });
});

describe('findContourOnSlice', () => {
  it('returns the closest contour within tolerance', () => {
    const contours: ContourSlice[] = [
      {
        referencedSOPInstanceUID: '1',
        slicePosition: 9.6,
        points: new Float32Array([0, 0, 9.6]),
        isClosed: true,
      },
      {
        referencedSOPInstanceUID: '2',
        slicePosition: 10.2,
        points: new Float32Array([0, 0, 10.2]),
        isClosed: true,
      },
    ];

    expect(findContourOnSlice(contours, 10, 0.5)?.referencedSOPInstanceUID).toBe('2');
  });

  it('returns undefined when no contour matches the slice', () => {
    const contours: ContourSlice[] = [
      {
        referencedSOPInstanceUID: '1',
        slicePosition: 12,
        points: new Float32Array([0, 0, 12]),
        isClosed: true,
      },
    ];

    expect(findContourOnSlice(contours, 10, 0.5)).toBeUndefined();
  });
});

describe('isContourOnFrame', () => {
  it('prefers referenced SOP instance UID over slice position tolerance', () => {
    const contour: ContourSlice = {
      referencedSOPInstanceUID: 'sop-previous-series',
      slicePosition: 10,
      points: new Float32Array([0, 0, 10]),
      isClosed: true,
    };

    expect(isContourOnFrame(contour, 'sop-current-series', 10, 0.5)).toBe(false);
  });

  it('falls back to slice position when frame UID is unavailable', () => {
    const contour: ContourSlice = {
      referencedSOPInstanceUID: 'sop-1',
      slicePosition: 10,
      points: new Float32Array([0, 0, 10]),
      isClosed: true,
    };

    expect(isContourOnFrame(contour, undefined, 10.2, 0.5)).toBe(true);
  });
});

describe('findContourOnFrame', () => {
  it('returns only the contour referenced to the current SOP instance', () => {
    const contours: ContourSlice[] = [
      {
        referencedSOPInstanceUID: 'old-sop',
        slicePosition: 10,
        points: new Float32Array([0, 0, 10]),
        isClosed: true,
      },
      {
        referencedSOPInstanceUID: 'current-sop',
        slicePosition: 10,
        points: new Float32Array([1, 1, 10]),
        isClosed: true,
      },
    ];

    expect(
      findContourOnFrame(contours, 'current-sop', 10, 0.5)?.referencedSOPInstanceUID
    ).toBe('current-sop');
  });
});
