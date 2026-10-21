export interface AreaBoxRect {
  index: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
}

/** Unpacks the flat 4-per-LED box list. Zero-area entries (disabled LEDs) are dropped; index stays the card-local LED index. */
export function areaBoxRects(flat: number[]): AreaBoxRect[] {
  const out: AreaBoxRect[] = [];
  for (let i = 0; i + 3 < flat.length; i += 4) {
    const [u0, v0, u1, v1] = [flat[i], flat[i + 1], flat[i + 2], flat[i + 3]];
    if (u1 <= u0 || v1 <= v0) continue;
    out.push({ index: i / 4, u0, v0, u1, v1 });
  }
  return out;
}
