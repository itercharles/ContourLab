import { describe, expect, it } from 'vitest';
import { slicePositionZ } from './slicePosition';

describe('slicePositionZ @links:SRS-014 @testing:T10', () => {
  it('uses the image position, not the SliceLocation tag, when both exist', () => {
    // A feet-first scan whose SliceLocation tag has the opposite sign to the image position.
    expect(slicePositionZ({ imagePositionZ: -120, sliceLocation: 120 })).toBe(-120);
  });

  it('keeps an image position of exactly 0', () => {
    expect(slicePositionZ({ imagePositionZ: 0, sliceLocation: 5 })).toBe(0);
  });

  it('falls back to SliceLocation when the instance has no image position', () => {
    expect(slicePositionZ({ sliceLocation: 7.5 })).toBe(7.5);
  });

  it('is undefined when neither is a number', () => {
    expect(slicePositionZ({})).toBeUndefined();
    expect(slicePositionZ({ imagePositionZ: Number.NaN, sliceLocation: Number.NaN })).toBeUndefined();
  });
});
