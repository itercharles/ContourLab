import { describe, expect, it } from 'vitest';
import type { Structure, Volume } from '@webtps/shared-types';
import {
  buildPointScalarVolumeFromMask,
  buildStructureMaskVolume,
  downsampleMaskVolume,
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

  it('preserves holes for nested contours on the same slice', () => {
    const hollowStructure: Structure = {
      ...structure,
      contours: [
        {
          referencedSOPInstanceUID: 'sop-outer',
          slicePosition: 30,
          isClosed: true,
          points: new Float32Array([
            11, 21, 30,
            15, 21, 30,
            15, 25, 30,
            11, 25, 30,
          ]),
        },
        {
          referencedSOPInstanceUID: 'sop-inner',
          slicePosition: 30,
          isClosed: true,
          points: new Float32Array([
            12, 22, 30,
            14, 22, 30,
            14, 24, 30,
            12, 24, 30,
          ]),
        },
      ],
    };

    const mask = buildStructureMaskVolume(hollowStructure, volume);

    expect(mask).not.toBeNull();
    expect(mask?.dimensions).toEqual([7, 7, 2]);
    const centerVoxelOffset = 0 * 7 * 7 + 3 * 7 + 3;
    const shellVoxelOffset = 0 * 7 * 7 + 1 * 7 + 1;
    expect(mask?.scalars[centerVoxelOffset]).toBe(0);
    expect(mask?.scalars[shellVoxelOffset]).toBe(1);
  });

  it('downsamples a volume while preserving scalar type and spatial coverage', () => {
    const downsampled = downsampleVolume(volume, 2);

    expect(downsampled.dimensions).toEqual([4, 4, 2]);
    expect(downsampled.spacing).toEqual([2, 2, 4]);
    expect(downsampled.pixelData).toBeInstanceOf(Int16Array);
    expect(downsampled.pixelData.length).toBe(32);
  });

  it('downsamples binary masks with occupancy-preserving pooling', () => {
    const mask = buildStructureMaskVolume(structure, volume);

    expect(mask).not.toBeNull();
    const downsampled = downsampleMaskVolume(mask!, 2);

    expect(downsampled.dimensions).toEqual([3, 3, 2]);
    expect(downsampled.spacing).toEqual([2, 2, 4]);
    expect(downsampled.origin).toEqual([10.5, 20.5, 31]);
    expect(downsampled.filledVoxelCount).toBeGreaterThan(0);
    expect(downsampled.scalars.some((value) => value === 1)).toBe(true);
  });

  it('converts a mask volume into a padded point-scalar grid for marching cubes', () => {
    const mask = buildStructureMaskVolume(structure, volume);

    expect(mask).not.toBeNull();
    const pointGrid = buildPointScalarVolumeFromMask(mask!);

    expect(pointGrid.dimensions).toEqual([8, 8, 5]);
    expect(pointGrid.origin).toEqual([9, 19, 28]);
    expect(pointGrid.scalars.some((value) => value === 1)).toBe(true);
  });
});
