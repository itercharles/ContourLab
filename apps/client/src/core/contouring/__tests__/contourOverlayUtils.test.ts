import { describe, expect, it } from 'vitest';
import {
  buildCrossPlaneBoundaryPath,
  findContourOnSlice,
  findContourOnFrame,
  flattenWorldPoints,
  getViewportTransformSignature,
  intersectContourWithPlane,
  isContourOnFrame,
  isContourOnSlice,
  projectContourToCanvasPath,
  projectPolylineToCanvasPath,
} from '../contourOverlayUtils';
import type { ContourSlice } from '@contourlab/shared-types';

describe('flattenWorldPoints', () => {
  it('converts tuple points into a flat Float32Array', () => {
    expect(flattenWorldPoints([
      [1, 2, 3],
      [4, 5, 6],
    ])).toEqual(new Float32Array([1, 2, 3, 4, 5, 6]));
  });
});

describe('getViewportTransformSignature @links:SRS-012', () => {
  it('changes when pan, zoom, or canvas placement changes @testing:T1 @testing:T2', () => {
    const baseViewport = {
      getCamera: () => ({
        focalPoint: [0, 0, 10] as [number, number, number],
        position: [0, 0, 100] as [number, number, number],
        parallelScale: 120,
      }),
      getZoom: () => 1,
      worldToCanvas: ([x, y]: [number, number, number]) => [x + 100, y + 100] as [number, number],
    };
    const baseRect = { left: 0, top: 0, width: 512, height: 512 };

    const base = getViewportTransformSignature(baseViewport, baseRect);
    const panned = getViewportTransformSignature({
      ...baseViewport,
      getCamera: () => ({
        focalPoint: [5, 0, 10] as [number, number, number],
        position: [5, 0, 100] as [number, number, number],
        parallelScale: 120,
      }),
    }, baseRect);
    const zoomed = getViewportTransformSignature({
      ...baseViewport,
      getZoom: () => 1.5,
      worldToCanvas: ([x, y]: [number, number, number]) => [x * 1.5 + 100, y * 1.5 + 100] as [number, number],
    }, baseRect);
    const projectedDifferently = getViewportTransformSignature({
      ...baseViewport,
      worldToCanvas: ([x, y]: [number, number, number]) => [x + 140, y + 80] as [number, number],
    }, baseRect);
    const movedCanvas = getViewportTransformSignature(baseViewport, {
      ...baseRect,
      left: 12,
      top: 8,
    });

    expect(panned).not.toBe(base);
    expect(zoomed).not.toBe(base);
    expect(projectedDifferently).not.toBe(base);
    expect(movedCanvas).not.toBe(base);
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

describe('intersectContourWithPlane', () => {
  it('returns intersection points for a sagittal x-plane through an axial contour', () => {
    const points = new Float32Array([
      0, 0, 5,
      10, 0, 5,
      10, 10, 5,
      0, 10, 5,
    ]);

    const intersections = intersectContourWithPlane(points, 0, 5);

    expect(intersections).toHaveLength(2);
    expect(intersections[0]).toEqual([5, 0, 5]);
    expect(intersections[1]).toEqual([5, 10, 5]);
  });

  it('returns intersection points for a coronal y-plane through an axial contour @links:SYS-002 @testing:T2', () => {
    const points = new Float32Array([
      0, 0, 5,
      10, 0, 5,
      10, 10, 5,
      0, 10, 5,
    ]);

    const intersections = intersectContourWithPlane(points, 1, 5);

    expect(intersections).toHaveLength(2);
    expect(intersections[0]).toEqual([10, 5, 5]);
    expect(intersections[1]).toEqual([0, 5, 5]);
  });
});

describe('projectPolylineToCanvasPath', () => {
  it('projects world polyline points into an SVG path string', () => {
    const path = projectPolylineToCanvasPath(
      [
        [1, 2, 3],
        [4, 5, 6],
      ],
      ([x, y]) => [x * 2, y * 3]
    );

    expect(path).toBe('M 2 6 L 8 15');
  });
});

describe('buildCrossPlaneBoundaryPath', () => {
  it('connects cross-plane segment endpoints into two open boundary lines', () => {
    const lowerSlice = new Float32Array([
      0, 0, 0,
      10, 0, 0,
      10, 10, 0,
      0, 10, 0,
    ]);
    const upperSlice = new Float32Array([
      0, 0, 10,
      10, 0, 10,
      10, 10, 10,
      0, 10, 10,
    ]);

    const path = buildCrossPlaneBoundaryPath(
      [upperSlice, lowerSlice],
      0,
      5,
      ([, y, z]) => [y, z]
    );

    expect(path).toBe('M 0 0 L 0 10 M 10 0 L 10 10');
  });

  it('keeps a single slice as one display segment', () => {
    const slice = new Float32Array([
      0, 0, 5,
      10, 0, 5,
      10, 10, 5,
      0, 10, 5,
    ]);

    const path = buildCrossPlaneBoundaryPath([slice], 1, 5, ([x, , z]) => [x, z]);

    expect(path).toBe('M 0 5 L 10 5');
  });

  it('uses the longest same-slice segment as the MPR boundary representative', () => {
    const shorterContour = new Float32Array([
      0, 0, 0,
      4, 0, 0,
      4, 4, 0,
      0, 4, 0,
    ]);
    const longerContour = new Float32Array([
      6, 0, 0,
      12, 0, 0,
      12, 4, 0,
      6, 4, 0,
    ]);

    const path = buildCrossPlaneBoundaryPath(
      [shorterContour, longerContour],
      1,
      2,
      ([x, , z]) => [x, z]
    );

    expect(path).toBe('M 6 0 L 12 0');
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
