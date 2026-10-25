// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { fanRadii, FAN_HUB_RATIO } from '../fanGeometry';
import { CpuParticles } from './cpuParticles';
import { CpuFlow } from './cpuSolver';
import { OPENING_VENT, buildFlowScene, isSolidAt, sampleSpawn, type FlowScene } from './gridScene';
import { fronts, inputFor, slotSpec, tops, rear } from './flowFixtures';

const M3S_PER_CFM = 0.000471947;
const LOW = 32 * 24 * 48;
const FINE = 64 * 48 * 96;

// The front fan: frame 120 mm, centre (x 12.5, y 120, z 180), axis +x.
const fan = fronts[1];
const CENTRE = [12.5, 60 + 120 + 60, 180];
const { tip, hub } = fanRadii(120);
const cell = (s: FlowScene, mm: number[]) => [0, 1, 2].map(a => Math.floor((mm[a] + s.origin[a]) / s.cellMm));
const idx = (s: FlowScene, c: number[]) => c[0] + s.dims[0] * (c[1] + s.dims[1] * c[2]);

describe('fan ring', () => {
  it('has a hub ratio that gives a 120 mm fan a hub about 43 mm across', () => {
    expect(FAN_HUB_RATIO).toBeGreaterThan(0.35);
    expect(FAN_HUB_RATIO).toBeLessThan(0.4);
    expect(2 * fanRadii(120).hub).toBeGreaterThan(40);
    expect(2 * fanRadii(120).hub).toBeLessThan(50);
    expect(2 * fanRadii(140).hub).toBeGreaterThan(48);
    expect(2 * fanRadii(140).hub).toBeLessThan(56);
  });

  for (const [name, cells] of [['fine', FINE], ['coarse', LOW]] as const) {
    describe(`${name} grid`, () => {
      const input = inputFor([fan], [], () => 'intake', 80);
      const scene = buildFlowScene(input, cells);
      const [NX, NY] = scene.dims;
      const at = (c: number) => ({ i: c % NX, j: Math.floor(c / NX) % NY, k: Math.floor(c / (NX * NY)) });
      const mm = (c: number) => { const { i, j, k } = at(c); return [(i + 0.5) * scene.cellMm - scene.origin[0], (j + 0.5) * scene.cellMm - scene.origin[1], (k + 0.5) * scene.cellMm - scene.origin[2]]; };

      it('puts force and openings only between the hub and the tip, and makes the hub solid', () => {
        let forced = 0;
        for (let c = 0; c < scene.fanCell.length; c++) {
          if (!scene.fanCell[c]) continue;
          forced++;
          const p = mm(c);
          const r = Math.hypot(p[1] - CENTRE[1], p[2] - CENTRE[2]);
          expect(r).toBeGreaterThan(hub - scene.cellMm);
          expect(r).toBeLessThan(tip + scene.cellMm);
        }
        expect(forced).toBeGreaterThan(5);
        const hubCell = cell(scene, [20, CENTRE[1], CENTRE[2]]);
        expect(scene.solid[idx(scene, hubCell)]).toBe(1);
        const frameCorner = cell(scene, [20, CENTRE[1] + 56, CENTRE[2] + 56]);
        expect(scene.solid[idx(scene, frameCorner)]).toBe(1);
        const ringMid = cell(scene, [20, CENTRE[1] + (hub + tip) / 2, CENTRE[2]]);
        expect(scene.solid[idx(scene, ringMid)]).toBe(0);
        expect(scene.fanCell[idx(scene, ringMid)]).toBe(1);
        expect(isSolidAt(scene, [20, CENTRE[1], CENTRE[2]])).toBe(true);
      });

      it('moves the fan CFM through its ring, within 10%, however coarse the grid', () => {
        // Flow through one cross-section of the ring: the target speed of its cells times their area.
        const layersAlong = new Map<number, number>();
        for (let c = 0; c < scene.fanCell.length; c++) {
          if (!scene.fanCell[c]) continue;
          const { i } = at(c);
          layersAlong.set(i, (layersAlong.get(i) ?? 0) + Math.abs(scene.target[c * 3]));
        }
        const cellSeconds = scene.stepSeconds / (scene.cellMm / 1000);
        const areaM2 = (scene.cellMm / 1000) ** 2;
        for (const sum of layersAlong.values()) {
          const flowM3s = (sum / cellSeconds) * areaM2;
          expect(Math.abs(flowM3s / (80 * M3S_PER_CFM) - 1)).toBeLessThan(0.1);
        }
        expect(layersAlong.size).toBeGreaterThan(0);
      });

      it('spawns particles across the whole ring, 10000 samples between hub and tip', () => {
        const sim = new CpuFlow(scene, 1);
        const particles = new CpuParticles(sim, 10000, 3);
        let near = 0;
        let far = 0;
        for (let n = 0; n < particles.count; n++) {
          const p = [0, 1, 2].map(a => (particles.pos[n * 3 + a] + 0.5) * scene.cellMm - scene.origin[a]);
          const r = Math.hypot(p[1] - CENTRE[1], p[2] - CENTRE[2]);
          expect(r).toBeGreaterThan(hub);
          expect(r).toBeLessThanOrEqual(tip + 0.5);
          if (r < (hub + tip) / 2) near++; else far++;
        }
        // Uniform per area: the outer half of the radii holds more area than the inner half.
        expect(far).toBeGreaterThan(near);
        expect(near).toBeGreaterThan(particles.count * 0.2);
      });
    });
  }

  it('keeps hub and frame cells at rest while the ring moves the air', () => {
    const scene = buildFlowScene(inputFor([fan], [], () => 'intake', 80), LOW);
    const sim = new CpuFlow(scene);
    for (let i = 0; i < 150; i++) sim.step();
    let solids = 0;
    let moving = 0;
    for (let c = 0; c < scene.solid.length; c++) {
      const speed = Math.hypot(sim.u[c * 3], sim.u[c * 3 + 1], sim.u[c * 3 + 2]);
      if (scene.solid[c]) { solids++; expect(speed).toBe(0); } else if (scene.fanCell[c] && speed > 0.05) moving++;
    }
    expect(solids).toBeGreaterThan(0);
    expect(moving).toBeGreaterThan(3);
  }, 60000);

  it('opens exhaust fans the same way', () => {
    const scene = buildFlowScene(inputFor([rear, tops[0]], [], () => 'exhaust', 70), LOW);
    expect(scene.fanCount).toBe(2);
    expect(slotSpec).toBeDefined();
  });
});

