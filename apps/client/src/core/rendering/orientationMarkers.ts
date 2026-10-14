// Letters for the four edges of a viewport, derived from where its camera looks in patient (LPS)
// coordinates, so they are right for any patient position or viewport plane: nothing here assumes
// a head-first supine scan. LPS: x grows to the patient's Left, y to Posterior, z to Superior.

export type Vec3 = [number, number, number];

export interface ViewportCamera {
  /** Direction that is up on the screen, in patient coordinates. */
  viewUp: Vec3;
  /** Direction from the scene toward the viewer, in patient coordinates. */
  viewPlaneNormal: Vec3;
}

export interface OrientationLabels {
  left: string;
  right: string;
  top: string;
  bottom: string;
}

// [letter for the negative direction, letter for the positive direction] of each LPS axis.
const AXIS_LETTERS: Array<[string, string]> = [
  ['R', 'L'],
  ['A', 'P'],
  ['I', 'S'],
];

// A direction between two axes gets both letters, the nearer one first (for example "LA");
// a component below this fraction of the vector is ignored.
const SECONDARY_COMPONENT = 0.25;

export function directionLetters(direction: Vec3): string {
  const length = Math.hypot(...direction);
  if (length === 0) return '';

  return direction
    .map((component, axis) => ({ axis, value: component / length }))
    .filter(({ value }) => Math.abs(value) >= SECONDARY_COMPONENT)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .map(({ axis, value }) => AXIS_LETTERS[axis][value > 0 ? 1 : 0])
    .join('');
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function negate(v: Vec3): Vec3 {
  return [-v[0], -v[1], -v[2]];
}

export function orientationLabels(camera: ViewportCamera): OrientationLabels {
  // With the normal pointing at the viewer and up on the screen, right on the screen is up x normal.
  const right = cross(camera.viewUp, camera.viewPlaneNormal);
  return {
    right: directionLetters(right),
    left: directionLetters(negate(right)),
    top: directionLetters(camera.viewUp),
    bottom: directionLetters(negate(camera.viewUp)),
  };
}

export function isVec3(value: unknown): value is Vec3 {
  return Array.isArray(value) && value.length === 3 && value.every((n) => typeof n === 'number' && Number.isFinite(n));
}
