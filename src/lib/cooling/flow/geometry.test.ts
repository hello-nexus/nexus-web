// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCaseLayout, type CaseBox, type CaseLayout } from '../caseLayout';
import { CpuFlow } from './cpuSolver';
import { CpuParticles } from './cpuParticles';
import { buildFlowScene, type FlowInput, type FlowScene } from './gridScene';
import { hullCuts } from './hull';
import { obstaclesOf } from './obstacles';
import { boxContains } from './voxelize';
import { buildCollisionShapes } from './collisionShapes';
import { Color } from 'three';

// The HYTE Y70's case layout as T1's service returned it (Build's resolved.caseLayout), with no fan or GPU in it.
const raw = JSON.parse(readFileSync(new URL('../__fixtures__/y70-case-layout.json', import.meta.url), 'utf8')) as Record<string, unknown>;
const LOW = 32 * 24 * 48;

const verticalGpu = { slot: 'gpu', role: 'part', min: [150, 150, 12], size: [125, 304, 40], fans: { axis: 'z', side: 'min', count: 3, diameter: 90 } };
const horizontalGpu = { slot: 'gpu', role: 'part', min: [150, 100, 50], size: [300, 40, 125], fans: { axis: 'y', side: 'min', count: 3, diameter: 90 } };
const FANNED = ['top:120:0', 'top:120:1', 'top:120:2', 'rear:120:0', 'right:120:0', 'right:120:1', 'right:120:2', 'bottom:120:0', 'bottom:120:1'];

const y70 = (extra: unknown[] = [], fanned: string[] = []): CaseLayout => parseCaseLayout({
  ...raw,
  boxes: [...(raw.boxes as unknown[]), ...extra],
  fanSlots: (raw.fanSlots as { key: string }[]).map(s => (fanned.includes(s.key) ? { ...s, taken: 'fan' } : s)),
}) as CaseLayout;

const inputOf = (layout: CaseLayout): FlowInput => {
  const directions: Record<string, 'intake' | 'exhaust'> = {};
  const fanCfm: Record<string, number> = {};
  for (const s of layout.fanSlots) {
    directions[s.key] = s.position === 'rear' || s.position === 'top' ? 'exhaust' : 'intake';
    if (s.taken === 'fan') fanCfm[s.key] = 50;
  }
  return { layout, directions, fanCfm, ventCfm: 0 };
};

const mmOf = (s: FlowScene, p: ArrayLike<number>, o = 0): [number, number, number] =>
  [(p[o] + 0.5) * s.cellMm - s.origin[0], (p[o + 1] + 0.5) * s.cellMm - s.origin[1], (p[o + 2] + 0.5) * s.cellMm - s.origin[2]];

describe('the Y70 hull', () => {
  const layout = y70();
  const cuts = hullCuts(layout);

  it('takes the 87 by 89 mm window-side front corner off the box, and ignores the 9 mm trim', () => {
    expect(cuts).toHaveLength(1);
    const [cut] = cuts;
    // Full height of the shell, 89 mm back from the front along x, 87 mm in from the window along z.
    expect(cut.min).toEqual([0, 17, 0]);
    expect(cut.size).toEqual([89, 470, 87]);
    expect(boxContains(cut, [20, 200, 20], 0)).toBe(true);
    expect(boxContains(cut, [80, 200, 80], 0)).toBe(false);
  });

  it('is solid in the grid, listed with the other obstacles', () => {
    const scene = buildFlowScene(inputOf(layout), LOW);
    const hull = scene.obstacles.filter(o => o.kind === 'hull');
    expect(hull).toHaveLength(1);
    const [NX, NY] = scene.dims;
    const cell = (mm: number[]) => {
      const i = Math.floor((mm[0] + scene.origin[0]) / scene.cellMm), j = Math.floor((mm[1] + scene.origin[1]) / scene.cellMm), k = Math.floor((mm[2] + scene.origin[2]) / scene.cellMm);
      return i + NX * (j + NY * k);
    };
    expect(scene.solid[cell([40, 250, 40])]).toBe(1);
    expect(scene.solid[cell([100, 250, 100])]).toBe(0);
    expect(scene.solid[cell([100, 250, 30])]).toBe(0);
  });

  it('draws as collision shapes with the rest', () => {
    const { group, dispose } = buildCollisionShapes(obstaclesOf(layout), new Color('#fff'), new Color('#aaa'));
    expect(group.children.some(m => (m.userData.obstacle as { kind: string }).kind === 'hull')).toBe(true);
    dispose();
  });
});