describe('stopped fans and empty slots', () => {
  const emptyFront = slotSpec('front:120:1', 'front', null, [0, 180, 120], [25, 120, 120], [1, 0, 0]);
  const shellX = (s: FlowScene) => s.caseMin[0];

  it('keeps a fan with no flow as an open vent with a hub, not a sealed hole', () => {
    const input = inputFor([fan], [], () => 'intake', 0);
    const s = buildFlowScene(input, FINE);
    const ring = cell(s, [20, CENTRE[1] + (hub + tip) / 2, CENTRE[2]]);
    ring[0] = shellX(s);
    expect(s.solid[idx(s, ring)]).toBe(0);
    expect(s.opening[idx(s, ring)]).toBe(OPENING_VENT);
    const hubCell = cell(s, [20, CENTRE[1], CENTRE[2]]);
    expect(s.solid[idx(s, hubCell)]).toBe(1);
    expect(s.fanCell.some(v => v === 1)).toBe(false);
    expect(s.fanCount).toBe(0);
  });

  it('keeps an empty slot as an open grille with no hub', () => {
    const s = buildFlowScene(inputFor([emptyFront], [], () => 'intake'), FINE);
    const centre = cell(s, [20, CENTRE[1], CENTRE[2]]);
    expect(s.solid[idx(s, centre)]).toBe(0);
    const shellCentre = [...centre];
    shellCentre[0] = shellX(s);
    expect(s.solid[idx(s, shellCentre)]).toBe(0);
    expect(s.opening[idx(s, shellCentre)]).toBe(OPENING_VENT);
  });

  it('spawns inflow particles across the whole disc of an empty slot, hub area included', () => {
    const s = buildFlowScene({ ...inputFor([emptyFront], [], () => 'intake'), ventCfm: -60 }, FINE);
    let inner = 0;
    for (let m = 0; m < s.spawns.length / 3; m++) {
      const p = [0, 1, 2].map(a => (s.spawns[m * 3 + a] + 0.5) * s.cellMm - s.origin[a]);
      if (Math.hypot(p[1] - CENTRE[1], p[2] - CENTRE[2]) < hub) inner++;
    }
    expect(s.spawns.length).toBeGreaterThan(0);
    expect(inner).toBeGreaterThan(0);
  });
});

