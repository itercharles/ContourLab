export type WorldPoint = [number, number, number];

export function flattenWorldPoints(points: WorldPoint[]): Float32Array {
  return new Float32Array(points.flatMap(([x, y, z]) => [x, y, z]));
}

export function isContourOnSlice(
  contourSlicePosition: number,
  currentSlicePosition: number,
  tolerance: number
): boolean {
  return Math.abs(contourSlicePosition - currentSlicePosition) <= tolerance;
}

export function projectContourToCanvasPath(
  points: Float32Array,
  worldToCanvas: (point: WorldPoint) => [number, number]
): string {
  const projected: string[] = [];

  for (let i = 0; i < points.length; i += 3) {
    const [x, y] = worldToCanvas([
      points[i],
      points[i + 1],
      points[i + 2],
    ]);
    projected.push(`${i === 0 ? 'M' : 'L'} ${x} ${y}`);
  }

  return projected.join(' ');
}
