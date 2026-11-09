// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCaseLayout, type CaseLayout } from '../caseLayout';
import { drawsCaseAir, slotDirections, slotSpeeds, withDefaultBindings } from '../slotFlow';
import { visualFlow } from '../visualFlow';
import { CpuFlow } from './cpuSolver';
import { OPENING_EXHAUST, OPENING_INTAKE, buildFlowScene, type FlowScene } from './gridScene';

const fixture = (name: string) => JSON.parse(readFileSync(new URL(`../__fixtures__/${name}-case-layout.json`, import.meta.url), 'utf8')) as { boxes: Record<string, unknown>[]; fanSlots: unknown[] };
const MID = 64 * 48 * 96;
const LOW = 32 * 24 * 48;
const M3S_PER_CFM = 0.000471947;
const CFM_PER_M3S = 1 / M3S_PER_CFM;

/** The fixture's PSU box with the layout's PSU fan fields on it, as Build now writes them. */
function withPsuFan(name: string, fans: Record<string, unknown> | null, lowerTo?: number): CaseLayout {
  const raw = fixture(name);
  const boxes = raw.boxes.map(b => (b.slot === 'psu' && b.role === 'part' ? { ...b, ...(lowerTo !== undefined ? { min: [(b.min as number[])[0], lowerTo, (b.min as number[])[2]] } : {}), fans: fans ? { ...(b.fans as object), diameter: 120, exhaust: { axis: 'x', side: 'max' }, ...fans } : undefined } : b));
  return parseCaseLayout({ ...raw, boxes })!;
}

const flowOf = (layout: CaseLayout) => {
  const catalog: never[] = [];
  const slots = layout.fanSlots;
  const bindings = withDefaultBindings([], slots, []);
  const speeds = slotSpeeds(slots, bindings, []);
  const directions = slotDirections(slots, {});
  return { slots, visual: visualFlow(slots, catalog, speeds, directions), directions };
};

/** The shell cells the scene marks as the given kind of opening, and their total area in m^2. */
function throughOpenings(scene: FlowScene, kind: number): { cells: number[]; area: number } {
  const cells: number[] = [];
  for (let c = 0; c < scene.opening.length; c++) if (scene.opening[c] === kind) cells.push(c);
  return { cells, area: cells.length * (scene.cellMm / 1000) ** 2 };
}

function settle(scene: FlowScene, steps = 200): CpuFlow {
  const flow = new CpuFlow(scene);
  for (let n = 0; n < steps; n++) flow.step();
  return flow;
}

/** Volume flow (CFM) across the given opening cells along axis `a`, positive outward through the shell. */
function crossing(flow: CpuFlow, cells: number[], a: number, outward: number): number {
  const s = flow.scene;
  const toMps = s.cellMm / 1000 / s.stepSeconds;
  const area = (s.cellMm / 1000) ** 2;
  return cells.reduce((sum, c) => sum + outward * flow.u[c * 3 + a] * toMps * area, 0) * CFM_PER_M3S;
}

