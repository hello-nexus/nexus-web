// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fanGeometries, parseCaseLayout, type CaseBox, type CaseLayout } from '../caseLayout';
import { CpuFlow } from './cpuSolver';
import { CpuParticles } from './cpuParticles';
import { buildFlowScene, type FlowInput, type FlowScene } from './gridScene';
import { hullCuts } from './hull';
import { obstaclesOf } from './obstacles';
import { boxContains } from './voxelize';
import { buildCollisionShapes, obstacleGeometry } from './collisionShapes';
import { Color, type Mesh } from 'three';

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
    const hull = group.children.find(m => (m.userData.obstacle as { kind: string }).kind === 'hull') as Mesh;
    expect(hull).toBeDefined();
    // Only the diagonal wall: the full corner spans 89 by 87 mm in plan and the wall is its slanted face, inside the shell box.
    const bb = hull.geometry.boundingBox ?? (hull.geometry.computeBoundingBox(), hull.geometry.boundingBox!);
    expect([bb.min.x, bb.min.y, bb.min.z, bb.max.x, bb.max.y, bb.max.z]).toEqual([0, 17, 0, 89, 487, 87]);
    const positions = hull.geometry.getAttribute('position');
    const corner = [...Array(positions.count).keys()].filter(i => positions.getX(i) === 0 && positions.getZ(i) === 0);
    expect(corner).toHaveLength(0);
    dispose();
  });
});

