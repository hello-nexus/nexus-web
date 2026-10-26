// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CpuFlow } from './cpuSolver';
import { CpuParticles } from './cpuParticles';
import { ROOM_TEMP_C } from './flowParams';
import { caseWithGpuAndShroud, defaultDir, gpuBox, inputFor, slotSpec, nineFans } from './flowFixtures';
import { SOURCE_CPU, SOURCE_GPU, SOURCE_NONE, buildFlowScene, type FlowScene } from './gridScene';
import { heatAnchors, heatStep, sourceRises } from './heatModel';
import { boxContains } from './voxelize';

const LOW = 32 * 24 * 48;
const SPEED = 1.5;

const cellsOf = (s: FlowScene, source: number) => {
  const out: number[] = [];
  for (let c = 0; c < s.heat.length; c++) if (s.heat[c] === source && !s.solid[c]) out.push(c);
  return out;
};
const centerMm = (s: FlowScene, c: number): [number, number, number] => {
  const [NX, NY] = s.dims;
  const i = c % NX, j = Math.floor(c / NX) % NY, k = Math.floor(c / (NX * NY));
  return [(i + 0.5) * s.cellMm - s.origin[0], (j + 0.5) * s.cellMm - s.origin[1], (k + 0.5) * s.cellMm - s.origin[2]];
};
/** Degrees above ambient after a particle crosses `steps` cells one step each. */
const crossing = (cells: number[], s: FlowScene, temps: Parameters<typeof sourceRises>[0], steps = 20) => {
  const rises = sourceRises(temps);
  let rise = 0;
  for (let i = 0; i < steps; i++) rise = heatStep(rise, rises[s.heat[cells[i % cells.length]]], SPEED);
  return rise;
};

describe('heat sources in the scene', () => {
  const scene = buildFlowScene(caseWithGpuAndShroud(), LOW);

  it('tags the air around the GPU as GPU heat and leaves the rest cold', () => {
    const gpu = cellsOf(scene, SOURCE_GPU);
    expect(gpu.length).toBeGreaterThan(0);
    expect(cellsOf(scene, SOURCE_CPU)).toHaveLength(0);
    const c = centerMm(scene, gpu[0]);
    expect(c[0]).toBeGreaterThan(gpuBox.min[0] - 4 * scene.cellMm);
    expect(c[0]).toBeLessThan(gpuBox.min[0] + gpuBox.size[0] + 4 * scene.cellMm);
  });

  const cooler = { slot: 'cooler', role: 'part', min: [330, 200, 150], size: [100, 120, 120] };
  const rad = slotSpec('top:360:0', 'top', 'radiator', [100, 388, 60], [360, 52, 120], [0, -1, 0]);
  const fans = (cfm: number) => ({ 'top:360:0': cfm, 'top:360:0#1': cfm, 'top:360:0#2': cfm });

  it('puts an AIO\'s CPU heat at the radiator, not at the CPU block', () => {
    const input = inputFor([rad], [cooler], () => 'exhaust');
    input.fanCfm = fans(50);
    const s = buildFlowScene(input, LOW);
    const heat = cellsOf(s, SOURCE_CPU);
    expect(heat.length).toBeGreaterThan(0);
    const radBox = { slot: 'radiator', role: 'part', min: rad.min, size: rad.size } as never;
    for (const c of heat) expect(boxContains(radBox, centerMm(s, c), s.cellMm)).toBe(true);
    const [NX, NY] = s.dims;
    const at = (mm: number[]) => Math.floor((mm[0] + s.origin[0]) / s.cellMm) + NX * (Math.floor((mm[1] + s.origin[1]) / s.cellMm) + NY * Math.floor((mm[2] + s.origin[2]) / s.cellMm));
    expect(s.darcy[at([380, 260, 210])]).toBeGreaterThan(0);
    expect(s.heat[at([380, 260, 210])]).toBe(SOURCE_NONE);
  });

  it('puts an air cooler\'s CPU heat at the cooler itself', () => {
    const s = buildFlowScene(inputFor(nineFans, [cooler], defaultDir), LOW);
    const heat = cellsOf(s, SOURCE_CPU);
    expect(heat.length).toBeGreaterThan(0);
    for (const c of heat) expect(boxContains(cooler as never, centerMm(s, c), s.cellMm)).toBe(true);
  });
});

