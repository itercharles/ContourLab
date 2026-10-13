import type { ContourSlice, Volume } from '@contourlab/shared-types';
import type { InterpolationFrame } from './InterpolationEngine';
import {
  contoursWithoutFrame,
  maskToContourSlices,
  rasterizeContoursToMask,
  sliceContoursAtPosition,
  sliceTolerance,
} from './sliceMask';

export type BooleanOperation = 'union' | 'intersect' | 'subtract';

function combineMasks(
  sourceMask: Uint8Array,
  targetMask: Uint8Array,
  operation: BooleanOperation
): Uint8Array {
  const next = new Uint8Array(sourceMask.length);
  for (let index = 0; index < sourceMask.length; index += 1) {
    const source = sourceMask[index] === 1;
    const target = targetMask[index] === 1;
    next[index] = operation === 'union'
      ? Number(source || target)
      : operation === 'intersect'
        ? Number(source && target)
        : Number(source && !target);
  }
  return next;
}

// The structure's new contours: the result on every slice that has an image frame (every outline
// and hole of it, possibly several per slice), plus the source's own contours on slices that match
// no frame, which are kept as they are rather than deleted.
export function computeBooleanContoursForStructure(
  sourceContours: ContourSlice[],
  targetContours: ContourSlice[],
  frames: InterpolationFrame[],
  volume: Volume,
  operation: BooleanOperation
): ContourSlice[] {
  const tolerance = sliceTolerance(volume);

  const computed = frames.flatMap((frame) => {
    const sourceOnSlice = sliceContoursAtPosition(sourceContours, frame.sliceLocation, tolerance);
    const targetOnSlice = sliceContoursAtPosition(targetContours, frame.sliceLocation, tolerance);
    if (sourceOnSlice.length === 0 && targetOnSlice.length === 0) return [];

    const combined = combineMasks(
      rasterizeContoursToMask(sourceOnSlice, volume),
      rasterizeContoursToMask(targetOnSlice, volume),
      operation
    );
    return maskToContourSlices(combined, volume, frame.sliceLocation, frame.sopInstanceUID);
  });

  const unmatched = contoursWithoutFrame(
    sourceContours,
    frames.map((frame) => frame.sliceLocation),
    tolerance
  );

  return [...computed, ...unmatched].sort((a, b) => a.slicePosition - b.slicePosition);
}
