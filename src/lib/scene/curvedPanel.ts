/** A monitor object that carries a usable curve. */
export function curveRadius(obj: { kind: string; curve?: { radiusMm: number } | null }): number | null {
  const r = obj.curve?.radiusMm;
  return obj.kind === 'monitor' && typeof r === 'number' && Number.isFinite(r) && r > 0 ? r : null;
}