describe('collision shapes stay within the case', () => {
  it('lie inside the shell box, the hull prism included', () => {
    const layout = y70([verticalGpu, horizontalGpu]);
    const shell = layout.boxes.find(b => b.chamfers)!;
    for (const o of obstaclesOf(layout)) {
      const { geometry, position } = obstacleGeometry(o.box);
      geometry.computeBoundingBox();
      const bb = geometry.boundingBox!;
      const lo = [bb.min.x + position[0], bb.min.y + position[1], bb.min.z + position[2]];
      const hi = [bb.max.x + position[0], bb.max.y + position[1], bb.max.z + position[2]];
      for (let a = 0; a < 3; a++) {
        expect(lo[a]).toBeGreaterThanOrEqual(-0.01);
        expect(hi[a]).toBeLessThanOrEqual([layout.size[0], layout.size[2], layout.size[1]][a] + 0.01);
        if (o.kind === 'hull') {
          expect(lo[a]).toBeGreaterThanOrEqual(shell.min[a] - 0.01);
          expect(hi[a]).toBeLessThanOrEqual(shell.min[a] + shell.size[a] + 0.01);
        }
      }
      geometry.dispose();
    }
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
    // Centers a third of the 304 mm length apart, on the card's middle in x.
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
  const shrunk = (b: CaseBox, by: number): CaseBox => ({ ...b, min: [b.min[0] + by, b.min[1] + by, b.min[2] + by], size: [b.size[0] - 2 * by, b.size[1] - 2 * by, b.size[2] - 2 * by] });
  it('never enter the chamfer prism, a solid cell or the card, and never lie outside the case box', () => {
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
          expect(mm[a]).toBeGreaterThan(-0.01);
          expect(mm[a]).toBeLessThan(size[a] + 0.01);
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

  it('from the bottom intakes rise into the case from the fan plane', () => {
    const bottom = y70([], ['bottom:120:0', 'bottom:120:1']);
    const sc = buildFlowScene(inputOf(bottom), LOW);
    const flow = new CpuFlow(sc);
    for (let i = 0; i < 200; i++) flow.step();
    const group = new CpuParticles(flow, 300, 9, false);
    group.age.fill(0);
    const meanY = () => {
      let sum = 0, n = 0;
      for (let i = 0; i < group.count; i++) if (group.pos[i * 3] > -1e5) { sum += mmOf(sc, group.pos, i * 3)[1]; n++; }
      return sum / n;
    };
    const start = meanY();
    // The fan plane sits just inside the floor, never below it.
    expect(start).toBeGreaterThan(0);
    for (let s = 0; s < 25; s++) group.step();
    expect(meanY()).toBeGreaterThan(start + 5);
    for (let s = 0; s < 400; s++) {
      group.step();
      for (let i = 0; i < group.count; i++) if (group.pos[i * 3] > -1e5) expect(mmOf(sc, group.pos, i * 3)[1]).toBeGreaterThan(-0.01);
    }
  }, 120000);

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

describe('AIO radiator fans', () => {
  const radSlot = { key: 'top:360:0', position: 'top', size: 360, index: 0, taken: 'radiator', box: { min: [60, 435, 40], size: [360, 52, 120] }, axis: [0, -1, 0], radiator: { fanCount: 3, fanAirflowCfm: 50 } };
  const cooler = { slot: 'cooler', role: 'part', min: [329, 237, 48], size: [105, 126, 155] };
  const caseSlots = raw.fanSlots as unknown[];
  const radBox = { slot: 'cooler', role: 'part', min: [60, 435, 40], size: [360, 52, 120], fans: { axis: 'y', side: 'min', count: 3, diameter: 114, bothSides: true } };
  const layout = parseCaseLayout({ ...raw, boxes: [...(raw.boxes as unknown[]), cooler, radBox], fanSlots: [...caseSlots, radSlot] }) as CaseLayout;

  it('a 360 top radiator gives three selectable fans on its interior face that touch no case mount', () => {
    const all = fanGeometries(layout);
    const rad = all.filter(g => g.slot.key.startsWith('rad:'));
    expect(rad.map(g => g.slot.key)).toEqual(['rad:0', 'rad:1', 'rad:2']);
    expect(rad.every(g => g.slot.taken === 'fan' && g.slot.size === 120)).toBe(true);
    // Below the radiator (y 435), the face toward the case interior.
    expect(rad.every(g => g.box.min[1] + g.box.size[1] <= 435.01 && g.box.min[1] >= 435 - 25.01)).toBe(true);
    const overlap = (a: CaseBox, b: CaseBox) => [0, 1, 2].every(i => Math.min(a.min[i] + a.size[i], b.min[i] + b.size[i]) - Math.max(a.min[i], b.min[i]) > 0.05);
    for (const r of rad) {
      for (const other of all) if (other !== r && !other.slot.key.startsWith('rad:')) expect(overlap(r.box, other.box)).toBe(false);
      for (const other of rad) if (other !== r) expect(overlap(r.box, other.box)).toBe(false);
    }
  });

  it('draws the radiator as porous and sends a running radiator fan\'s flow through it', () => {
    const input = { ...inputOf(layout), fanCfm: { 'rad:0': 50, 'rad:1': 50, 'rad:2': 50 } };
    const scene = buildFlowScene(input, LOW);
    expect(scene.fanCount).toBe(3);
    let cells = 0;
    for (let c = 0; c < scene.fanCell.length; c++) if (scene.fanCell[c]) cells++;
    expect(cells).toBeGreaterThan(0);
    expect(scene.obstacles.some(o => o.porous)).toBe(true);
  });

  it('a radiator the case mounts do not hold gets rad:N slots from its cooler box', () => {
    const loose = { slot: 'cooler', role: 'part', min: [60, 435, 40], size: [360, 52, 124], fans: { axis: 'y', side: 'min', count: 3, diameter: 114, bothSides: true } };
    const l = y70([loose]);
    const slots = l.fanSlots.filter(s => s.key.startsWith('rad:'));
    expect(slots.map(s => s.key)).toEqual(['rad:0', 'rad:1', 'rad:2']);
    expect(slots.every(s => s.position === 'top' && s.axis?.join() === '0,-1,0')).toBe(true);
    expect(fanGeometries(l).filter(g => g.slot.key.startsWith('rad:'))).toHaveLength(3);
    // A tower cooler's single fan is not a radiator.
    expect(y70([{ ...cooler, fans: { axis: 'x', side: 'min', count: 1, diameter: 114 } }]).fanSlots.some(s => s.key.startsWith('rad:'))).toBe(false);
  });
});

describe('GPU fans with per-fan sizes and faces', () => {
  const slotsOf = (fans: Record<string, unknown>) => y70([{ ...horizontalGpu, fans: { ...horizontalGpu.fans, ...fans } }]).fanSlots.filter(s => s.position === 'gpu');
  const centerX = (s: { box?: { min: number[]; size: number[] } }) => s.box!.min[0] + s.box!.size[0] / 2;

  it('packs a larger center fan from the bracket end, as Build draws it', () => {
    const slots = slotsOf({ sizes: [80, 100, 80] });
    expect(slots.map(s => s.size)).toEqual([86, 106, 86]);
    // Card 150..450 along x: offsets 65, 160 and 255 from the max end.
    expect(slots.map(centerX)).toEqual([385, 290, 195]);
    expect(slots.every(s => s.axis?.join() === '0,1,0')).toBe(true);
  });

  it('shrinks sizes that outrun the card so the rings stay on it', () => {
    // 3 x 120 on a 300 mm card: 280 mm usable, so every size scales by 280 / 360.
    const slots = slotsOf({ sizes: [120, 120, 120] });
    const frame = (120 * 280) / 360 + 6;
    expect(slots.every(s => Math.abs(s.box!.size[0] - frame) < 1e-9)).toBe(true);
    const lo = Math.min(...slots.map(s => s.box!.min[0] + 6 / 2));
    const hi = Math.max(...slots.map(s => s.box!.min[0] + s.box!.size[0] - 6 / 2));
    expect(hi).toBeCloseTo(450 - 20 + 0, 5);
    expect(lo).toBeCloseTo(150, 5);
  });

  it('puts a backplate fan on the opposite face, drawing air the other way', () => {
    const slots = slotsOf({ sizes: [80, 100, 100], faces: ['cooler', 'cooler', 'backplate'] });
    expect(slots.map(s => s.axis?.join())).toEqual(['0,1,0', '0,1,0', '0,-1,0']);
  });

  it('ignores lists that do not match the fan count or hold a bad entry, and keeps the even spread', () => {
    for (const bad of [{ sizes: [80, 100] }, { sizes: [80, 'x', 80] }, { faces: ['cooler', 'cooler'] }, { faces: ['cooler', 'top', 'cooler'] }]) {
      const slots = slotsOf(bad);
      expect(slots.map(centerX)).toEqual([200, 300, 400]);
      expect(slots.every(s => s.size === 96 && s.axis?.join() === '0,1,0')).toBe(true);
    }
  });
});
