/** One uniform scale from two per-axis scales: the axis that moved further from 1 wins (shrinking included), keeping its sign. */
export function dominantScale(sx: number, sy: number): number {
  return Math.abs(sx - 1) >= Math.abs(sy - 1) ? sx : sy;
}

/** Largest |scale| about the anchor that keeps every point inside [lo, hi] on both axes; the sign of `scale` is kept. */
export function capScaleToBounds(
  scale: number,
  anchor: { u: number; v: number },
  points: Iterable<{ u: number; v: number }>,
  lo = 0,
  hi = 1,
): number {
  let limit = Infinity;
  for (const p of points) {
    for (const [a, q] of [[anchor.u, p.u], [anchor.v, p.v]] as const) {
      const d = (q - a) * Math.sign(scale);
      if (Math.abs(d) < 1e-9) continue;
      const room = (d > 0 ? hi : lo) - a;
      limit = Math.min(limit, Math.max(0, room / d));
    }
  }
  const mag = Math.min(Math.abs(scale), limit);
  return scale < 0 ? -mag : mag;
}

/** Frame size scaled uniformly from its start size by the axis that moved further, clamped to a minimum side and a maximum box; the minimum wins when both cannot hold. */
export function lockedFrameSize(
  origW: number,
  origH: number,
  w: number,
  h: number,
  min: number,
  maxW: number,
  maxH: number,
): { w: number; h: number } {
  const k = dominantScale(w / origW, h / origH);
  const kMin = Math.max(min / origW, min / origH);
  const kMax = Math.min(maxW / origW, maxH / origH);
  const s = Math.max(kMin, Math.min(k, kMax));
  return { w: origW * s, h: origH * s };
}
