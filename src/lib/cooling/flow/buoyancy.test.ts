// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CpuFlow } from './cpuSolver';
import { CpuParticles } from './cpuParticles';
import { BUOYANCY, ROOM_TEMP_C, VMAX_CELLS } from './flowParams';
import { defaultDir, gpuBox, inputFor, nineFans, shroudBox } from './flowFixtures';
import { SOURCE_GPU, SOURCE_ROOM, buildFlowScene, sampleSpawn, type FlowScene } from './gridScene';

const LOW = 32 * 24 * 48;
const GPU_C = 75;
const RISE = GPU_C - ROOM_TEMP_C;

const sceneAt = (cfm: number) => buildFlowScene(inputFor(nineFans, [gpuBox, shroudBox], defaultDir, cfm), LOW);
const run = (flow: CpuFlow, steps: number) => { for (let i = 0; i < steps; i++) flow.step(); };
const coords = (s: FlowScene, c: number): [number, number, number] => [c % s.dims[0], Math.floor(c / s.dims[0]) % s.dims[1], Math.floor(c / (s.dims[0] * s.dims[1]))];

/** Mean temperature rise over the case interior in the top and bottom quarter of its height. */
function topAndBottom(flow: CpuFlow): { top: number; bottom: number } {
  const s = flow.scene;
  let top = 0, topN = 0, bottom = 0, bottomN = 0;
  for (let c = 0; c < flow.n; c++) {
    if (s.solid[c]) continue;
    const [i, j, k] = coords(s, c);
    if (i <= s.caseMin[0] || i >= s.caseMax[0] || k <= s.caseMin[2] || k >= s.caseMax[2] || j < s.caseMin[1] || j > s.caseMax[1]) continue;
    const q = (j - s.caseMin[1]) / (s.caseMax[1] - s.caseMin[1]);
    if (q > 0.75) { top += flow.t[c]; topN++; } else if (q < 0.25) { bottom += flow.t[c]; bottomN++; }
  }
  return { top: top / topN, bottom: bottom / bottomN };
}

describe('room temperature', () => {
  it('is 22 C, and the buoyancy coefficient is small enough that a fan stream dominates', () => {
    expect(ROOM_TEMP_C).toBe(22);
    expect(BUOYANCY * RISE * 100).toBeLessThan(VMAX_CELLS);
  });

  it('holds an intake fan\'s cells and the outside air in front of it at room temperature, however hot the case', { timeout: 60000 }, () => {
    const scene = sceneAt(60);
    const flow = new CpuFlow(scene);
    flow.setTemps({ gpu: 85, cpu: 85 });
    run(flow, 300);
    const room: number[] = [];
    for (let c = 0; c < flow.n; c++) if (scene.heat[c] === SOURCE_ROOM) room.push(c);
    expect(room.length).toBeGreaterThan(0);
    for (const c of room) expect(flow.t[c]).toBe(0);
    let hot = 0;
    for (let c = 0; c < flow.n; c++) if (flow.t[c] > 1) hot++;
    expect(hot, 'the GPU still warms the air').toBeGreaterThan(0);
  });

  it('starts every intake particle at 22 C: the spawn points read room temperature off the grid', { timeout: 60000 }, () => {
    const scene = sceneAt(60);
    const flow = new CpuFlow(scene);
    flow.setTemps({ gpu: 85, cpu: 85 });
    run(flow, 300);
    let seed = 5;
    const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    let seen = 0;
    for (let n = 0; n < 400; n++) {
      const q = sampleSpawn(scene, rnd);
      if (!q) continue;
      seen++;
      expect(ROOM_TEMP_C + flow.riseAt(q[0], q[1], q[2])).toBeCloseTo(22, 3);
    }
    expect(seen).toBeGreaterThan(100);
  });
});