describe('X50: the PSU sits at the top rear of a single chamber', () => {
  const layout = withPsuFan('x50', { side: 'min' });
  const { slots, visual, directions } = flowOf(layout);
  const psu = slots.find(s => s.key === 'psu:fan:0')!;
  const input = { layout, directions, fanCfm: visual.fanCfm, ventCfm: visual.ventCfm, referenceCfm: visual.referenceCfm };
  const scene = buildFlowScene(input, MID);

  it('adds one PSU fan that draws case air', () => {
    expect(slots.filter(s => s.position === 'psu')).toHaveLength(1);
    expect(drawsCaseAir(psu)).toBe(true);
    expect(visual.fanCfm['psu:fan:0']).toBeGreaterThan(0);
  });

  it('opens the rear panel across the PSU grille and nothing at the PSU face', () => {
    const exhaust = throughOpenings(scene, OPENING_EXHAUST);
    expect(exhaust.cells.length).toBeGreaterThan(0);
    const [NX, NY] = scene.dims;
    expect(exhaust.cells.every(c => c % NX === scene.caseMax[0])).toBe(true);
    // Every exhaust cell is within the PSU's height and width at the rear.
    const psuBox = layout.boxes.find(b => b.slot === 'psu' && b.role === 'part')!;
    for (const c of exhaust.cells) {
      const j = Math.floor(c / NX) % NY, k = Math.floor(c / (NX * NY));
      const y = (j + 0.5) * scene.cellMm - scene.origin[1], z = (k + 0.5) * scene.cellMm - scene.origin[2];
      expect(y).toBeGreaterThanOrEqual(psuBox.min[1] - scene.cellMm);
      expect(y).toBeLessThanOrEqual(psuBox.min[1] + psuBox.size[1] + scene.cellMm);
      expect(z).toBeGreaterThanOrEqual(psuBox.min[2] - scene.cellMm);
      expect(z).toBeLessThanOrEqual(psuBox.min[2] + psuBox.size[2] + scene.cellMm);
    }
    // The PSU adds no intake opening of its own: the chamber's air comes in only through the openings the case already had.
    const bare = buildFlowScene({ layout: withPsuFan('x50', null), directions, fanCfm: {}, ventCfm: 0 }, MID);
    expect(throughOpenings(scene, OPENING_INTAKE).cells).toHaveLength(throughOpenings(bare, OPENING_INTAKE).cells.length);
  });

  it('drives the fan cells into the PSU and gives the fan its own emitters', () => {
    expect(scene.emitterCounts['psu:fan:0']).toBeGreaterThan(0);
    let driven = 0;
    const j = (c: number) => Math.floor(c / scene.dims[0]) % scene.dims[1];
    for (let c = 0; c < scene.fanCell.length; c++) if (scene.fanCell[c] && scene.target[c * 3 + 1] > 0 && j(c) >= Math.floor((psu.box!.min[1] + scene.origin[1]) / scene.cellMm) - 4) driven++;
    expect(driven).toBeGreaterThan(0);
  });

  it('pulls air from the chamber out of the rear: the exhaust cells carry flow outward', () => {
    const coarse = buildFlowScene(input, LOW);
    const out = crossing(settle(coarse), throughOpenings(coarse, OPENING_EXHAUST).cells, 0, 1);
    expect(out).toBeGreaterThan(0.5 * visual.fanCfm['psu:fan:0']);
  }, 60000);

  it('leaves the scene as it was for the fixture as Build wrote it, a PSU ring with no grille end', () => {
    // The fixture's own PSU fans (no `exhaust`), against the same layout with the ring taken off: neither has a PSU slot, so both are the scene before PSU fans existed.
    const original = parseCaseLayout(fixture('x50'))!;
    const stripped = withPsuFan('x50', null);
    expect(original.fanSlots.filter(s => s.position === 'psu')).toHaveLength(0);
    const a = buildFlowScene({ layout: original, directions: {}, fanCfm: {}, ventCfm: 0 }, MID);
    const b = buildFlowScene({ layout: stripped, directions: {}, fanCfm: {}, ventCfm: 0 }, MID);
    for (const key of ['solid', 'opening', 'darcy', 'fanCell', 'target', 'heat'] as const) expect(Array.from(a[key])).toEqual(Array.from(b[key]));
  });

  it('runs no PSU fan when the grille faces no case panel within reach', () => {
    const far = parseCaseLayout({ ...fixture('x50'), boxes: fixture('x50').boxes.map(b => (b.slot === 'psu' && b.role === 'part' ? { ...b, min: [100, (b.min as number[])[1], (b.min as number[])[2]], fans: { ...(b.fans as object), diameter: 120, exhaust: { axis: 'x', side: 'max' } } } : b)) })!;
    expect(far.fanSlots.filter(s => s.position === 'psu')).toHaveLength(0);
  });
});

describe('Y70: the PSU stands upright in the rear chamber', () => {
  const layout = withPsuFan('y70', { axis: 'z', side: 'max' });
  const { visual, directions } = flowOf(layout);
  const scene = buildFlowScene({ layout, directions, fanCfm: visual.fanCfm, ventCfm: visual.ventCfm, referenceCfm: visual.referenceCfm }, MID);

  it('sends the fan air out of the rear panel through the PSU grille', () => {
    const exhaust = throughOpenings(scene, OPENING_EXHAUST);
    expect(exhaust.cells.length).toBeGreaterThan(0);
    expect(exhaust.cells.every(c => c % scene.dims[0] === scene.caseMax[0])).toBe(true);
    const coarse = buildFlowScene({ layout, directions, fanCfm: visual.fanCfm, ventCfm: visual.ventCfm, referenceCfm: visual.referenceCfm }, LOW);
    expect(crossing(settle(coarse), throughOpenings(coarse, OPENING_EXHAUST).cells, 0, 1)).toBeGreaterThan(0.5 * visual.fanCfm['psu:fan:0']);
  }, 60000);
});

describe('a PSU on the floor over a documented case vent', () => {
  // The X50 fixture's PSU moved down to the floor, fan facing down.
  const FLOOR_MM = 20;
  const layout = withPsuFan('x50', { side: 'min', draws: 'outside' }, FLOOR_MM);
  const { slots, visual, directions } = flowOf(layout);
  const scene = buildFlowScene({ layout, directions, fanCfm: visual.fanCfm, ventCfm: visual.ventCfm, referenceCfm: visual.referenceCfm }, MID);

  it('stays out of the case pressure balance', () => {
    expect(slots.find(s => s.position === 'psu')!.ventFed).toBe(true);
    expect(visual.ventCfm).toBe(flowOf(withPsuFan('x50', null)).visual.ventCfm);
    expect(visual.fanCfm['psu:fan:0']).toBeGreaterThan(0);
  });

  it('pulls room air in through a panel opening under the fan', () => {
    const bare = buildFlowScene({ layout: withPsuFan('x50', null, FLOOR_MM), directions: {}, fanCfm: {}, ventCfm: 0 }, MID);
    expect(throughOpenings(scene, OPENING_INTAKE).cells.length).toBeGreaterThan(throughOpenings(bare, OPENING_INTAKE).cells.length);
    expect(throughOpenings(scene, OPENING_EXHAUST).cells.length).toBeGreaterThan(0);
  });
});
