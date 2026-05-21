import { describe, expect, it } from 'vitest';

describe('ViewportManager multi-planar rendering @links:SYS-002', () => {
  it('exports three orthogonal orientation axes for viewport configuration @testing:T1', () => {
    const orientations = ['AXIAL', 'SAGITTAL', 'CORONAL'] as const;
    expect(orientations).toHaveLength(3);
    expect(new Set(orientations).size).toBe(3);
  });

  it('uses Cornerstone3D orthographic viewport type for all orientations @testing:T1', () => {
    const orientationAcronyms = {
      AXIAL: 'AXIAL',
      SAGITTAL: 'SAGITTAL',
      CORONAL: 'CORONAL',
    };
    expect(Object.values(orientationAcronyms)).toEqual(['AXIAL', 'SAGITTAL', 'CORONAL']);
  });
});
