// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CpuFlow } from './cpuSolver';
import { CpuParticles } from './cpuParticles';
import { VMAX_CELLS } from './flowParams';
import { OPENING_EXHAUST, OPENING_INTAKE, OPENING_VENT, buildFlowScene, gridFor, isSolidAt, surfaceSolids, type FlowScene } from './gridScene';
import { caseWithGpuAndShroud, defaultDir, fronts, gpuBox, inputFor, nineFans, slotSpec, tops } from './flowFixtures';

const LOW = 32 * 24 * 48;
const idx = (s: FlowScene, i: number, j: number, k: number) => i + s.dims[0] * (j + s.dims[1] * k);

describe('gridFor', () => {
  it('keeps the aspect near the target count and clamps each axis', () => {
    const { dims } = gridFor([480, 440, 360], 64 * 48 * 96);
    expect(dims[0] * dims[1] * dims[2]).toBeGreaterThan(64 * 48 * 96 * 0.8);
    expect(dims[0] * dims[1] * dims[2]).toBeLessThan(64 * 48 * 96 * 1.3);
    const thin = gridFor([2000, 10, 10], 1000).dims;
    expect(Math.min(...thin)).toBeGreaterThanOrEqual(8);
    expect(Math.max(...thin)).toBeLessThanOrEqual(128);
  });
});

