// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCaseLayout, type CaseFanSlot } from '../caseLayout';
import { cardFanSpec, M3S_PER_CFM } from '../pressureModel';
import { CpuFlow } from './cpuSolver';
import { buildFlowScene } from './gridScene';

// A coarse grid and a short run: enough for the flux ratios asserted here, a fraction of the Cooling page's cost.
const GRID = 40 * 30 * 60;
const STEPS = 130;

type Raw = { boxes: { slot: string; role: string; select?: string; min: number[]; size: number[]; fans?: Record<string, unknown> }[] };
const load = (name: string) => JSON.parse(readFileSync(new URL(`../__fixtures__/${name}-case-layout.json`, import.meta.url), 'utf8')) as Raw;
const fixtures: Record<string, Raw> = { x50: load('x50'), y70: load('t1-y70-5080') };

type Props = { flowThrough?: number[]; bracketExhaust?: string; bracket?: { axis: string; side: string } };
/** `shape` overrides the first card's fan list before the properties apply. */
type Scenario = { fixture: 'x50' | 'y70'; props: Props; second?: Props; shape?: Record<string, unknown> };

/** A second card beside the first, shifted along z by `dz`, so neither one's back faces the other. */
const clone = (b: Raw['boxes'][number], dz: number, props: Props) => ({ ...b, select: 'gpu:1', min: [b.min[0], b.min[1], b.min[2] + dz], fans: { ...b.fans, ...props } });

/** A fixture's card with its fans spinning, as the Cooling page builds the grid. */
function build({ fixture, props, second, shape }: Scenario) {
  const raw = fixtures[fixture];
  const boxes: Raw['boxes'] = [];
  for (const b of raw.boxes) {
    const isCard = b.slot === 'gpu' && b.role === 'part';
    boxes.push(isCard ? { ...b, fans: { ...b.fans, ...shape, ...props } } : b);
    if (isCard && second) boxes.push(clone(b, b.size[2] + 4, second));
  }
  const layout = parseCaseLayout({ ...raw, boxes })!;
  const cards = layout.boxes.filter(b => b.slot === 'gpu' && b.role === 'part');
  const gpuSlots = layout.fanSlots.filter((s: CaseFanSlot) => s.position === 'gpu');
  const directions: Record<string, 'intake' | 'exhaust'> = {};
  const fanCfm: Record<string, number> = {};
  const cfm = cardFanSpec(84).cfm;
  for (const s of gpuSlots) { directions[s.key] = 'intake'; fanCfm[s.key] = cfm; }
  const scene = buildFlowScene({ layout, directions, fanCfm, ventCfm: 0, referenceCfm: cfm }, GRID);
  return { scene, cards, gpuSlots, cfm };
}

/** The grid solved for a while; fluxes in CFM per card. */
function measure(scenario: Scenario) {
  const { scene, cards, gpuSlots, cfm } = build(scenario);
  const flow = new CpuFlow(scene);
  for (let s = 0; s < STEPS; s++) flow.step();
  const [NX, NY] = scene.dims;
  const cellOf = (mm: number, a: number) => Math.floor((mm + scene.origin[a]) / scene.cellMm);
  const cellM = scene.cellMm / 1000;
  const toCfm = (v: number) => (v * cellM * cellM ** 2 / scene.stepSeconds) / M3S_PER_CFM;
  const u = (i: number, j: number, k: number, a: number) => flow.u[(i + NX * (j + NY * k)) * 3 + a];
  const perCard = cards.map(card => {
    const k = { x: 0, y: 1, z: 2 }[card.fans!.axis];
    const lo = [0, 1, 2].map(a => cellOf(card.min[a] + 0.01, a));
    const hi = [0, 1, 2].map(a => cellOf(card.min[a] + card.size[a] - 0.01, a));
    const mine = gpuSlots.filter(s => [0, 1, 2].every(a => s.box!.min[a] < card.min[a] + card.size[a] && card.min[a] < s.box!.min[a] + s.box!.size[a]));
    /** Flux along the fan axis through the plane just past the card's back, over one fan's span along the card's length. */
    const backFlux = (s: CaseFanSlot) => {
      const x0 = cellOf(s.box!.min[0], 0), x1 = cellOf(s.box!.min[0] + s.box!.size[0], 0);
      const r = [0, 1, 2].map(a => (a === 0 ? [x0, x1] : [lo[a], hi[a]]));
      r[k] = [hi[k] + 1, hi[k] + 1];
      let sum = 0;
      for (let kk = r[2][0]; kk <= r[2][1]; kk++) for (let j = r[1][0]; j <= r[1][1]; j++) for (let i = r[0][0]; i <= r[0][1]; i++) sum += Math.max(0, u(i, j, kk, k));
      return toCfm(sum);
    };
    /** Air leaving through the case's rear face over the card's cross-section. */
    let rear = 0;
    for (let kk = lo[2]; kk <= hi[2]; kk++) for (let j = lo[1]; j <= hi[1]; j++) rear += Math.max(0, u(scene.caseMax[0], j, kk, 0));
    // Slots sit in list order: from the bracket end for sized fans, from the min end for unsized ones.
    return { backs: mine.map(backFlux), rear: toCfm(rear) };
  });
  return { cards: perCard, fanCfm: cfm };
}

