/** Front surface of a curved panel as [x, z] points, left to right: a circle of the given radius with its center in front of the screen, centered on the footprint. */
export function curvedProfile(width: number, radiusMm: number, segments: number): Array<[number, number]> {
  const half = Math.min(width / 2 / radiusMm, Math.PI / 2);
  const sag = radiusMm * (1 - Math.cos(half));
  const out: Array<[number, number]> = [];
  for (let i = 0; i <= segments; i++) {
    const a = -half + (2 * half * i) / segments;
    out.push([radiusMm * Math.sin(a), radiusMm * (1 - Math.cos(a)) - sag / 2]);
  }
  return out;
}

/** A monitor object that carries a usable curve. */
export function curveRadius(obj: { kind: string; curve?: { radiusMm: number } | null }): number | null {
  const r = obj.curve?.radiusMm;
  return obj.kind === 'monitor' && typeof r === 'number' && Number.isFinite(r) && r > 0 ? r : null;
}