describe('the Y70 obstacle list with a GPU', () => {
  it('has the chamber divider, the PSU shroud and the card', () => {
    const obstacles = obstaclesOf(y70([verticalGpu]));
    expect(obstacles.some(o => o.box.plate?.normal === 2 && o.box.size[1] > 400)).toBe(true);
    expect(obstacles.some(o => o.kind === 'panel' && o.box.faces && o.box.min[1] < 100)).toBe(true);
    expect(obstacles.some(o => o.kind === 'psu')).toBe(true);
    expect(obstacles.some(o => o.kind === 'gpu')).toBe(true);
    expect(obstacles.some(o => o.porous)).toBe(true);
  });
});

describe('GPU fan slots', () => {
  const slotsOf = (gpu: unknown) => y70([gpu]).fanSlots.filter(s => s.position === 'gpu');

  it('a vertical card gets one slot per fan, in a row along its long edge, drawing air in through its window face', () => {
    const slots = slotsOf(verticalGpu);
    expect(slots.map(s => s.key)).toEqual(['gpu:fan:0', 'gpu:fan:1', 'gpu:fan:2']);
    expect(slots.every(s => s.taken === 'fan' && s.axis?.join() === '0,0,1')).toBe(true);
    // Centres a third of the 304 mm length apart, on the card's middle in x.
    const ys = slots.map(s => s.box!.min[1] + s.box!.size[1] / 2);
    expect(ys[1] - ys[0]).toBeCloseTo(304 / 3);
    expect(slots[0].box!.min[0] + slots[0].box!.size[0] / 2).toBeCloseTo(150 + 125 / 2);
    expect(slots[0].box!.min[2]).toBe(12);
    expect(slots[0].box!.size[2]).toBe(40);
  });

  it('a horizontal card gets them along x, facing up into the card', () => {
    const slots = slotsOf(horizontalGpu);
    expect(slots).toHaveLength(3);
    expect(slots.every(s => s.axis?.join() === '0,1,0')).toBe(true);
    const xs = slots.map(s => s.box!.min[0] + s.box!.size[0] / 2);
    expect(xs[2] - xs[1]).toBeCloseTo(100);
    expect(slots[0].box!.min[2] + slots[0].box!.size[2] / 2).toBeCloseTo(50 + 125 / 2);
  });

  it('a card with no fans, or the case alone, adds none', () => {
    expect(slotsOf({ ...verticalGpu, fans: undefined })).toHaveLength(0);
    expect(y70().fanSlots.some(s => s.position === 'gpu')).toBe(false);
  });

  it('opens a channel through the card at a running fan and keeps it shut at a stopped one', () => {
    const layout = y70([verticalGpu]);
    const run = buildFlowScene(inputOf(layout), LOW);
    const stopped = buildFlowScene({ ...inputOf(layout), fanCfm: {} }, LOW);
    const [NX, NY] = run.dims;
    const slot = layout.fanSlots.find(s => s.key === 'gpu:fan:1')!;
    // A point on the ring, between hub and tip, mid-thickness.
    const p = [slot.box!.min[0] + slot.box!.size[0] / 2 + 30, slot.box!.min[1] + slot.box!.size[1] / 2, 32];
    const c = Math.floor((p[0] + run.origin[0]) / run.cellMm) + NX * (Math.floor((p[1] + run.origin[1]) / run.cellMm) + NY * Math.floor((p[2] + run.origin[2]) / run.cellMm));
    expect(run.solid[c]).toBe(0);
    expect(run.fanCell[c]).toBe(1);
    expect(run.target[c * 3 + 2]).toBeGreaterThan(0);
    expect(stopped.solid[c]).toBe(1);
    // The emitters sit on the ring, outward of the card's window face.
    expect(run.emitters.length).toBeGreaterThan(0);
    expect(stopped.emitters.length).toBe(0);
  });

  it('puts no outside-air margin on the window side', () => {
    const withGpu = buildFlowScene(inputOf(y70([verticalGpu])), LOW);
    const without = buildFlowScene(inputOf(y70()), LOW);
    expect(withGpu.origin[2]).toBe(without.origin[2]);
  });
});

describe('a fan 23 mm in from the wall', () => {
  it('still opens to outside air through its own face', () => {
    const layout = y70([], FANNED);
    const scene = buildFlowScene(inputOf(layout), LOW);
    const slot = layout.fanSlots.find(s => s.key === 'right:120:1')!;
    // The tray-side panel is at z = 320; the mount's inner face is at 297.2.
    expect(320 - (slot.box!.min[2] + slot.box!.size[2])).toBeCloseTo(22.8);
    const [NX, NY] = scene.dims;
    let opened = 0;
    for (let c = 0; c < scene.opening.length; c++) {
      if (scene.opening[c] === 1 && Math.floor(c / (NX * NY)) === scene.caseMax[2]) opened++;
    }
    expect(opened).toBeGreaterThan(0);
  });
});