describe('buildFlowScene', () => {
  const scene = buildFlowScene(caseWithGpuAndShroud(), LOW);

  it('extends the domain past the case on the sides with mounts and closes the shell', () => {
    const [NX, NY, NZ] = scene.dims;
    expect(scene.caseMin[0]).toBeGreaterThan(0);
    expect(NX).toBeGreaterThan(scene.caseMax[0] - scene.caseMin[0] + 1);
    expect(scene.solid[idx(scene, scene.caseMin[0], scene.caseMin[1] + 1, scene.caseMin[2] + 1)]).toBe(1);
    expect(scene.solid[idx(scene, scene.caseMax[0], scene.caseMin[1] + 1, scene.caseMin[2] + 1)]).toBe(1);
    expect(isSolidAt(scene, [240, 300, 180])).toBe(false);
    expect(scene.open[idx(scene, 0, NY >> 1, NZ >> 1)]).toBe(1);
    expect(scene.cellMm).toBeGreaterThan(0);
  });

  it('opens the shell only at fan mounts and marks intake and exhaust', () => {
    let intake = 0, exhaust = 0, shellFluid = 0;
    const [NX, NY, NZ] = scene.dims;
    for (let k = scene.caseMin[2]; k <= scene.caseMax[2]; k++) for (let j = scene.caseMin[1]; j <= scene.caseMax[1]; j++) for (let i = scene.caseMin[0]; i <= scene.caseMax[0]; i++) {
      const shell = i === scene.caseMin[0] || i === scene.caseMax[0] || j === scene.caseMin[1] || j === scene.caseMax[1] || k === scene.caseMin[2] || k === scene.caseMax[2];
      if (!shell) continue;
      const c = idx(scene, i, j, k);
      if (scene.solid[c]) { expect(scene.opening[c]).toBe(0); continue; }
      shellFluid++;
      if (scene.opening[c] === OPENING_INTAKE) intake++;
      if (scene.opening[c] === OPENING_EXHAUST) exhaust++;
    }
    void NX; void NY; void NZ;
    expect(intake).toBeGreaterThan(0);
    expect(exhaust).toBeGreaterThan(0);
    expect(shellFluid).toBe(intake + exhaust);
  });

  it('spawns intake particles outside the case, in open cells in front of intake fans', () => {
    expect(scene.spawns.length / 3).toBeGreaterThan(50);
    let outside = 0;
    for (let m = 0; m < scene.spawns.length / 3; m++) {
      const [x, y, z] = [scene.spawns[m * 3], scene.spawns[m * 3 + 1], scene.spawns[m * 3 + 2]];
      const i = Math.floor(x + 0.5), j = Math.floor(y + 0.5), k = Math.floor(z + 0.5);
      expect(scene.solid[idx(scene, i, j, k)]).toBe(0);
      if (i < scene.caseMin[0] || i > scene.caseMax[0] || j < scene.caseMin[1] || j > scene.caseMax[1] || k < scene.caseMin[2] || k > scene.caseMax[2]) outside++;
    }
    expect(outside).toBeGreaterThan(0);
  });

  it('flips a fan target with its direction and spawns only for intake', () => {
    const a = buildFlowScene(inputFor([fronts[0]], [], () => 'intake'), LOW);
    const b = buildFlowScene(inputFor([fronts[0]], [], () => 'exhaust'), LOW);
    const sum = (s: FlowScene) => s.target.reduce((acc, v, i) => (i % 3 === 0 ? acc + v : acc), 0);
    expect(sum(a)).toBeGreaterThan(0);
    expect(sum(b)).toBeCloseTo(-sum(a), 6);
    expect(a.spawns.length).toBeGreaterThan(0);
    expect(b.spawns.length).toBe(0);
    expect(a.maxTargetCells).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it('sizes the mean-age scale from the case volume and the intake flow, and has none without intake', () => {
    expect(scene.residenceSteps).toBeGreaterThan(20);
    expect(buildFlowScene(inputFor([fronts[0]], [], () => 'exhaust'), LOW).residenceSteps).toBe(0);
  });

  it('treats empty slots as vents and spawns there only while air is drawn in', () => {
    const empty = [slotSpec('top:120:0', 'top', null, [120, 415, 120], [120, 25, 120], [0, -1, 0])];
    const base = inputFor(empty, [], () => 'intake');
    const closed = buildFlowScene({ ...base, ventCfm: 10 }, LOW);
    expect(closed.opening.some(v => v === OPENING_VENT)).toBe(true);
    expect(closed.spawns.length).toBe(0);
    expect(buildFlowScene({ ...base, ventCfm: -40 }, LOW).spawns.length).toBeGreaterThan(0);
  });

  it('adds the fans of a radiator slot, with porous cells and heat', () => {
    const rad = slotSpec('top:360:0', 'top', 'radiator', [100, 388, 60], [360, 52, 120], [0, -1, 0]);
    const input = inputFor([rad], [], () => 'exhaust');
    input.fanCfm = { 'top:360:0': 50, 'top:360:0#1': 50, 'top:360:0#2': 50 };
    const s = buildFlowScene(input, LOW);
    expect(s.fanCount).toBe(3);
    expect(s.darcy.some(v => v > 0)).toBe(true);
    expect(s.heat.some(v => v > 0)).toBe(true);
  });

  it('marks heat next to the GPU and treats an older record with no slot geometry as obstacles only', () => {
    expect(scene.heat.some(v => v > 0)).toBe(true);
    const noGeom = buildFlowScene({ layout: { ...caseWithGpuAndShroud().layout, fanSlots: [{ key: 'a', position: 'front', size: 120, index: 0, taken: 'fan' }] }, directions: {}, fanCfm: { a: 60 }, ventCfm: 0 }, LOW);
    expect(noGeom.fanCount).toBe(0);
  });

  it('voxelizes the GPU and the shroud as solid parts', () => {
    expect(isSolidAt(scene, [270, 140, 160])).toBe(true);
    expect(isSolidAt(scene, [180, 65, 180])).toBe(true);
    expect(isSolidAt(scene, [240, 300, 160])).toBe(false);
    expect(surfaceSolids(scene).length).toBeGreaterThan(300);
  });
});

function settle(scene: FlowScene, steps: number): CpuFlow {
  const sim = new CpuFlow(scene);
  for (let i = 0; i < steps; i++) sim.step();
  return sim;
}

describe('CpuFlow boundaries', () => {
  const scene = buildFlowScene(caseWithGpuAndShroud(), LOW);
  const sim = settle(scene, 250);

  it('keeps solid cells at rest and lets nothing move into a solid neighbour', () => {
    const [NX, NY, NZ] = scene.dims;
    const sx = 1, sy = NX, sz = NX * NY;
    let into = 0; let solidMoving = 0; let faces = 0;
    for (let k = 1; k < NZ - 1; k++) for (let j = 1; j < NY - 1; j++) for (let i = 1; i < NX - 1; i++) {
      const c = i + NX * (j + NY * k);
      const ux = sim.u[c * 3], uy = sim.u[c * 3 + 1], uz = sim.u[c * 3 + 2];
      if (scene.solid[c]) { if (Math.hypot(ux, uy, uz) > 0) solidMoving++; continue; }
      const check = (nb: number, comp: number) => { if (scene.solid[nb]) { faces++; if (comp > 1e-9) into += comp; } };
      check(c + sx, ux); check(c - sx, -ux); check(c + sy, uy); check(c - sy, -uy); check(c + sz, uz); check(c - sz, -uz);
    }
    expect(faces).toBeGreaterThan(1000);
    expect(solidMoving).toBe(0);
    expect(into).toBe(0);
  });

  it('moves the air: fans drive a through-flow while staying bounded', () => {
    expect(sim.maxSpeed()).toBeGreaterThan(0.05);
    expect(sim.maxSpeed()).toBeLessThanOrEqual(VMAX_CELLS + 1e-6);
  });
});

describe('a fan blowing straight at the GPU', () => {
  const slot = slotSpec('front:120:0', 'front', 'fan', [0, 120, 120], [25, 120, 120], [1, 0, 0]);
  const wall = { slot: 'gpu', role: 'part', min: [150, 130, 100], size: [60, 100, 160] };
  const vent = slotSpec('rear:120:0', 'rear', null, [455, 120, 120], [25, 120, 120], [-1, 0, 0]);
  const scene = buildFlowScene(inputFor([slot, vent], [wall], () => 'intake', 90), LOW);
  const sim = settle(scene, 300);
  const cell = (xmm: number, ymm: number, zmm: number) => {
    const i = Math.floor((xmm + scene.origin[0]) / scene.cellMm), j = Math.floor((ymm + scene.origin[1]) / scene.cellMm), k = Math.floor((zmm + scene.origin[2]) / scene.cellMm);
    return idx(scene, i, j, k);
  };

  it('goes around the GPU: nothing into its face, an outward spread before it, a slow shadow behind it', () => {
    const [NX, NY] = scene.dims;
    const gi = (xmm: number) => Math.floor((xmm + scene.origin[0]) / scene.cellMm);
    const ci = gi(150) - 2;
    const yc = (120 + 240) / 2 + scene.origin[1] / 1;
    void yc;
    let spread = 0; let into = 0;
    for (let k = 1; k < scene.dims[2] - 1; k++) for (let j = 1; j < NY - 1; j++) {
      const c = ci + NX * (j + NY * k);
      if (scene.solid[c]) continue;
      const y = (j + 0.5) * scene.cellMm - scene.origin[1] - 180;
      const z = (k + 0.5) * scene.cellMm - scene.origin[2] - 180;
      spread += y * sim.u[c * 3 + 1] + z * sim.u[c * 3 + 2];
      if (scene.solid[c + 1] && sim.u[c * 3] > 0) into += sim.u[c * 3];
    }
    expect(into).toBe(0);
    expect(spread).toBeGreaterThan(0);
    const axial = (x: number, y: number, z: number) => sim.u[cell(x, y, z) * 3];
    const ring = (axial(260, 180, 90) + axial(260, 180, 270) + axial(260, 270, 180) + axial(260, 90, 180)) / 4;
    expect(axial(260, 180, 180)).toBeLessThan(ring);
    expect(scene.solid[cell(180, 180, 180)]).toBe(1);
  });
});

describe('CpuParticles', () => {
  const scene = buildFlowScene(caseWithGpuAndShroud(), LOW);
  const sim = settle(scene, 250);

  it('over 5000 steps never ends inside a solid cell and only crosses the shell at openings', () => {
    const particles = new CpuParticles(sim, 400, 7);
    const [NX, NY] = scene.dims;
    const shell = (c: number) => {
      const i = c % NX, j = Math.floor(c / NX) % NY, k = Math.floor(c / (NX * NY));
      return i >= scene.caseMin[0] && i <= scene.caseMax[0] && j >= scene.caseMin[1] && j <= scene.caseMax[1] && k >= scene.caseMin[2] && k <= scene.caseMax[2]
        && (i === scene.caseMin[0] || i === scene.caseMax[0] || j === scene.caseMin[1] || j === scene.caseMax[1] || k === scene.caseMin[2] || k === scene.caseMax[2]);
    };
    const inside = (c: number) => {
      const i = c % NX, j = Math.floor(c / NX) % NY, k = Math.floor(c / (NX * NY));
      return i > scene.caseMin[0] && i < scene.caseMax[0] && j > scene.caseMin[1] && j < scene.caseMax[1] && k > scene.caseMin[2] && k < scene.caseMax[2];
    };
    let inSolid = 0; let exits = 0; let badExit = 0; let wallCrossings = 0; let entries = 0;
    for (let s = 0; s < 5000; s++) {
      particles.step((_i, from, to) => {
        if (to < 0) return;
        if (scene.solid[to]) wallCrossings++;
        if (inside(from) && shell(to)) { exits++; if (scene.opening[to] !== OPENING_EXHAUST && scene.opening[to] !== OPENING_VENT) badExit++; }
        if (!shell(from) && !inside(from) && shell(to)) { entries++; if (scene.opening[to] === 0) wallCrossings++; }
      });
      if (s % 50 === 0 || s === 4999) {
        for (let i = 0; i < particles.count; i++) {
          const c = particles.cellAt(particles.pos[i * 3], particles.pos[i * 3 + 1], particles.pos[i * 3 + 2]);
          if (c >= 0 && scene.solid[c]) inSolid++;
        }
      }
    }
    expect(inSolid).toBe(0);
    expect(wallCrossings).toBe(0);
    expect(entries).toBeGreaterThan(0);
    expect(exits).toBeGreaterThan(0);
    expect(badExit).toBe(0);
  });

  it('warms air that passes the heat sources: some particles leave warmer than they came', () => {
    const particles = new CpuParticles(sim, 400, 11);
    for (let s = 0; s < 1500; s++) particles.step();
    let warm = 0; let cool = 0;
    for (let i = 0; i < particles.count; i++) { if (particles.heat[i] > 0.1) warm++; if (particles.heat[i] === 0) cool++; }
    expect(warm).toBeGreaterThan(0);
    expect(cool).toBeGreaterThan(0);
  });
});

const kinetic = (sim: CpuFlow) => {
  let e = 0;
  for (let c = 0; c < sim.n; c++) e += sim.u[c * 3] ** 2 + sim.u[c * 3 + 1] ** 2 + sim.u[c * 3 + 2] ** 2;
  return e;
};

describe('stability', () => {
  it('settles: kinetic energy stops changing over the last 100 steps and the velocity cap is never reached', () => {
    const scene = buildFlowScene(caseWithGpuAndShroud(), LOW);
    expect(scene.fanCount).toBe(nineFans.length);
    const sim = new CpuFlow(scene);
    let peak = 0;
    let before = 0;
    for (let i = 1; i <= 1500; i++) {
      sim.step();
      if (i % 25 === 0) peak = Math.max(peak, sim.maxSpeed());
      if (i === 1400) before = kinetic(sim);
    }
    const after = kinetic(sim);
    expect(Number.isFinite(after)).toBe(true);
    expect(after).toBeGreaterThan(0);
    expect(Math.abs(after - before) / after).toBeLessThan(0.02);
    expect(peak).toBeLessThan(VMAX_CELLS * 0.9);
  }, 180000);

  it('stays finite at the largest grid with nine fans, with the velocity cap not reached', () => {
    const scene = buildFlowScene(caseWithGpuAndShroud());
    expect(scene.dims[0] * scene.dims[1] * scene.dims[2]).toBeGreaterThan(250000);
    const steps = process.env.FLOW_FULL === '1' ? 2000 : 150;
    const sim = new CpuFlow(scene);
    let peak = 0;
    for (let i = 1; i <= steps; i++) { sim.step(); if (i % 25 === 0) peak = Math.max(peak, sim.maxSpeed()); }
    expect(Number.isFinite(peak)).toBe(true);
    expect(peak).toBeGreaterThan(0);
    expect(peak).toBeLessThan(VMAX_CELLS * 0.9);
  }, 900000);
});

void defaultDir; void tops; void gpuBox;

describe('the first particles', () => {
  const scene = buildFlowScene(caseWithGpuAndShroud(), 64 * 48 * 96);
  const sim = new CpuFlow(scene, 1);

  it('start far denser than the spawn points can show: the pool sits on a few hundred cells, tens per cell', () => {
    const cells = new Map<number, number>();
    const p = new CpuParticles(sim, 128 * 84, 5);
    for (let i = 0; i < p.count; i++) {
      const c = p.cellAt(p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]);
      cells.set(c, (cells.get(c) ?? 0) + 1);
    }
    expect(p.count / cells.size).toBeGreaterThan(10);
  });

  it('are born over time, so none is visible at the start and the pool never appears as one stacked puff', () => {
    const p = new CpuParticles(sim, 128 * 84, 5);
    const visible = () => { let n = 0; for (let i = 0; i < p.count; i++) if (p.age[i] >= 0) n++; return n; };
    expect(visible()).toBe(0);
    for (let s = 0; s < 40; s++) p.step();
    expect(visible()).toBeLessThan(p.count * 0.2);
    for (let s = 0; s < 300; s++) p.step();
    expect(visible()).toBeGreaterThan(p.count * 0.95);
  });
});
