import { describe, expect, it } from 'vitest';
import type { Structure, Volume } from '@webtps/shared-types';
import {
  buildStructureMaskVolume,
  downsampleVolume,
  voxelToWorld,
  worldToContinuousVoxel,
} from './threeDGeometry';

const volume: Volume = {
  seriesUID: 'series-3d',
  dimensions: [8, 8, 4],
  spacing: [1, 1, 2],
  origin: [10, 20, 30],
  directionCosines: [1, 0, 0, 0, 1, 0, 0, 0, 1],
  pixelData: new Int16Array(8 * 8 * 4).fill(100),
  windowCenter: 40,
  windowWidth: 400,
};

const structure: Structure = {
  id: 'structure-1',
  name: 'PTV_3D',
  type: 'PTV',
  color: [0, 0, 255],
  isVisible: true,
  isLocked: false,
  volume_cc: 0,
  contours: [
    {
      referencedSOPInstanceUID: 'sop-1',
      slicePosition: 30,
      isClosed: true,
      points: new Float32Array([
        11, 21, 30,
        14, 21, 30,
        14, 24, 30,
        11, 24, 30,
      ]),
    },
    {
      referencedSOPInstanceUID: 'sop-2',
      slicePosition: 32,
      isClosed: true,
      points: new Float32Array([
        11, 21, 32,
        14, 21, 32,
        14, 24, 32,
        11, 24, 32,
      ]),
    },
  ],
};

describe('threeDGeometry @links:SRS-028,SRS-029', () => {
  it('round-trips world and voxel coordinates for axis-aligned volumes', () => {
    const voxel: [number, number, number] = [2, 3, 1];
    const world = voxelToWorld(voxel, volume);
    expect(world).toEqual([12, 23, 32]);
    expect(worldToContinuousVoxel(world, volume)).toEqual(voxel);
  });

  it('builds a binary structure mask for stacked contours', () => {
    const mask = buildStructureMaskVolume(structure, volume);

    expect(mask).not.toBeNull();
    expect(mask?.dimensions).toEqual([6, 6, 3]);
    expect(mask?.filledVoxelCount).toBeGreaterThan(0);
    expect(mask?.scalars.some((value) => value === 1)).toBe(true);
  });

  it('downsamples a volume while preserving scalar type and spatial coverage', () => {
    const downsampled = downsampleVolume(volume, 2);

    expect(downsampled.dimensions).toEqual([4, 4, 2]);
    expect(downsampled.spacing).toEqual([2, 2, 4]);
    expect(downsampled.pixelData).toBeInstanceOf(Int16Array);
    expect(downsampled.pixelData.length).toBe(32);
  });
});