describe('particles on the Y70', () => {
  const layout = y70([verticalGpu], FANNED);
  const scene = buildFlowScene(inputOf(layout), LOW);
  const sim = new CpuFlow(scene);
  for (let i = 0; i < 200; i++) sim.step();
  const particles = new CpuParticles(sim, 600, 3);
  const cut = hullCuts(layout)[0];
  const gpu = layout.boxes.find(b => b.slot === 'gpu')!;
  const [NX, NY] = scene.dims;
  const shrunk = (b: CaseBox, by: number): CaseBox => ({ ...b, min: [b.min[0] + by, b.min[1] + by, b.min[2] + by], size: [b.size[0] - 2 * by, b.size[1] - 2 * by, b.size[2] - 2 * by] });
  const opened = new Set<string>();
  for (let c = 0; c < scene.opening.length; c++) {
    if (!scene.opening[c]) continue;
    const i = c % NX, j = Math.floor(c / NX) % NY, k = Math.floor(c / (NX * NY));
    [i, j, k].forEach((v, a) => { if (v === scene.caseMin[a]) opened.add(`${a}min`); if (v === scene.caseMax[a]) opened.add(`${a}max`); });
  }

  it('never enter the chamfer prism, a solid cell or the card, and leave the case only through an opening', () => {
    expect(scene.fanCount).toBeGreaterThan(0);
    const size = [layout.size[0], layout.size[2], layout.size[1]];
    let seen = 0;
    for (let s = 0; s < 1500; s++) {
      particles.step();
      for (let i = 0; i < particles.count; i++) {
        if (particles.pos[i * 3] < -1e5) continue;
        seen++;
        const mm = mmOf(scene, particles.pos, i * 3);
        expect(boxContains(cut, mm, 0)).toBe(false);
        expect(boxContains(shrunk(gpu, scene.cellMm), mm, 0)).toBe(false);
        expect(scene.solid[particles.cellAt(particles.pos[i * 3], particles.pos[i * 3 + 1], particles.pos[i * 3 + 2])]).toBe(0);
        for (let a = 0; a < 3; a++) {
          if (mm[a] < -scene.cellMm) expect(opened.has(`${a}min`)).toBe(true);
          if (mm[a] > size[a] + scene.cellMm) expect(opened.has(`${a}max`)).toBe(true);
        }
      }
    }
    expect(seen).toBeGreaterThan(10000);
  }, 120000);

  it('driven straight at the chamfer slide along it and never cross it', () => {
    const driven = new CpuFlow(scene);
    const crowd = new CpuParticles(driven, 300, 5, false);
    // Seed a block of particles in the open air next to the corner, then push all the air at it.
    let n = 0;
    // Above and below the maker's corner glass frame, which already stops air between those heights.
    for (const y of [40, 458]) for (let x = 100; x < 200 && n < crowd.count; x += scene.cellMm) for (let z = 100; z < 200 && n < crowd.count; z += scene.cellMm) {
      const p = [(x + scene.origin[0]) / scene.cellMm - 0.5, (y + scene.origin[1]) / scene.cellMm - 0.5, (z + scene.origin[2]) / scene.cellMm - 0.5];
      if (scene.solid[crowd.cellAt(p[0], p[1], p[2])]) continue;
      crowd.pos.set(p, n * 3);
      crowd.age[n] = 0;
      n++;
    }
    expect(n).toBeGreaterThan(20);
    for (let i = n; i < crowd.count; i++) crowd.pos[i * 3] = -1e6;
    let nearDiagonal = 0;
    for (let s = 0; s < 120; s++) {
      for (let c = 0; c < scene.solid.length; c++) { driven.u[c * 3] = -0.6; driven.u[c * 3 + 1] = 0; driven.u[c * 3 + 2] = -0.6; }
      crowd.step();
      for (let i = 0; i < n; i++) {
        const mm = mmOf(scene, crowd.pos, i * 3);
        expect(boxContains(cut, mm, 0)).toBe(false);
        if (mm[0] / 89 + mm[2] / 87 < 1 + (2 * scene.cellMm) / 80) nearDiagonal++;
      }
    }
    expect(nearDiagonal).toBeGreaterThan(0);
  });

  it('start on a fan ring, off the hub, and never inside the card', () => {
    const e = scene.emitters;
    expect(e.length).toBeGreaterThan(0);
    for (let o = 0; o < e.length; o += 12) expect(e[o + 3]).toBeGreaterThan(0);
    expect(scene.spawns.length).toBeGreaterThan(0);
    for (let i = 0; i < scene.spawns.length; i += 3) {
      const mm = mmOf(scene, scene.spawns, i);
      expect(boxContains(cut, mm, 0)).toBe(false);
      expect(boxContains(shrunk(gpu, scene.cellMm), mm, 0)).toBe(false);
    }
  });
});
