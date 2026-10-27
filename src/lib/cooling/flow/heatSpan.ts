import { HEAT_SPAN_FLOOR_K, HEAT_SPAN_PERCENTILE, HEAT_SPAN_TAU_MS } from './flowParams';
import type { FlowScene } from './gridScene';

const BINS = 512;

/** Indices of the fluid cells inside the case: the air the color span is ranked over. */
export function caseFluidCells(scene: Pick<FlowScene, 'dims' | 'caseMin' | 'caseMax' | 'solid'>): Uint32Array {
  const [nx, ny, nz] = scene.dims;
  const { caseMin, caseMax } = scene;
  const out: number[] = [];
  for (let k = Math.max(0, caseMin[2]); k <= Math.min(nz - 1, caseMax[2]); k++) {
    for (let j = Math.max(0, caseMin[1]); j <= Math.min(ny - 1, caseMax[1]); j++) {
      for (let i = Math.max(0, caseMin[0]); i <= Math.min(nx - 1, caseMax[0]); i++) {
        const c = i + nx * (j + ny * k);
        if (!scene.solid[c]) out.push(c);
      }
    }
  }
  return Uint32Array.from(out);
}

/** The rise at the given rank among the listed cells, from a histogram so a large field stays cheap. Zero for an empty list or a field with no rise. */
export function percentileRise(rises: Float32Array, cells: Uint32Array, share = HEAT_SPAN_PERCENTILE): number {
  if (cells.length === 0) return 0;
  let max = 0;
  for (let i = 0; i < cells.length; i++) if (rises[cells[i]] > max) max = rises[cells[i]];
  if (!(max > 0)) return 0;
  const bins = new Uint32Array(BINS);
  for (let i = 0; i < cells.length; i++) bins[Math.min(BINS - 1, Math.max(0, Math.floor((rises[cells[i]] / max) * BINS)))]++;
  const want = share * cells.length;
  let seen = 0;
  for (let b = 0; b < BINS; b++) {
    seen += bins[b];
    if (seen >= want) return ((b + 1) / BINS) * max;
  }
  return max;
}

/** The color span for a measured percentile: never below the floor. */
export const spanFor = (percentile: number): number => Math.max(HEAT_SPAN_FLOOR_K, percentile);

/** Eases the span toward its target over real time, so a new readback never makes the colors jump. */
export const easeSpan = (current: number, target: number, dtMs: number, tauMs = HEAT_SPAN_TAU_MS): number => target + (current - target) * Math.exp(-Math.max(0, dtMs) / tauMs);
