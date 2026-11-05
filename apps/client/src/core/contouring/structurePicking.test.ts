import { describe, expect, it } from 'vitest';
import { pickStructureAtPoint, type PickCandidate } from './structurePicking';

const square = (x: number, y: number, size: number): [number, number][] => [
  [x, y],
  [x + size, y],
  [x + size, y + size],
  [x, y + size],
];

const candidates: PickCandidate[] = [
  { structureId: 'outer', rings: [square(0, 0, 100)] },
  { structureId: 'inner', rings: [square(40, 40, 20)] },
];

describe('pickStructureAtPoint', () => {
  it('@links:SRS-038 @testing:T1 picks an outline within 8 px and nothing beyond it', () => {
    expect(pickStructureAtPoint(candidates, [104, 50])).toBe('outer');
    expect(pickStructureAtPoint(candidates, [120, 50])).toBeNull();
  });

  it('@links:SRS-038 @testing:T2 prefers the nearest outline, else the smallest enclosing contour', () => {
    expect(pickStructureAtPoint(candidates, [38, 50])).toBe('inner');
    expect(pickStructureAtPoint(candidates, [50, 20])).toBe('outer');
    expect(pickStructureAtPoint(candidates, [50, 50])).toBe('inner');
    expect(pickStructureAtPoint([{ structureId: 'a', rings: [square(0, 0, 200)] }, { structureId: 'b', rings: [square(20, 20, 150)] }], [100, 100])).toBe('b');
  });

  it('ignores degenerate rings', () => {
    expect(pickStructureAtPoint([{ structureId: 'x', rings: [[[0, 0], [1, 1]]] }], [0, 0])).toBeNull();
  });
});