describe('buoyancy', () => {
  it('adds no force when the air is at room temperature everywhere: a still case stays still, and a fanned one is unchanged', { timeout: 60000 }, () => {
    const still = new CpuFlow(sceneAt(0));
    still.setTemps({ gpu: ROOM_TEMP_C, cpu: ROOM_TEMP_C });
    run(still, 150);
    expect(still.u.every(v => v === 0)).toBe(true);
    expect(still.t.every(v => v === 0)).toBe(true);
    const a = new CpuFlow(sceneAt(60));
    const b = new CpuFlow(sceneAt(60));
    b.setTemps({ gpu: ROOM_TEMP_C, cpu: ROOM_TEMP_C });
    run(a, 120);
    run(b, 120);
    expect(Array.from(b.u)).toEqual(Array.from(a.u));
  });

  it('lets cool air sink and warm air rise by the same law', () => {
    for (const sign of [1, -1]) {
      const flow = new CpuFlow(sceneAt(0));
      const s = flow.scene;
      const pocket: number[] = [];
      for (let c = 0; c < flow.n; c++) {
        const [i, j, k] = coords(s, c);
        if (s.solid[c] || s.open[c] || i < s.caseMin[0] + 8 || i > s.caseMax[0] - 8 || k < s.caseMin[2] + 8 || k > s.caseMax[2] - 8 || j < s.caseMin[1] + 6 || j > s.caseMax[1] - 6) continue;
        flow.t[c] = sign * 20;
        pocket.push(c);
      }
      expect(pocket.length).toBeGreaterThan(50);
      run(flow, 20);
      const mean = pocket.reduce((sum, c) => sum + flow.u[c * 3 + 1], 0) / pocket.length;
      expect(Math.sign(mean), `a pocket ${sign * 20} K from room`).toBe(sign);
    }
  }, 60000);

  it('makes a hot GPU with every fan stopped a gentle rising plume, not a frozen field', () => {
    const scene = sceneAt(0);
    expect(scene.fanCount).toBe(0);
    const flow = new CpuFlow(scene);
    flow.setTemps({ gpu: GPU_C, cpu: null });
    run(flow, 600);
    const heatJ: number[] = [];
    for (let c = 0; c < flow.n; c++) if (scene.heat[c] === SOURCE_GPU && !scene.solid[c]) heatJ.push(coords(scene, c)[1]);
    const heatMean = heatJ.reduce((a, b) => a + b, 0) / heatJ.length;
    let warm = 0, vy = 0, weight = 0, weighted = 0, peak = 0;
    for (let c = 0; c < flow.n; c++) {
      if (scene.solid[c]) continue;
      peak = Math.max(peak, Math.hypot(flow.u[c * 3], flow.u[c * 3 + 1], flow.u[c * 3 + 2]));
      const t = flow.t[c];
      if (t <= 1) continue;
      warm++;
      vy += flow.u[c * 3 + 1];
      weight += t;
      weighted += t * coords(scene, c)[1];
    }
    expect(warm).toBeGreaterThan(200);
    expect(vy / warm, 'warm air moves up on average').toBeGreaterThan(0.005);
    expect(weighted / weight, 'the warmth sits well above the part').toBeGreaterThan(heatMean + 4);
    expect(peak).toBeGreaterThan(0.03);
    expect(peak, 'gentle: far under the velocity cap').toBeLessThan(VMAX_CELLS * 0.3);
    let max = 0;
    for (const v of flow.t) max = Math.max(max, v);
    expect(max, 'the air never passes the part').toBeLessThanOrEqual(RISE + 1e-3);
  }, 120000);

  it('pools hot air at the top of a closed case with slow fans', () => {
    const flow = new CpuFlow(sceneAt(5));
    flow.setTemps({ gpu: GPU_C, cpu: null });
    run(flow, 800);
    const { top, bottom } = topAndBottom(flow);
    expect(top).toBeGreaterThan(8);
    expect(top).toBeGreaterThan(3 * bottom);
  }, 120000);

  it('leaves a running fan\'s stream in charge: hot or cold, the peak speed barely moves', () => {
    const cold = new CpuFlow(sceneAt(60));
    const hot = new CpuFlow(sceneAt(60));
    hot.setTemps({ gpu: GPU_C, cpu: null });
    run(cold, 300);
    run(hot, 300);
    expect(Math.abs(hot.maxSpeed() - cold.maxSpeed()) / cold.maxSpeed()).toBeLessThan(0.05);
    expect(hot.maxSpeed()).toBeLessThan(VMAX_CELLS * 0.9);
  }, 120000);

  it('keeps the temperature field through a warm scene update, except in cells that became solid', () => {
    const flow = new CpuFlow(sceneAt(60));
    flow.setTemps({ gpu: GPU_C, cpu: null });
    run(flow, 200);
    const before = Float32Array.from(flow.t);
    const edited = sceneAt(30);
    flow.setScene(edited);
    expect(before.some(v => v > 1)).toBe(true);
    for (let c = 0; c < flow.n; c++) expect(flow.t[c]).toBe(edited.solid[c] ? 0 : before[c]);
  }, 120000);
});

describe('plume particles', () => {
  it('start at a hot part with every fan stopped, rise, and read warm; none start while the parts are at room temperature', () => {
    const scene = sceneAt(0);
    expect(scene.emitters.length).toBe(0);
    expect(scene.plumeEmitters.length).toBeGreaterThan(0);
    const cold = new CpuFlow(scene);
    const none = new CpuParticles(cold, 200, 3);
    for (let s = 0; s < 100; s++) { cold.step(); none.step(); }
    let alive = 0;
    for (let i = 0; i < none.count; i++) if (none.pos[i * 3] > -1e5) alive++;
    expect(alive).toBe(0);

    const flow = new CpuFlow(scene);
    flow.setTemps({ gpu: GPU_C, cpu: null });
    const hot = new CpuParticles(flow, 200, 3);
    let warm = 0, up = 0, seen = 0;
    for (let s = 0; s < 900; s++) {
      const y0 = Float32Array.from({ length: hot.count }, (_, i) => hot.pos[i * 3 + 1]);
      flow.step();
      hot.step();
      if (s < 600) continue;
      for (let i = 0; i < hot.count; i++) {
        if (hot.pos[i * 3] < -1e5 || hot.age[i] <= 1) continue;
        seen++;
        if (hot.heat[i] > 5) warm++;
        if (hot.pos[i * 3 + 1] > y0[i]) up++;
        expect(scene.solid[hot.cellAt(hot.pos[i * 3], hot.pos[i * 3 + 1], hot.pos[i * 3 + 2])]).toBe(0);
      }
    }
    expect(seen).toBeGreaterThan(500);
    expect(warm / seen).toBeGreaterThan(0.1);
    expect(up / seen).toBeGreaterThan(0.5);
  }, 240000);
});
