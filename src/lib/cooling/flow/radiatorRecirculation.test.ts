// @vitest-environment node
import { describe, expect, it } from 'vitest';
import fixture from '../__fixtures__/y70-lab-cooling-state.json';
import { collapseMounts, normalizeBindings, parseCaseLayout, type CaseBox } from '../caseLayout';
import { M3S_PER_CFM } from '../pressureModel';
import { boundSlotKeys, slotDirections, slotSpeeds, withDefaultBindings } from '../slotFlow';
import { visualFlow } from '../visualFlow';
import { CpuFlow } from './cpuSolver';
import { buildFlowScene } from './gridScene';

// A side radiator on the lab Y70, solved as the Cooling page does.
const GRID = 147456;
const channels = fixture.channels as never[];
const stored = fixture.layout.bindings as never[];
const parsed = parseCaseLayout(fixture.caseLayout, fixture.radiatorMount)!;
const collapsed = collapseMounts(parsed, [...new Set(boundSlotKeys(stored, channels))].sort());
const layout = collapsed.layout;
const bindings = withDefaultBindings(normalizeBindings(stored, collapsed.canonOf), layout.fanSlots, channels);
const directions = slotDirections(layout.fanSlots, fixture.layout.directions as never);
const flows = visualFlow(layout.fanSlots, [], slotSpeeds(layout.fanSlots, bindings, channels), directions);

describe('a side radiator whose fans draw air through the core', () => {
  const scene = buildFlowScene({ layout, directions, fanCfm: flows.fanCfm, ventCfm: flows.ventCfm, referenceCfm: flows.referenceCfm }, GRID);
  const [NX, NY] = scene.dims;
  const core = layout.boxes.find((b: CaseBox) => b.slot === 'cooler' && b.size[1] > 200)!;
  const cellOf = (mm: number, axis: number) => Math.floor((mm + scene.origin[axis]) / scene.cellMm);
  const lo = [0, 1, 2].map(a => cellOf(core.min[a] + 0.01, a));
  const hi = [0, 1, 2].map(a => cellOf(core.min[a] + core.size[a] - 0.01, a));
  const cellM = scene.cellMm / 1000;
  const toCfm = (cellsPerStep: number) => (cellsPerStep * cellM / scene.stepSeconds * cellM ** 2) / M3S_PER_CFM;

  it('draws its air in through the outer face, not round the core\'s edges from the case', () => {
    const flow = new CpuFlow(scene);
    for (let s = 0; s < 250; s++) flow.step();
    // Radiator axis is z here: the outer face is the high z plane, the fans sit past the low z plane.
    let outer = 0, toFans = 0, sideways = 0;
    for (let k = lo[2]; k <= hi[2]; k++) for (let j = lo[1]; j <= hi[1]; j++) for (let i = lo[0]; i <= hi[0]; i++) {
      const c = i + NX * (j + NY * k);
      if (scene.solid[c]) continue;
      const w = flow.u[c * 3 + 2];
      if (k === hi[2]) outer -= w;
      if (k === lo[2]) toFans -= w;
      // Edge cells that open to the case beside the core.
      if (i === lo[0]) sideways += Math.max(0, flow.u[c * 3]);
      if (i === hi[0]) sideways += Math.max(0, -flow.u[c * 3]);
      if (j === lo[1]) sideways += Math.max(0, flow.u[c * 3 + 1]);
      if (j === hi[1]) sideways += Math.max(0, -flow.u[c * 3 + 1]);
    }
    const fanSide = toCfm(toFans);
    expect(fanSide).toBeGreaterThan(30);
    // The core's edges are sealed, so the fans' air comes through its outer face.
    expect(toCfm(sideways) / fanSide).toBeLessThan(0.15);
    expect(toCfm(outer) / fanSide).toBeGreaterThan(0.65);
  }, 120000);
});
