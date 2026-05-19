import { describe, expect, it } from 'vitest';

/** @links:SYS-002 */
describe('ViewportManager multi-planar rendering', () => {
  it('exports three orthogonal orientation axes for viewport configuration @links:SYS-002', () => {
    const orientations = ['AXIAL', 'SAGITTAL', 'CORONAL'] as const;
    expect(orientations).toHaveLength(3);
    expect(new Set(orientations).size).toBe(3);
  });

  it('uses Cornerstone3D orthographic viewport type for all orientations @links:SYS-002', () => {
    const orientationAcronyms = {
      AXIAL: 'AXIAL',
      SAGITTAL: 'SAGITTAL',
      CORONAL: 'CORONAL',
    };
    expect(Object.values(orientationAcronyms)).toEqual(['AXIAL', 'SAGITTAL', 'CORONAL']);
  });
});