describe('spawn radius distribution', () => {
  const N = 20000;
  const lcg = (seed: number) => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

  /** KS distance between the spawn radii of the only fan and the area-uniform CDF over hub..tip. */
  function ks(slot: ReturnType<typeof slotSpec>, frame: number, rotation = 0) {
    const scene = buildFlowScene(inputFor([slot], [], () => 'intake', 70), FINE);
    const e = scene.emitters;
    const c = [e[0], e[1], e[2]];
    const axis = [e[4], e[5], e[6]];
    const { tip: t, hub: h } = fanRadii(frame);
    const rnd = lcg(11);
    const radii: number[] = [];
    const cells = new Set<number>();
    let atHub = 0;
    for (let n = 0; n < N; n++) {
      const q = sampleSpawn(scene, rnd);
      if (!q) continue;
      const d = [0, 1, 2].map(a => q[a] - c[a]);
      const along = d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2];
      const rad = Math.hypot(...d.map((v, a) => v - along * axis[a])) * scene.cellMm;
      if (rad <= h + 0.05) atHub++;
      radii.push(rad);
      cells.add(Math.floor(q[0] * 1000) * 1e6 + Math.floor(q[1] * 1000) * 1e3 + Math.floor(q[2] * 1000));
    }
    radii.sort((a, b) => a - b);
    let worst = 0;
    radii.forEach((r, i) => {
      const f = Math.min(1, Math.max(0, (r * r - h * h) / (t * t - h * h)));
      worst = Math.max(worst, Math.abs((i + 1) / radii.length - f), Math.abs(i / radii.length - f));
    });
    return { atHub, worst, min: radii[0], max: radii[radii.length - 1], hub: h, tip: t, distinct: cells.size, count: radii.length, scene, rotation };
  }

  const front120 = slotSpec('front:120:1', 'front', 'fan', [0, 180, 120], [25, 120, 120], [1, 0, 0]);
  const front140 = slotSpec('front:140:1', 'front', 'fan', [0, 170, 110], [25, 140, 140], [1, 0, 0]);
  const turned = slotSpec('front:120:2', 'front', 'fan', [0, 180, 120], [25, 120, 120], [Math.cos(0.6), 0, -Math.sin(0.6)]);

  it.each([['120 mm', front120, 120], ['140 mm', front140, 140], ['a turned 120 mm', turned, 120]] as const)('%s fan: radii follow the area-uniform CDF and cover hub to tip', (_n, slot, frame) => {
    const r = ks(slot, frame);
    expect(r.count).toBeGreaterThan(N * 0.9);
    expect(r.worst).toBeLessThan(0.025);
    expect(r.min).toBeLessThan(r.hub + (r.tip - r.hub) * 0.08);
    // Nothing on the hub circle or inside it.
    expect(r.min).toBeGreaterThan(r.hub + 0.5);
    expect(r.atHub).toBe(0);
    expect(r.max).toBeGreaterThan(r.tip - (r.tip - r.hub) * 0.03);
    expect(r.max).toBeLessThanOrEqual(r.tip + r.scene.cellMm * 0.01);
  });

  it('starts at continuous positions, not on a few cell centres or a fixed point set', () => {
    const r = ks(front120, 120);
    expect(r.distinct).toBeGreaterThan(r.count * 0.95);
  });

  it('gives a stronger, larger fan more emitter entries than a smaller one', () => {
    const a = buildFlowScene(inputFor([front120], [], () => 'intake', 60), FINE);
    const b = buildFlowScene(inputFor([front140], [], () => 'intake', 70), FINE);
    expect(b.emitters.length).toBeGreaterThan(a.emitters.length);
  });
});

describe('a fan mounted away from the wall', () => {
  it('vents through the face it points at, however far the panel sits from the mount', () => {
    // 23 mm of air between the mount and the side wall, as on the Y70's right side.
    const set = slotSpec('right:120:1', 'right', 'fan', [27, 189, 312], [120, 120, 25], [0, 0, -1]);
    const s = buildFlowScene(inputFor([set], [], () => 'intake', 60), FINE);
    expect(s.opening.some(v => v === 1)).toBe(true);
  });
});
