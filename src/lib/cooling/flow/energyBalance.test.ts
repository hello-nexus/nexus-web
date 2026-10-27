// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CpuFlow } from './cpuSolver';
import { AIR_DENSITY, AIR_SPECIFIC_HEAT } from './flowParams';
import { fronts, gpuBox, inputFor, rear } from './flowFixtures';
import { buildFlowScene, powerRisePerStep, SOURCE_GPU } from './gridScene';
import { exhaustRiseK, isHot } from './heatModel';

const LOW = 32 * 24 * 48;
const M3S_PER_CFM = 0.000471947;
const RHO_CP = AIR_DENSITY * AIR_SPECIFIC_HEAT;
const scene60 = () => buildFlowScene(inputFor([fronts[0], rear], [gpuBox], s => (s.key.startsWith('front') ? 'intake' : 'exhaust'), 60), LOW);
const heatContentJ = (flow: CpuFlow) => {
  let sum = 0;
  for (let c = 0; c < flow.n; c++) sum += flow.t[c];
  return sum * RHO_CP * flow.scene.cellVolumeM3;
};

describe('heat from power', () => {
  it('adds exactly P dt of energy per step, whatever the grid, from rho, cp and the cell volume', () => {
    for (const cells of [LOW, LOW * 2]) {
      const scene = buildFlowScene(inputFor([fronts[0], rear], [gpuBox], s => (s.key.startsWith('front') ? 'intake' : 'exhaust'), 60), cells);
      const flow = new CpuFlow(scene);
      flow.setTemps({ cpu: null, gpu: 40, gpuW: 150 });
      flow.step();
      expect(heatContentJ(flow)).toBeCloseTo(150 * scene.stepSeconds, 5);
      expect(powerRisePerStep(scene, SOURCE_GPU, 150) * scene.heatCellCount[SOURCE_GPU] * RHO_CP * scene.cellVolumeM3).toBeCloseTo(150 * scene.stepSeconds, 8);
    }
  });

  it('is -1 for a part with no cells or no reading, so the part temperature takes over', () => {
    const scene = scene60();
    expect(powerRisePerStep(scene, SOURCE_GPU, -1)).toBe(-1);
    expect(powerRisePerStep({ ...scene, heatCellCount: [0, 0, 0, 0] }, SOURCE_GPU, 100)).toBe(-1);
  });
});

/** Net enthalpy flux (W) and volume flows (m^3/s, outward and inward) through the shell of cells `depth` in from the domain boundary, away from its edges. */
function shellBalance(flow: CpuFlow, depth: number) {
  const s = flow.scene;
  const dims = s.dims;
  const toMps = s.cellMm / 1000 / s.stepSeconds;
  const area = (s.cellMm / 1000) ** 2;
  let watts = 0;
  let out = 0;
  let inn = 0;
  for (let c = 0; c < flow.n; c++) {
    if (s.solid[c]) continue;
    const idx = [c % dims[0], Math.floor(c / dims[0]) % dims[1], Math.floor(c / (dims[0] * dims[1]))];
    for (let a = 0; a < 3; a++) {
      if (idx[a] !== depth && idx[a] !== dims[a] - 1 - depth) continue;
      if ([0, 1, 2].some(o => o !== a && (idx[o] < depth || idx[o] > dims[o] - 1 - depth))) continue;
      const f = (idx[a] === depth ? -1 : 1) * flow.u[c * 3 + a] * toMps * area;
      watts += RHO_CP * flow.t[c] * f;
      if (f > 0) out += f; else inn -= f;
    }
  }
  return { watts, out, inn };
}

describe('energy balance', () => {
  it('the exhaust rise by hand is P / (rho cp Q)', () => {
    expect(exhaustRiseK(150, 100)).toBeCloseTo(150 / (RHO_CP * 100 * M3S_PER_CFM), 10);
    expect(exhaustRiseK(150, 0)).toBe(0);
  });

  it('the air through the exhaust fan carries the part\'s power away, so its rise matches the hand number', { timeout: 300000 }, () => {
    const scene = scene60();
    const flow = new CpuFlow(scene);
    const power = 120;
    flow.setTemps({ cpu: null, gpu: 40, gpuW: power });
    for (let i = 0; i < 3000; i++) flow.step();
    // The exhaust fan's cells hold its own velocity in several layers: read the enthalpy flux and the volume flow over the same cells, so the layer count cancels in the rise.
    const [nx] = scene.dims;
    const toMps = scene.cellMm / 1000 / scene.stepSeconds;
    const area = (scene.cellMm / 1000) ** 2;
    let watts = 0;
    let q = 0;
    for (let c = 0; c < flow.n; c++) {
      if (!scene.fanCell[c] || c % nx < scene.caseBounds.max[0] - 4) continue;
      const v = Math.hypot(scene.target[c * 3], scene.target[c * 3 + 1], scene.target[c * 3 + 2]) * toMps;
      q += v * area;
      watts += RHO_CP * flow.t[c] * v * area;
    }
    expect(q).toBeGreaterThan(0);
    const measuredRise = watts / (RHO_CP * q);
    // The fan runs at the rated flow the scene was built with and nothing else leaves the case, so all of the power goes out through it.
    const handRise = exhaustRiseK(power, 60);
    expect(measuredRise / handRise).toBeGreaterThan(0.8);
    expect(measuredRise / handRise).toBeLessThan(1.25);

    // The same energy through the whole boundary: a shell around the case carries out the power put in, and the air in equals the air out. The enthalpy runs a little high, about a third, because the advection averages over fluid cells only beside the card's walls: the bounds are that accuracy, not slack.
    for (const depth of [3, 5]) {
      const shell = shellBalance(flow, depth);
      expect(Math.abs(shell.out - shell.inn) / shell.out, `volume balance at depth ${depth}`).toBeLessThan(0.1);
      expect(shell.watts / power, `enthalpy flux at depth ${depth}`).toBeGreaterThan(0.75);
      expect(shell.watts / power, `enthalpy flux at depth ${depth}`).toBeLessThan(1.4);
    }
  });
});

describe('a part with power but no temperature', () => {
  it('counts as hot from its watts, and a known temperature decides first', () => {
    expect(isHot([-1, -1, -1], [-1, 150, -1])).toBe(true);
    expect(isHot([-1, -1, -1], [-1, 5, -1])).toBe(false);
    expect(isHot([-1, 0.2, -1], [-1, 300, -1])).toBe(false);
    expect(isHot([-1, 30, -1], [-1, -1, -1])).toBe(true);
  });

  it('never heats the air past the part\'s own temperature', { timeout: 120000 }, () => {
    const scene = scene60();
    const flow = new CpuFlow(scene);
    // No fan moves air in this stretch, a tiny rise cap: a large power cannot lift the cells above the part.
    flow.setTemps({ cpu: null, gpu: 22 + 3, gpuW: 400 });
    for (let i = 0; i < 400; i++) flow.step();
    let max = 0;
    for (let c = 0; c < flow.n; c++) if (scene.heat[c] === SOURCE_GPU) max = Math.max(max, flow.t[c]);
    expect(max).toBeLessThanOrEqual(3 + 1e-6);
  });
});
