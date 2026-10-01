import styles from './BenchmarkChip.module.scss';

const VIEW_W = 1400;
const VIEW_H = 900;
const CHIP = 280;

// Fixed-seed PRNG (mulberry32) so the irregular layout is identical on every render and build.
function seededRandom(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Each side's pins fan out with one diagonal jog, per-side spread and per-trace jitter, skips and endings.
// Lanes stay ordered and an outer trace starts its jog no later than its inner neighbour plus one pitch, so
// no two traces cross. The bottom edge gets pin stubs only, keeping traces out of the content below the readout.
function buildCircuit(cx: number, cy: number, half: number, contained: boolean): { traces: string; vias: string } {
  const rand = seededRandom(11);
  const f = half / 220;
  const pitch = 45 * f;
  const sides: Array<[number, number]> = [[0, -1], [0, 1], [-1, 0], [1, 0]];
  const offsets = [-180, -135, -90, -45, 0, 45, 90, 135, 180].map(o => o * f);
  const line = (pts: Array<[number, number]>) => 'M' + pts.map(q => q[0].toFixed(1) + ',' + q[1].toFixed(1)).join(' L') + ' ';
  let traces = '';
  let vias = '';
  for (const [sx, sy] of sides) {
    const pt = (u: number, v: number): [number, number] => (sy !== 0 ? [cx + v, cy + sy * u] : [cx + sx * u, cy + v]);
    if (sy === 1) {
      for (const o of offsets) traces += line([pt(half, o), pt(half + (8 + rand() * 14) * f, o)]);
      continue;
    }
    const spread = 1.25 + rand() * 0.6;
    const lead = (14 + rand() * 34) * f;
    const lanes = offsets.map(o => o * spread + (rand() - 0.5) * pitch * 0.5);
    const bends = offsets.map(o => half + lead + Math.abs(o) * (0.1 + rand() * 0.35) + rand() * 20 * f);
    for (let k = 3; k >= 0; k--) bends[k] = Math.min(bends[k], bends[k + 1] + pitch);
    for (let k = 5; k < offsets.length; k++) bends[k] = Math.min(bends[k], bends[k - 1] + pitch);
    offsets.forEach((o, k) => {
      if (rand() < 0.2) {
        traces += line([pt(half, o), pt(half + (8 + rand() * 12) * f, o)]);
        return;
      }
      const jogEnd = bends[k] + Math.abs(lanes[k] - o);
      let far: number;
      if (contained) {
        // Clamped so the via stays inside the art on this axis.
        const reach = (sy !== 0 ? cy : cx) - 20;
        far = Math.min(reach, jogEnd + (rand() < 0.3 ? 80 + rand() * 120 : 200 + rand() * 320) * f);
      } else {
        far = rand() < 0.45 ? jogEnd + (30 + rand() * 170) * f : 2000;
      }
      const pts = [pt(half, o), pt(bends[k], o), pt(jogEnd, lanes[k]), pt(far, lanes[k])];
      traces += line(pts);
      if (far < 2000) {
        const [ex, ey] = pts[3];
        vias += `M${(ex - 7).toFixed(1)},${ey.toFixed(1)} a7,7 0 1,0 14,0 a7,7 0 1,0 -14,0 `;
      }
    });
  }
  return { traces, vias };
}

const CIRCUIT = buildCircuit(VIEW_W / 2, VIEW_H / 2, CHIP / 2, false);
const CIRCUIT_CONTAINED = buildCircuit(VIEW_W / 2, VIEW_H / 2, CHIP / 2, true);

interface Props {
  /** Changing key replays the trace/die flash; null shows none. */
  surgeKey?: string | null;
  /** No pulses, edge scanner or breathing die. */
  still?: boolean;
  /** Every arm ends in a via within a few hundred px of the chip, so none looks cut off on a host wider than the art. */
  contained?: boolean;
  className?: string;
}

/** The benchmark's circuit-chip backdrop. */
export function BenchmarkChip({ surgeKey = null, still = false, contained = false, className }: Props) {
  const circuit = contained ? CIRCUIT_CONTAINED : CIRCUIT;
  const x = (VIEW_W - CHIP) / 2;
  const y = (VIEW_H - CHIP) / 2;
  const die = CHIP * 0.55;
  return (
    <svg className={`${styles.chip} ${still ? styles.still : ''} ${className ?? ''}`} viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} aria-hidden="true">
      <path className={styles.traces} d={circuit.traces} />
      {!still && (
        <g className={styles.pulses}>
          <path className={styles.pulseA} d={circuit.traces} />
          <path className={styles.pulseB} d={circuit.traces} />
        </g>
      )}
      <path className={styles.vias} d={circuit.vias} />
      <rect className={styles.body} x={x} y={y} width={CHIP} height={CHIP} rx={36} />
      {!still && <rect className={styles.scan} x={x} y={y} width={CHIP} height={CHIP} rx={36} pathLength={1000} />}
      <rect className={styles.inner} x={x + 24} y={y + 24} width={CHIP - 48} height={CHIP - 48} rx={24} />
      <rect className={styles.die} x={(VIEW_W - die) / 2} y={(VIEW_H - die) / 2} width={die} height={die} rx={16} />
      {surgeKey && !still && (
        <g key={surgeKey} className={styles.surge}>
          <path d={circuit.traces} />
          <rect className={styles.surgeDie} x={(VIEW_W - die) / 2} y={(VIEW_H - die) / 2} width={die} height={die} rx={16} />
        </g>
      )}
    </svg>
  );
}
