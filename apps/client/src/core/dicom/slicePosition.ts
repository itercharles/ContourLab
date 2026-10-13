// The z position of an image slice in the same patient (LPS) coordinates contours are stored in.
// ImagePositionPatient is used because the SliceLocation tag (0020,1041) is a vendor-dependent,
// optional value whose sign is flipped on some feet-first scans; ContourOverlay relies on the same
// rule. SliceLocation is only a fallback for an instance that has no position.
export function slicePositionZ(instance: {
  imagePositionZ?: number;
  sliceLocation?: number;
}): number | undefined {
  if (Number.isFinite(instance.imagePositionZ)) return instance.imagePositionZ;
  if (Number.isFinite(instance.sliceLocation)) return instance.sliceLocation;
  return undefined;
}
