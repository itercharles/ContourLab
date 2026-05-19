import { describe, expect, it } from 'vitest';
import type { Volume } from '@contourlab/shared-types';
import {
  calculateAngleDeg,
  calculateDistanceMm,
  calculatePolygonAreaMm2,
  sampleNearestVoxelValue,
} from './measurementUtils';

function makeVolume(): Volume {
  return {
    seriesUID: 'series-1',
    dimensions: [3, 3, 2],
    spacing: [2, 3, 4],
    origin: [10, 20, 30],
    directionCosines: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    pixelData: new Float32Array(Array.from({ length: 18 }, (_, index) => index)),
    windowCenter: 40,
    windowWidth: 400,
  };
}

describe('measurementUtils', () => {
  it('calculates 3D distance in millimeters', () => {
    expect(calculateDistanceMm([0, 0, 0], [3, 4, 12])).toBeCloseTo(13);
  });

  it('calculates angle in degrees', () => {
    expect(calculateAngleDeg([1, 0, 0], [0, 0, 0], [0, 1, 0])).toBeCloseTo(90);
  });

  it('calculates polygon area in square millimeters', () => {
    expect(calculatePolygonAreaMm2([
      [0, 0, 0],
      [10, 0, 0],
      [10, 5, 0],
      [0, 5, 0],
    ])).toBeCloseTo(50);
  });

  it('samples nearest voxel value from world coordinates', () => {
    expect(sampleNearestVoxelValue(makeVolume(), [14, 26, 34])).toBe(17);
    expect(sampleNearestVoxelValue(makeVolume(), [100, 26, 34])).toBeNull();
  });
});
