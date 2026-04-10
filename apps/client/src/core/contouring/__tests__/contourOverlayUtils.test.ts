import { describe, expect, it } from 'vitest';
import {
  flattenWorldPoints,
  isContourOnSlice,
  projectContourToCanvasPath,
} from '../contourOverlayUtils';

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
