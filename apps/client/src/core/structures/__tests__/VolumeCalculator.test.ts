import { describe, it, expect } from 'vitest';
import { computeVolume } from '../VolumeCalculator';
import type { Structure } from '@contourlab/shared-types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSquare(x0: number, y0: number, side: number, z: number): Float32Array {
  return new Float32Array([
    x0,        y0,        z,
    x0 + side, y0,        z,
    x0 + side, y0 + side, z,
    x0,        y0 + side, z,
  ]);
}

function makeStructure(contourPoints: Float32Array[]): Structure {
  return {
    id: 'test',
    name: 'Test',
    type: 'OAR',
    color: [0, 200, 0],
    contours: contourPoints.map((points, i) => ({
      referencedSOPInstanceUID: `1.2.3.${i}`,
      slicePosition: i * 10,
      points,
      isClosed: true,
    })),
    isVisible: true,
    isLocked: false,
    volume_cc: 0,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('computeVolume @links:SRS-006', () => {
  it('returns 0 for an empty structure (no contours) @testing:T1', () => {
    const structure = makeStructure([]);
    expect(computeVolume(structure, 1)).toBe(0);
  });

  it('returns 0 for a single polygon with fewer than 3 points @testing:T1', () => {
    const twoPoints = new Float32Array([0, 0, 0, 1, 0, 0]); // 2 points
    const structure = makeStructure([twoPoints]);
    expect(computeVolume(structure, 1)).toBe(0);
  });

  it('computes 0.001 cm³ for a 1×1 mm square at sliceThickness=1mm @testing:T2', () => {
    // Area = 1 mm², volume = 1 mm³ = 0.001 cm³
    const points = makeSquare(0, 0, 1, 0);
    const structure = makeStructure([points]);
    expect(computeVolume(structure, 1)).toBeCloseTo(0.001, 10);
  });

  it('computes 0.3 cm³ for a 10×10 mm square at sliceThickness=3mm @testing:T2', () => {
    // Area = 100 mm², volume = 300 mm³ = 0.3 cm³
    const points = makeSquare(0, 0, 10, 0);
    const structure = makeStructure([points]);
    expect(computeVolume(structure, 3)).toBeCloseTo(0.3, 10);
  });

  it('produces the same area for clockwise and counter-clockwise polygons (Math.abs) @testing:T3', () => {
    // CCW: (0,0) → (1,0) → (1,1) → (0,1)
    const ccw = new Float32Array([0,0,0, 1,0,0, 1,1,0, 0,1,0]);
    // CW:  (0,0) → (0,1) → (1,1) → (1,0)
    const cw  = new Float32Array([0,0,0, 0,1,0, 1,1,0, 1,0,0]);

    const structCCW = makeStructure([ccw]);
    const structCW  = makeStructure([cw]);

    expect(computeVolume(structCCW, 1)).toBeCloseTo(computeVolume(structCW, 1), 10);
  });

  it('sums volumes correctly for two slices @testing:T4', () => {
    // Two 10×10 squares, each at different z, sliceThickness=5mm
    // Each area = 100 mm², each volume contribution = 500 mm³ = 0.5 cm³ → total = 1.0 cm³
    const slice1 = makeSquare(0, 0, 10, 0);
    const slice2 = makeSquare(0, 0, 10, 5);

    const structure: Structure = {
      id: 'test',
      name: 'Test',
      type: 'OAR',
      color: [0, 200, 0],
      contours: [
        { referencedSOPInstanceUID: '1.2.3.1', slicePosition: 0,  points: slice1, isClosed: true },
        { referencedSOPInstanceUID: '1.2.3.2', slicePosition: 5,  points: slice2, isClosed: true },
      ],
      isVisible: true,
      isLocked: false,
      volume_cc: 0,
    };

    expect(computeVolume(structure, 5)).toBeCloseTo(1.0, 10);
  });

  it('approximates the volume of a cylinder using a 360-point circle (±1%) @testing:T5', () => {
    // Circle with r=50mm, n=360 points
    const r = 50;
    const n = 360;
    const pts: number[] = [];
    for (let i = 0; i < n; i++) {
      const angle = (2 * Math.PI * i) / n;
      pts.push(r * Math.cos(angle), r * Math.sin(angle), 0);
    }
    const points = new Float32Array(pts);
    const structure = makeStructure([points]);

    const sliceThickness = 2; // mm
    const expected = (Math.PI * r * r * sliceThickness) / 1000; // ≈ 15.708 cm³

    const result = computeVolume(structure, sliceThickness);
    expect(result).toBeCloseTo(expected, 2); // ±1% tolerance via decimal places
    // Extra explicit tolerance check
    expect(Math.abs(result - expected) / expected).toBeLessThan(0.01);
  });
});

describe('computeVolume with holes and per-slice thickness @links:SRS-006', () => {
  function slice(position: number, ...polygons: Float32Array[]) {
    return polygons.map((points, i) => ({
      referencedSOPInstanceUID: `sop-${position}-${i}`,
      slicePosition: position,
      points,
      isClosed: true,
    }));
  }
  const structure = (contours: ReturnType<typeof slice>): Structure => ({
    id: 's', name: 'S', type: 'OAR', color: [0, 0, 0], contours, isVisible: true, isLocked: false, volume_cc: 0,
  });

  it('subtracts a contour nested inside another, so a ring is outer minus hole @testing:T6', () => {
    // 10 x 10 outer with a 4 x 4 hole, 3 mm thick: (100 - 16) * 3 mm³.
    const ring = structure(slice(0, makeSquare(0, 0, 10, 0), makeSquare(3, 3, 4, 0)));
    expect(computeVolume(ring, 3)).toBeCloseTo((84 * 3) / 1000, 10);
  });

  it('adds contours that are apart on the same slice, and alternates through two levels of nesting @testing:T6', () => {
    const islands = structure(slice(0, makeSquare(0, 0, 10, 0), makeSquare(20, 0, 10, 0)));
    expect(computeVolume(islands, 3)).toBeCloseTo((200 * 3) / 1000, 10);

    // outer 100, hole 36, island inside the hole 4: 100 - 36 + 4.
    const target = structure(slice(0, makeSquare(0, 0, 10, 0), makeSquare(2, 2, 6, 0), makeSquare(4, 4, 2, 0)));
    expect(computeVolume(target, 3)).toBeCloseTo((68 * 3) / 1000, 10);
  });

  it('counts each slice for its own slab when the slice spacing changes @testing:T7', () => {
    // Slices at 0, 2.5, 5, 10, 15 mm. Interior slices stand for half the distance to each neighbour
    // (2.5, 3.75, 5) and an end slice for its one gap (2.5, 5), 18.75 mm in all; the 3.75 mm average
    // would give 100 * 5 * 3.75 = the same total only by luck, so the slabs are checked one by one.
    const square = makeSquare(0, 0, 10, 0);
    const wholeSeries = structure([0, 2.5, 5, 10, 15].flatMap((z) => slice(z, square)));
    const positions = [0, 2.5, 5, 10, 15];

    const exact = computeVolume(wholeSeries, 3.75, positions);

    expect(exact).toBeCloseTo((100 * (2.5 + 2.5 + 3.75 + 5 + 5)) / 1000, 10);

    // Drop the slice at 5 mm: the slabs of its neighbours stay, and its own 3.75 mm goes.
    const without = structure([0, 2.5, 10, 15].flatMap((z) => slice(z, square)));
    expect(computeVolume(without, 3.75, positions)).toBeCloseTo((100 * (2.5 + 2.5 + 5 + 5)) / 1000, 10);
  });

  it('gives a single slice the same thickness as its neighbour gap, and uses the average without positions @testing:T7', () => {
    const one = structure(slice(0, makeSquare(0, 0, 10, 0)));
    expect(computeVolume(one, 3)).toBeCloseTo(0.3, 10);
    expect(computeVolume(one, 3, [0])).toBeCloseTo(0.3, 10);
    expect(computeVolume(one, 3, [0, 5])).toBeCloseTo(0.5, 10);
  });

  it('falls back to the average thickness for a contour that is not on any image slice @testing:T7', () => {
    const stray = structure(slice(100, makeSquare(0, 0, 10, 0)));
    expect(computeVolume(stray, 3, [0, 3, 6])).toBeCloseTo(0.3, 10);
  });
});

