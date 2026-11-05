// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCaseLayout, type CaseFanSlot } from '../caseLayout';
import { cardFanSpec, M3S_PER_CFM } from '../pressureModel';
import { CpuFlow } from './cpuSolver';
import { buildFlowScene } from './gridScene';

const GRID = 64 * 48 * 96;
const STEPS = 300;
const raw = JSON.parse(readFileSync(new URL('../__fixtures__/x50-case-layout.json', import.meta.url), 'utf8')) as { boxes: { slot: string; role: string; fans?: Record<string, unknown> }[] };

type Props = { flowThrough?: number[]; bracketExhaust?: string };

/** The X50 fixture's flat card with its three fans spinning, solved as the Cooling page does. */
function measure(props: Props) {
  const boxes = raw.boxes.map(b => (b.slot === 'gpu' && b.role === 'part' ? { ...b, fans: { ...b.fans, ...props } } : b));
  const layout = parseCaseLayout({ ...raw, boxes })!;
  const gpuSlots = layout.fanSlots.filter((s: CaseFanSlot) => s.position === 'gpu');
  const directions: Record<string, 'intake' | 'exhaust'> = {};
  const fanCfm: Record<string, number> = {};
  const cfm = cardFanSpec(84).cfm;
  for (const s of gpuSlots) { directions[s.key] = 'intake'; fanCfm[s.key] = cfm; }
  const scene = buildFlowScene({ layout, directions, fanCfm, ventCfm: 0, referenceCfm: cfm }, GRID);
  const flow = new CpuFlow(scene);
  for (let s = 0; s < STEPS; s++) flow.step();
  const [NX, NY] = scene.dims;
  const cellOf = (mm: number, a: number) => Math.floor((mm + scene.origin[a]) / scene.cellMm);
  const cellM = scene.cellMm / 1000;
  const toCfm = (v: number) => (v * cellM * cellM ** 2 / scene.stepSeconds) / M3S_PER_CFM;
  const card = layout.boxes.find(b => b.slot === 'gpu' && b.role === 'part')!;
  const lo = [0, 1, 2].map(a => cellOf(card.min[a] + 0.01, a));
  const hi = [0, 1, 2].map(a => cellOf(card.min[a] + card.size[a] - 0.01, a));
  /** Upward flux through the plane just past the card's back, over the x range of one fan (index from bracket). */
  const backFlux = (fan: number) => {
    const s = gpuSlots[fan];
    const x0 = cellOf(s.box!.min[0], 0), x1 = cellOf(s.box!.min[0] + s.box!.size[0], 0);
    let sum = 0;
    for (let k = lo[2]; k <= hi[2]; k++) for (let i = x0; i <= x1; i++) sum += Math.max(0, flow.u[(i + NX * ((hi[1] + 1) + NY * k)) * 3 + 1]);
    return toCfm(sum);
  };
  /** Air leaving through the case's rear face over the card's cross-section. */
  let rear = 0;
  for (let k = lo[2]; k <= hi[2]; k++) for (let j = lo[1]; j <= hi[1]; j++) rear += Math.max(0, flow.u[(scene.caseMax[0] + NX * (j + NY * k)) * 3]);
  const intake = gpuSlots.map((_, i) => i);
  return { backs: intake.map(backFlux), rear: toCfm(rear), fanCfm: cfm };
}

const results = new Map<string, ReturnType<typeof measure>>();
const run = (p: Props) => {
  const key = JSON.stringify(p);
  if (!results.has(key)) results.set(key, measure(p));
  return results.get(key)!;
};
const total = (v: number[]) => v.reduce((a, b) => a + b, 0);

describe('a card with unknown or no airflow properties', () => {
  it('keeps its back plate shut and nothing leaves the case rear', () => {
    const base = run({});
    expect(total(base.backs)).toBeLessThan(1);
    expect(base.rear).toBeLessThan(0.5);
  }, 600000);

  it('reads none the same as unset', () => {
    const base = run({});
    const none = run({ bracketExhaust: 'none' });
    expect(none.backs.map(v => Math.round(v))).toEqual(base.backs.map(v => Math.round(v)));
    expect(Math.abs(none.rear - base.rear)).toBeLessThan(0.5);
  }, 600000);
});

describe('a card with flow-through fans', () => {
  it('sends the far fan\'s air out of the back plate over that fan only', () => {
    const r = run({ flowThrough: [2] });
    expect(r.backs[2]).toBeGreaterThan(r.fanCfm * 0.5);
    expect(r.backs[0] + r.backs[1]).toBeLessThan(1);
  }, 600000);

  it('opens every fan when all are flow-through', () => {
    const r = run({ flowThrough: [0, 1, 2] });
    for (const v of r.backs) expect(v).toBeGreaterThan(r.fanCfm * 0.5);
  }, 600000);
});

describe('a card with bracket vents', () => {
  it('a blower sends its air out of the case rear and none out of the back plate', () => {
    const r = run({ bracketExhaust: 'blower' });
    expect(r.rear).toBeGreaterThan(r.fanCfm * 0.3);
    expect(total(r.backs)).toBeLessThan(0.5);
  }, 600000);

  it('a partial card sits between a closed bracket and a blower', () => {
    const none = run({});
    const partial = run({ bracketExhaust: 'partial' });
    const blower = run({ bracketExhaust: 'blower' });
    expect(partial.rear).toBeGreaterThan(none.rear + 1);
    expect(partial.rear).toBeLessThan(blower.rear * 0.8);
  }, 600000);
});