const results = new Map<string, ReturnType<typeof measure>>();
const run = (s: Scenario) => {
  const key = JSON.stringify(s);
  if (!results.has(key)) results.set(key, measure(s));
  return results.get(key)!;
};
/** Two scenarios build the very same grid: every solid, drag, heat and opening cell. */
const sameGrid = (a: Scenario, b: Scenario) => {
  const [x, y] = [build(a).scene, build(b).scene];
  return (['solid', 'darcy', 'heat', 'opening'] as const).every(f => x[f].length === y[f].length && x[f].every((v, i) => v === y[f][i]));
};
const total = (v: number[]) => v.reduce((a, b) => a + b, 0);

describe.each(['x50', 'y70'] as const)('%s card, horizontal and vertical mounts alike', fixture => {
  const first = (props: Props) => run({ fixture, props }).cards[0];
  const cfm = () => run({ fixture, props: {} }).fanCfm;

  it('with unknown properties keeps its back plate shut and nothing leaves the case rear', () => {
    const base = first({});
    expect(total(base.backs)).toBeLessThan(cfm() * 0.1);
    expect(base.rear).toBeLessThan(cfm() * 0.1);
  }, 600000);

  it('reads none the same as unset', () => {
    expect(sameGrid({ fixture, props: {} }, { fixture, props: { bracketExhaust: 'none' } })).toBe(true);
  }, 600000);

  it('sends the far flow-through fan\'s air out of the back plate over that fan only', () => {
    const r = first({ flowThrough: [2] });
    expect(r.backs[2]).toBeGreaterThan(cfm() * 0.5);
    expect(r.backs[0] + r.backs[1]).toBeLessThan(cfm() * 0.1);
  }, 600000);

  it('opens every fan when all are flow-through', () => {
    for (const v of first({ flowThrough: [0, 1, 2] }).backs) expect(v).toBeGreaterThan(cfm() * 0.5);
  }, 600000);

  it('a blower sends its air out of the case rear and none out of the back plate', () => {
    const r = first({ bracketExhaust: 'blower' });
    expect(r.rear).toBeGreaterThan(cfm() * 0.3);
    expect(total(r.backs)).toBeLessThan(cfm() * 0.1);
  }, 600000);

  it('a partial card sits between a closed bracket and a blower', () => {
    const none = first({});
    const partial = first({ bracketExhaust: 'partial' });
    const blower = first({ bracketExhaust: 'blower' });
    expect(partial.rear).toBeGreaterThan(none.rear + 1);
    expect(partial.rear).toBeLessThan(blower.rear * 0.8);
  }, 600000);

  it('a stated bracket end at the max side of the card builds the grid the default does', () => {
    expect(sameGrid({ fixture, props: { bracketExhaust: 'blower' } }, { fixture, props: { bracketExhaust: 'blower', bracket: { axis: 'x', side: 'max' } } })).toBe(true);
  }, 600000);
});

describe('other card shapes', () => {
  const cfm = () => run({ fixture: 'x50', props: {} }).fanCfm;

  it('a two-fan card with both fans flow-through opens both', () => {
    const shape = { count: 2, sizes: [84, 84], diameter: 96 };
    const r = run({ fixture: 'x50', props: { flowThrough: [0, 1] }, shape }).cards[0];
    expect(r.backs).toHaveLength(2);
    for (const v of r.backs) expect(v).toBeGreaterThan(cfm() * 0.5);
    expect(run({ fixture: 'x50', props: {}, shape }).cards[0].backs.every(v => v < cfm() * 0.1)).toBe(true);
  }, 600000);

  it('an unsized card lists its fans from the min end, so the bracket-end-counted index 2 is the first listed fan', () => {
    const r = run({ fixture: 'x50', props: { flowThrough: [2] }, shape: { sizes: null } }).cards[0];
    expect(r.backs[0]).toBeGreaterThan(cfm() * 0.5);
    expect(r.backs[1] + r.backs[2]).toBeLessThan(cfm() * 0.1);
  }, 600000);
});

describe('two graphics cards', () => {
  it('each card follows its own properties', () => {
    const r = run({ fixture: 'x50', props: { bracketExhaust: 'blower' }, second: { flowThrough: [2] } });
    const [a, b] = r.cards;
    expect(a.rear).toBeGreaterThan(r.fanCfm * 0.3);
    expect(total(a.backs)).toBeLessThan(r.fanCfm * 0.1);
    expect(b.backs[2]).toBeGreaterThan(r.fanCfm * 0.5);
    expect(b.backs[0] + b.backs[1]).toBeLessThan(r.fanCfm * 0.1);
    expect(b.rear).toBeLessThan(r.fanCfm * 0.1);
  }, 600000);
});
