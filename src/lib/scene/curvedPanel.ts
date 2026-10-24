/**
 * Front and back surface of a curved panel as [x, z] points, left to right, for a bounding box `size` of [chord, height, depth including the bow].
 * Both arcs share one center of curvature, the back one thickness behind the front, and the box's middle is the origin, so the front edges meet the box's front face.
 */
export function curvedLayers(size: [number, number, number], radiusMm: number, segments: number): { front: Array<[number, number]>; back: Array<[number, number]> } {
  const [chord, , total] = size;
  const theta = 2 * Math.asin(Math.min(1, chord / (2 * radiusMm)));
  const sag = radiusMm * (1 - Math.cos(theta / 2));
  const thickness = Math.max(1, total - sag);
  const zMid = (sag - thickness) / 2;
  const arc = (r: number): Array<[number, number]> => Array.from({ length: segments + 1 }, (_, i) => {
    const a = -theta / 2 + (theta * i) / segments;
    return [r * Math.sin(a), radiusMm - r * Math.cos(a) - zMid];
  });
  return { front: arc(radiusMm), back: arc(radiusMm + thickness) };
}

/** A monitor object that carries a usable curve. */
export function curveRadius(obj: { kind: string; curve?: { radiusMm: number } | null }): number | null {
  const r = obj.curve?.radiusMm;
  return obj.kind === 'monitor' && typeof r === 'number' && Number.isFinite(r) && r > 0 ? r : null;
}
