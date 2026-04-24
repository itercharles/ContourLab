import { describe, it, expect } from 'vitest';
import { computeVolume } from '../VolumeCalculator';
import type { Structure } from '@webtps/shared-types';

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
  it('returns 0 for an empty structure (no contours)', () => {
    const structure = makeStructure([]);
    expect(computeVolume(structure, 1)).toBe(0);
  });

  it('returns 0 for a single polygon with fewer than 3 points', () => {
    const twoPoints = new Float32Array([0, 0, 0, 1, 0, 0]); // 2 points
    const structure = makeStructure([twoPoints]);
    expect(computeVolume(structure, 1)).toBe(0);
  });

  it('computes 0.001 cm³ for a 1×1 mm square at sliceThickness=1mm', () => {
    // Area = 1 mm², volume = 1 mm³ = 0.001 cm³
    const points = makeSquare(0, 0, 1, 0);
    const structure = makeStructure([points]);
    expect(computeVolume(structure, 1)).toBeCloseTo(0.001, 10);
  });

  it('computes 0.3 cm³ for a 10×10 mm square at sliceThickness=3mm', () => {
    // Area = 100 mm², volume = 300 mm³ = 0.3 cm³
    const points = makeSquare(0, 0, 10, 0);
    const structure = makeStructure([points]);
    expect(computeVolume(structure, 3)).toBeCloseTo(0.3, 10);
  });

  it('produces the same area for clockwise and counter-clockwise polygons (Math.abs)', () => {
    // CCW: (0,0) → (1,0) → (1,1) → (0,1)
    const ccw = new Float32Array([0,0,0, 1,0,0, 1,1,0, 0,1,0]);
    // CW:  (0,0) → (0,1) → (1,1) → (1,0)
    const cw  = new Float32Array([0,0,0, 0,1,0, 1,1,0, 1,0,0]);

    const structCCW = makeStructure([ccw]);
    const structCW  = makeStructure([cw]);

    expect(computeVolume(structCCW, 1)).toBeCloseTo(computeVolume(structCW, 1), 10);
  });

  it('sums volumes correctly for two slices', () => {
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

  it('approximates the volume of a cylinder using a 360-point circle (±1%)', () => {
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
