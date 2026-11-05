export type CanvasPoint = [number, number];

export interface PickCandidate {
  structureId: string;
  rings: CanvasPoint[][];
}

export const PICK_TOLERANCE_PX = 8;

function distanceToSegment(point: CanvasPoint, a: CanvasPoint, b: CanvasPoint): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0
    ? 0
    : Math.min(1, Math.max(0, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dy) / lengthSq));
  return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dy));
}

function distanceToRing(point: CanvasPoint, ring: CanvasPoint[]): number {
  let best = Infinity;
  for (let i = 0; i < ring.length; i += 1) {
    best = Math.min(best, distanceToSegment(point, ring[i], ring[(i + 1) % ring.length]));
  }
  return best;
}

function ringContains(point: CanvasPoint, ring: CanvasPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > point[1] !== yj > point[1] && point[0] < ((xj - xi) * (point[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function ringArea(ring: CanvasPoint[]): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return Math.abs(sum) / 2;
}

/**
 * Picks the structure under a canvas point: the nearest outline within the
 * tolerance, otherwise the smallest contour that encloses the point.
 */
export function pickStructureAtPoint(
  candidates: PickCandidate[],
  point: CanvasPoint,
  tolerancePx: number = PICK_TOLERANCE_PX
): string | null {
  let nearestId: string | null = null;
  let nearestDistance = tolerancePx;
  let enclosingId: string | null = null;
  let enclosingArea = Infinity;

  for (const { structureId, rings } of candidates) {
    for (const ring of rings) {
      if (ring.length < 3) continue;
      const distance = distanceToRing(point, ring);
      if (distance <= nearestDistance) {
        nearestDistance = distance;
        nearestId = structureId;
      }
      if (ringContains(point, ring)) {
        const area = ringArea(ring);
        if (area < enclosingArea) {
          enclosingArea = area;
          enclosingId = structureId;
        }
      }
    }
  }

  return nearestId ?? enclosingId;
}