describe('the heat model', () => {
  const scene = buildFlowScene(caseWithGpuAndShroud(), LOW);
  const gpuCells = cellsOf(scene, SOURCE_GPU);
  const coldCells = (() => { const out: number[] = []; for (let c = 0; c < scene.heat.length && out.length < 50; c++) if (!scene.solid[c] && scene.heat[c] === SOURCE_NONE) out.push(c); return out; })();

  it('warms air that crosses the GPU and leaves air that misses it at ambient', () => {
    expect(crossing(gpuCells, scene, { gpu: 80, cpu: null })).toBeGreaterThan(5);
    expect(ROOM_TEMP_C + crossing(gpuCells, scene, { gpu: 80, cpu: null })).toBeLessThan(80);
    expect(crossing(coldCells, scene, { gpu: 80, cpu: null })).toBe(0);
  });

  it('raises air more for a hotter part, never past the part, and stops heating once the air matches it', () => {
    const at50 = crossing(gpuCells, scene, { gpu: 50, cpu: null });
    const at80 = crossing(gpuCells, scene, { gpu: 80, cpu: null });
    expect(at80).toBeGreaterThan(at50);
    expect(at80).toBeLessThan(80 - ROOM_TEMP_C);
    expect(crossing(gpuCells, scene, { gpu: 80, cpu: null }, 5000)).toBeLessThanOrEqual(80 - ROOM_TEMP_C);
    expect(heatStep(30, 30, SPEED)).toBe(30);
  });

  it('ignores a missing sensor', () => {
    expect(crossing(gpuCells, scene, { gpu: null, cpu: 80 })).toBe(0);
    expect(sourceRises({ gpu: Number.NaN, cpu: null })[SOURCE_GPU]).toBeLessThan(0);
  });
});

describe('particles with live temperatures', () => {
  const scene = buildFlowScene(caseWithGpuAndShroud(), LOW);
  const settled = () => { const f = new CpuFlow(scene); for (let i = 0; i < 150; i++) f.step(); return f; };
  const run = (gpu: number | null, steps = 300) => {
    const f = settled();
    f.setTemps({ gpu, cpu: null });
    for (let s = 0; s < steps; s++) f.step();
    const p = new CpuParticles(f, 300, 5);
    for (let s = 0; s < 600; s++) { p.step(); f.step(); }
    return p;
  };

  it('ends warmer past a hot GPU than the same flow with no reading, and warmer still for a hotter GPU', () => {
    const mean = (p: CpuParticles) => p.heat.reduce((a, b) => a + b, 0) / p.count;
    const none = run(null), mild = run(50), hot = run(80);
    expect(mean(none)).toBe(0);
    expect(mean(mild)).toBeGreaterThan(0);
    expect(mean(hot)).toBeGreaterThan(mean(mild));
    for (let i = 0; i < hot.count; i++) expect(hot.tempC(i)).toBeLessThan(80);
  }, 600000);

  it('keeps the same particles and positions through a temperature change', () => {
    const f = settled();
    const p = new CpuParticles(f, 100, 3);
    for (let s = 0; s < 50; s++) p.step();
    const pos = Float32Array.from(p.pos);
    const [heat, posRef] = [p.heat, p.pos];
    const [t, u] = [f.t, f.u];
    p.setTemps({ gpu: 60, cpu: 40 });
    p.setTemps({ gpu: 61, cpu: 41 });
    expect(p.heat).toBe(heat);
    expect(p.pos).toBe(posRef);
    expect(Array.from(p.pos)).toEqual(Array.from(pos));
    expect(f.t).toBe(t);
    expect(f.u).toBe(u);
  }, 60000);

  it('reads each particle\'s temperature off the solver field at its position', () => {
    const f = settled();
    f.setTemps({ gpu: 70, cpu: null });
    for (let s = 0; s < 300; s++) f.step();
    const p = new CpuParticles(f, 200, 9);
    for (let s = 0; s < 400; s++) { p.step(); f.step(); }
    p.step();
    let checked = 0;
    for (let i = 0; i < p.count; i++) {
      if (p.pos[i * 3] < -1e5 || p.age[i] <= 0) continue;
      checked++;
      expect(p.heat[i]).toBeCloseTo(f.riseAt(p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]), 4);
    }
    expect(checked).toBeGreaterThan(50);
  }, 120000);
});

describe('heat label anchors', () => {
  it('puts the GPU on its card and the CPU on its cooler, else its radiator', () => {
    const cooler = { slot: 'cooler', role: 'part', min: [330, 200, 150], size: [100, 120, 120] };
    const withCooler = heatAnchors(inputFor(nineFans, [gpuBox, cooler], defaultDir).layout);
    expect(withCooler.find(a => a.key === 'gpu')?.at).toEqual([270, 140, 160]);
    expect(withCooler.find(a => a.key === 'cpu')?.at).toEqual([380, 260, 210]);
    const rad = slotSpec('top:360:0', 'top', 'radiator', [100, 388, 60], [360, 52, 120], [0, -1, 0]);
    const onlyRad = heatAnchors(inputFor([rad], [], () => 'exhaust').layout);
    expect(onlyRad.map(a => a.key)).toEqual(['cpu']);
    expect(heatAnchors(inputFor(nineFans, [], defaultDir).layout)).toEqual([]);
  });
});
