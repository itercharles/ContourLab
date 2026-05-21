import { describe, expect, it } from 'vitest';
import type { Structure, Volume } from '@contourlab/shared-types';
import {
  buildStructureMaskVolume,
  chooseStructureMaskStride,
  deriveStrideVolume,
  downsampleVolume,
  estimateStructureVoxelExtent,
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

  it('builds a binary structure mask for stacked contours @testing:T1 @testing:T2', () => {
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

  it('deriveStrideVolume rescales metadata without copying scalars', () => {
    const strided = deriveStrideVolume(volume, 4);
    expect(strided.dimensions).toEqual([2, 2, 1]);
    expect(strided.spacing).toEqual([4, 4, 8]);
    // Same pixelData reference — mask building never reads it, so we skip
    // the O(dim^3) copy that downsampleVolume does for the CT actor.
    expect(strided.pixelData).toBe(volume.pixelData);
    // Stride 1 returns the original instance unchanged.
    expect(deriveStrideVolume(volume, 1)).toBe(volume);
  });

  it('chooseStructureMaskStride keeps small structures at full resolution', () => {
    expect(chooseStructureMaskStride(structure, volume)).toBe(1);
  });

  it('chooseStructureMaskStride backs off for skin-sized structures', () => {
    // Big-volume volume with a single sweeping body-outline contour. A
    // 200 × 200 × 200 mm bounding box on a 1 mm grid is 8 M voxels — well
    // above the 1 M full-res budget — so the stride should be > 1.
    const bigVolume: Volume = {
      ...volume,
      dimensions: [256, 256, 256],
      spacing: [1, 1, 1],
      origin: [0, 0, 0],
    };
    const skin: Structure = {
      ...structure,
      contours: [
        {
          referencedSOPInstanceUID: 'sop-skin-1',
          slicePosition: 100,
          isClosed: true,
          points: new Float32Array([10, 10, 100, 210, 10, 100, 210, 210, 100, 10, 210, 100]),
        },
        {
          referencedSOPInstanceUID: 'sop-skin-2',
          slicePosition: 200,
          isClosed: true,
          points: new Float32Array([10, 10, 200, 210, 10, 200, 210, 210, 200, 10, 210, 200]),
        },
      ],
    };
    const stride = chooseStructureMaskStride(skin, bigVolume);
    expect(stride).toBeGreaterThanOrEqual(2);
    expect(stride).toBeLessThanOrEqual(4);
    expect(estimateStructureVoxelExtent(skin, bigVolume)).toBeGreaterThan(1_000_000);
  });
});
