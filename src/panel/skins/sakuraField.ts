// Sakura blossom field: one SVG image, laid over the whole panel and cropped per tile, so each card shows its slice of the same scattered field.

const FIELD_W = 160;
const FIELD_H = 90;

export interface Spot {
  x: number;
  y: number;
  r: number;
  rot: number;
  loose: boolean;
}

function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Best-candidate sampling, largest first: each spot is the best of a few random candidates, scored by clearance from the spots already placed, so the field stays even without lining up. A candidate must clear a fraction of both radii, so blossoms touch and overlap a little but never stack.
function scatter(): Spot[] {
  const rnd = seededRandom(20241113);
  const classes = [
    { count: 22, min: 4.2, max: 5.8, loose: false, gap: 0.95 },
    { count: 30, min: 2.6, max: 3.6, loose: false, gap: 0.9 },
    { count: 36, min: 1.5, max: 2.3, loose: false, gap: 0.85 },
    { count: 26, min: 1.1, max: 1.8, loose: true, gap: 0.5 },
  ];
  const spots: Spot[] = [];
  for (const c of classes) {
    for (let n = 0; n < c.count; n++) {
      let best: Spot | null = null;
      let bestScore = -Infinity;
      for (let k = 0; k < 24; k++) {
        const r = c.min + rnd() * (c.max - c.min);
        const x = -r * 0.5 + rnd() * (FIELD_W + r);
        const y = -r * 0.5 + rnd() * (FIELD_H + r);
        let score = Infinity;
        for (const s of spots) score = Math.min(score, Math.hypot(s.x - x, s.y - y) - (s.r + r) * c.gap);
        if (score > bestScore) {
          bestScore = score;
          best = { x, y, r, rot: rnd() * 360, loose: c.loose };
        }
      }
      if (best && bestScore >= 0) spots.push(best);
    }
  }
  return spots;
}

let cached: Spot[] | null = null;
export function blossomSpots(): Spot[] {
  if (!cached) cached = scatter();
  return cached;
}

const PETAL = 'M0,-0.06C-0.34,-0.2-0.58,-0.62-0.3,-0.92Q-0.14,-1.04 0,-0.88Q0.14,-1.04 0.3,-0.92C0.58,-0.62 0.34,-0.2 0,-0.06Z';

// Petals are opaque and overlap in rotation order; the thin edge stroke in the core color is what makes each overlap read.
export function sakuraFieldSvg(petal: string, core: string): string {
  const petals = [0, 1, 2, 3, 4].map(i => `<use xlink:href="#p" transform="rotate(${i * 72})"/>`).join('');
  const defs =
    `<defs><path id="p" d="${PETAL}" fill="${petal}" stroke="${core}" stroke-opacity=".55" stroke-width=".035"/>` +
    `<g id="b">${petals}<circle r=".12" fill="${core}"/></g></defs>`;
  const uses = blossomSpots()
    .map(s => {
      const t = `translate(${s.x.toFixed(2)} ${s.y.toFixed(2)}) rotate(${s.rot.toFixed(0)}) scale(${s.r.toFixed(2)})`;
      return `<use xlink:href="#${s.loose ? 'p' : 'b'}" transform="${t}"/>`;
    })
    .join('');
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 0 ${FIELD_W} ${FIELD_H}" preserveAspectRatio="xMidYMid slice">` +
    defs +
    uses +
    '</svg>'
  );
}

export function sakuraFieldUrl(petal: string, core: string): string {
  return `url("data:image/svg+xml,${encodeURIComponent(sakuraFieldSvg(petal, core))}")`;
}
