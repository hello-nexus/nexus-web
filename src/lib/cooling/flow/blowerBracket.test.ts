// @vitest-environment node
import { describe, expect, it } from 'vitest';
import layoutJson from '../__fixtures__/t1-y70-turbo3090-case-layout.json';
import { parseCaseLayout, simChannelId } from '../caseLayout';
import { M3S_PER_CFM } from '../pressureModel';
import { slotDirections, slotSpeeds, withDefaultBindings } from '../slotFlow';
import { visualFlow } from '../visualFlow';
import { CpuFlow } from './cpuSolver';
import { GRID_LOW_CELLS, GRID_TARGET_CELLS } from './flowParams';
import { buildFlowScene, OPENING_VENT } from './gridScene';

const STEPS = 150;

/** The Y70 with a blower card (Gigabyte TURBO RTX 3090, one fan, bracket on the max x face), its fan on a simulated channel. */
function bracketOutflow(cells: number) {
  const layout = parseCaseLayout(layoutJson, null)!;
  const bindings = withDefaultBindings([{ channelId: simChannelId(3000), slotKeys: ['gpu:fan:0'] }], layout.fanSlots, []);
  const directions = slotDirections(layout.fanSlots, {});
  const flows = visualFlow(layout.fanSlots, [], slotSpeeds(layout.fanSlots, bindings, []), directions);
  const scene = buildFlowScene({ layout, directions, fanCfm: flows.fanCfm, ventCfm: flows.ventCfm, referenceCfm: flows.referenceCfm }, cells);
  const flow = new CpuFlow(scene);
  for (let s = 0; s < STEPS; s++) flow.step();
  const [NX, NY] = scene.dims;
  const cellOf = (mm: number, a: number) => Math.floor((mm + scene.origin[a]) / scene.cellMm);
  const card = layout.boxes.find(b => b.slot === 'gpu' && b.role === 'part')!;
  const lo = [0, 1, 2].map(a => cellOf(card.min[a] + 0.01, a));
  const hi = [0, 1, 2].map(a => cellOf(card.min[a] + card.size[a] - 0.01, a));
  let out = 0;
  for (let k = lo[2]; k <= hi[2]; k++) for (let j = lo[1]; j <= hi[1]; j++) {
    const c = scene.caseMax[0] + NX * (j + NY * k);
    if (scene.opening[c] === OPENING_VENT) out += Math.max(0, flow.u[c * 3]);
  }
  const cellM = scene.cellMm / 1000;
  const toCfm = (v: number) => (v * cellM ** 3 / scene.stepSeconds) / M3S_PER_CFM;
  // Air leaving the card back through its fan side, over every cell that is not a fan cell: the card's shell, which only the bracket end may open.
  let leak = 0;
  for (let j = lo[1]; j <= hi[1]; j++) for (let i = lo[0]; i <= hi[0]; i++) {
    const c = i + NX * (j + NY * lo[2]);
    if (!scene.fanCell[c]) leak += Math.max(0, -flow.u[c * 3 + 2]);
  }
  return { cfm: toCfm(out), leakCfm: toCfm(leak), fanCfm: flows.fanCfm['gpu:fan:0'] };
}

// Shares of the fan's rated flow, set below what the carve achieves. The fan delivers well under its rated flow against the card's drag, so a share near one is out of reach.
// Streamlines cannot enter a solid cell, so a streak crossing the card means the solver let air through its shell.
it('a blower card keeps its fan side shut outside the fan disc', () => {
  const r = bracketOutflow(GRID_TARGET_CELLS);
  expect(r.leakCfm).toBeLessThan(r.fanCfm * 0.2);
}, 120000);

describe('a blower card on the lab Y70 exhausts through its bracket at every grid tier', () => {
  it.each([
    ['finest', GRID_TARGET_CELLS, 0.25],
    ['middle', Math.round(GRID_TARGET_CELLS / 2), 0.25],
    ['coarsest', GRID_LOW_CELLS, 0.06],
  ])('%s tier', (_name, cells, share) => {
    const r = bracketOutflow(cells);
    expect(r.fanCfm).toBeGreaterThan(50);
    expect(r.cfm).toBeGreaterThan(r.fanCfm * share);
  }, 120000);
});
