// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CpuFlow } from './cpuSolver';
import { CpuParticles } from './cpuParticles';
import { MAX_SUBSTEP_CELLS, PARTICLE_SPEED_MAX, PARTICLE_SPEED_MIN, VMAX_CELLS, substepsFor } from './flowParams';
import { OPENING_EXHAUST, OPENING_INTAKE, OPENING_VENT, buildFlowScene, gridFor, isSolidAt, type FlowScene } from './gridScene';
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

  it('spawns intake particles on the fan plane inside the case box, in open cells', () => {
    expect(scene.spawns.length / 3).toBeGreaterThan(50);
    let outside = 0;
    for (let m = 0; m < scene.spawns.length / 3; m++) {
      const [x, y, z] = [scene.spawns[m * 3], scene.spawns[m * 3 + 1], scene.spawns[m * 3 + 2]];
      const i = Math.floor(x + 0.5), j = Math.floor(y + 0.5), k = Math.floor(z + 0.5);
      expect(scene.solid[idx(scene, i, j, k)]).toBe(0);
      if (i < scene.caseMin[0] || i > scene.caseMax[0] || j < scene.caseMin[1] || j > scene.caseMax[1] || k < scene.caseMin[2] || k > scene.caseMax[2]) outside++;
    }
    expect(outside).toBe(0);
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

  it('over 1200 steps never ends inside a solid cell and only crosses the shell at openings', () => {
    const particles = new CpuParticles(sim, 150, 7);
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
    for (let s = 0; s < 1200; s++) {
      particles.step((_i, from, to) => {
        if (to < 0) return;
        if (scene.solid[to]) wallCrossings++;
        if (inside(from) && shell(to)) { exits++; if (scene.opening[to] !== OPENING_EXHAUST && scene.opening[to] !== OPENING_VENT) badExit++; }
        if (!shell(from) && !inside(from) && shell(to)) { entries++; if (scene.opening[to] === 0) wallCrossings++; }
      });
      if (s % 50 === 0 || s === 1199) {
        for (let i = 0; i < particles.count; i++) {
          const c = particles.cellAt(particles.pos[i * 3], particles.pos[i * 3 + 1], particles.pos[i * 3 + 2]);
          if (c >= 0 && scene.solid[c]) inSolid++;
        }
      }
    }
    expect(inSolid).toBe(0);
    expect(wallCrossings).toBe(0);
    // Intake particles start inside the case, so none arrives from outside.
    expect(entries).toBe(0);
    expect(exits).toBeGreaterThan(0);
    expect(badExit).toBe(0);
  }, 120000);

  it('warms air that passes the heat sources: some particles leave warmer than they came', () => {
    const particles = new CpuParticles(sim, 150, 11);
    for (let s = 0; s < 800; s++) particles.step();
    let warm = 0; let cool = 0;
    for (let i = 0; i < particles.count; i++) { if (particles.heat[i] > 0.1) warm++; if (particles.heat[i] === 0) cool++; }
    expect(warm).toBeGreaterThan(0);
    expect(cool).toBeGreaterThan(0);
  }, 60000);
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

  it('start spread over continuous positions, a few per cell at most, not tens stacked on a fixed point set', () => {
    const cells = new Map<number, number>();
    const p = new CpuParticles(sim, 128 * 84, 5);
    for (let i = 0; i < p.count; i++) {
      const c = p.cellAt(p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]);
      cells.set(c, (cells.get(c) ?? 0) + 1);
    }
    expect(p.count / cells.size).toBeLessThan(20);
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

describe('a steady stream of particles', () => {
  const scene = buildFlowScene(caseWithGpuAndShroud(), LOW);
  const sim = new CpuFlow(scene);
  for (let i = 0; i < 200; i++) sim.step();
  const WINDOW = 50;
  const FRAME_STEPS = 2;

  const respawnsPerWindow = (jitter: boolean, steps: number) => {
    const p = new CpuParticles(sim, 4000, 3, jitter);
    const win: number[] = [];
    let last = p.respawns;
    for (let s = 1; s <= steps; s++) { p.step(); if (s % WINDOW === 0) { win.push(p.respawns - last); last = p.respawns; } }
    return win;
  };
  const cv = (a: number[]) => { const m = a.reduce((x, y) => x + y, 0) / a.length; return Math.sqrt(a.reduce((x, y) => x + (y - m) ** 2, 0) / a.length) / m; };

  it('recycles evenly with per-particle lifetimes, no worse than with one shared lifetime', () => {
    const fixed = respawnsPerWindow(false, 3600).slice(20);
    const jittered = respawnsPerWindow(true, 3600).slice(20);
    expect(Math.max(...jittered) / Math.min(...jittered)).toBeLessThan(1.8);
    expect(cv(jittered)).toBeLessThanOrEqual(cv(fixed) * 1.5);
  }, 120000);

  it('keeps the live count and the mean speed in a tight band and moves on every frame, with no solver step between frames', () => {
    const p = new CpuParticles(sim, 4000, 9);
    for (let f = 0; f < 600; f++) for (let s = 0; s < FRAME_STEPS; s++) p.step();
    const live: number[] = [];
    const moved: number[] = [];
    for (let f = 0; f < 800; f++) {
      const before = Float32Array.from(p.pos);
      for (let s = 0; s < FRAME_STEPS; s++) p.step();
      let alive = 0;
      let dist = 0;
      let n = 0;
      for (let i = 0; i < p.count; i++) {
        if (p.age[i] < 0) continue;
        alive++;
        const d = Math.hypot(p.pos[i * 3] - before[i * 3], p.pos[i * 3 + 1] - before[i * 3 + 1], p.pos[i * 3 + 2] - before[i * 3 + 2]);
        if (d < 5) { dist += d; n++; }
      }
      live.push(alive);
      moved.push(n > 0 ? dist / n : 0);
    }
    expect(Math.min(...live)).toBeGreaterThan(p.count * 0.97);
    expect(Math.min(...moved)).toBeGreaterThan(0);
    const mean = moved.reduce((a, b) => a + b, 0) / moved.length;
    expect(Math.min(...moved)).toBeGreaterThan(mean * 0.6);
    expect(Math.max(...moved)).toBeLessThan(mean * 1.4);
  }, 120000);
});

describe('particles at any visual speed', () => {
  it.each([PARTICLE_SPEED_MIN, 1, 1.5, 2.2, PARTICLE_SPEED_MAX])('moves under a cell per sub-step at the top solver speed, at %fx', speed => {
    expect((VMAX_CELLS * speed) / substepsFor(speed)).toBeLessThanOrEqual(MAX_SUBSTEP_CELLS + 1e-9);
    expect(MAX_SUBSTEP_CELLS).toBeLessThan(1);
  });

  it.each([PARTICLE_SPEED_MIN, 1.5, PARTICLE_SPEED_MAX])('never crosses a one-cell wall in a field at the top speed pushing straight at it, at %fx', speed => {
    const scene = buildFlowScene(caseWithGpuAndShroud(), LOW);
    const sim = new CpuFlow(scene, 1);
    const [NX, NY] = scene.dims;
    const wallI = Math.floor((250 + scene.origin[0]) / scene.cellMm);
    const j = Math.floor((300 + scene.origin[1]) / scene.cellMm);
    const k = Math.floor((180 + scene.origin[2]) / scene.cellMm);
    // A one-cell solid wall across x, every other fluid cell flowing +x at the velocity cap.
    for (let jj = 1; jj < NY - 1; jj++) for (let kk = 1; kk < scene.dims[2] - 1; kk++) scene.solid[wallI + NX * (jj + NY * kk)] = 1;
    for (let c = 0; c < sim.n; c++) if (!scene.solid[c]) sim.u[c * 3] = VMAX_CELLS;
    const p = new CpuParticles(sim, 200, 4);
    for (let i = 0; i < p.count; i++) { p.age[i] = 0; p.pos[i * 3] = wallI - 8 + (i % 4); p.pos[i * 3 + 1] = j; p.pos[i * 3 + 2] = k + ((i * 7) % 5) - 2; }
    let jumped = 0;
    for (let s = 0; s < 60; s++) {
      const before = Float32Array.from(p.pos);
      p.step(undefined, speed);
      for (let i = 0; i < p.count; i++) if (before[i * 3] < wallI - 0.5 && p.pos[i * 3] > wallI + 0.5 && p.age[i] > 0) jumped++;
    }
    expect(jumped).toBe(0);
  });
});
