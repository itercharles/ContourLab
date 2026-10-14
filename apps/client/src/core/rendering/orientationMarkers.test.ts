import { describe, expect, it } from 'vitest';
import { directionLetters, isVec3, orientationLabels, type Vec3 } from './orientationMarkers';

// LPS: +x Left, +y Posterior, +z Superior.
describe('directionLetters @links:SRS-034 @testing:T1', () => {
  it('names each patient axis in both directions', () => {
    expect(directionLetters([1, 0, 0])).toBe('L');
    expect(directionLetters([-1, 0, 0])).toBe('R');
    expect(directionLetters([0, 1, 0])).toBe('P');
    expect(directionLetters([0, -1, 0])).toBe('A');
    expect(directionLetters([0, 0, 1])).toBe('S');
    expect(directionLetters([0, 0, -1])).toBe('I');
  });

  it('gives both letters for a direction between two axes, the nearer first', () => {
    expect(directionLetters([1, -0.5, 0])).toBe('LA');
    expect(directionLetters([0.4, -1, 0])).toBe('AL');
  });

  it('ignores a component that is only a small tilt', () => {
    expect(directionLetters([1, 0.05, -0.1])).toBe('L');
  });

  it('is empty for no direction', () => {
    expect(directionLetters([0, 0, 0])).toBe('');
  });
});

describe('orientationLabels @links:SRS-034 @testing:T1', () => {
  const camera = (viewUp: Vec3, viewPlaneNormal: Vec3) => ({ viewUp, viewPlaneNormal });

  it('labels an axial view with anterior up and the patient\'s left on the screen\'s right', () => {
    expect(orientationLabels(camera([0, -1, 0], [0, 0, -1]))).toEqual({ top: 'A', bottom: 'P', left: 'R', right: 'L' });
  });

  it('labels a coronal view with superior up', () => {
    expect(orientationLabels(camera([0, 0, 1], [0, -1, 0]))).toEqual({ top: 'S', bottom: 'I', left: 'R', right: 'L' });
  });

  it('labels a sagittal view with superior up and posterior on the right', () => {
    expect(orientationLabels(camera([0, 0, 1], [1, 0, 0]))).toEqual({ top: 'S', bottom: 'I', left: 'A', right: 'P' });
  });

  it('follows the camera when the view is turned over', () => {
    // The same axial plane seen from below with the image upside down: every letter swaps.
    expect(orientationLabels(camera([0, 1, 0], [0, 0, 1]))).toEqual({ top: 'P', bottom: 'A', left: 'R', right: 'L' });
    expect(orientationLabels(camera([0, -1, 0], [0, 0, 1]))).toEqual({ top: 'A', bottom: 'P', left: 'L', right: 'R' });
  });

  it('never gives the same letter to opposite edges', () => {
    const labels = orientationLabels(camera([0, -0.2, 0.98], [0.1, -0.97, -0.2]));
    expect(labels.left).not.toBe(labels.right);
    expect(labels.top).not.toBe(labels.bottom);
  });
});

describe('isVec3 @links:SRS-034 @testing:T1', () => {
  it('accepts three finite numbers only', () => {
    expect(isVec3([0, 1, 2])).toBe(true);
    expect(isVec3([0, 1])).toBe(false);
    expect(isVec3([0, 1, Number.NaN])).toBe(false);
    expect(isVec3(['0', 1, 2])).toBe(false);
    expect(isVec3(undefined)).toBe(false);
  });
});
