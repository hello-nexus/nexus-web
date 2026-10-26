// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Color } from 'three';
import { parseCaseLayout, withBoundFans, type CaseBox, type CaseFanSlot, type CaseLayout, type FanBinding, type Vec3 } from '../caseLayout';
import type { FanDirection } from '../pressureModel';
import { boundSlotKeys, lumpedModel, slotDirections, slotSpeeds } from '../slotFlow';
import { visualFlow } from '../visualFlow';
import { buildCollisionShapes, obstacleGeometry } from './collisionShapes';
import { CpuFlow } from './cpuSolver';
import { CpuParticles } from './cpuParticles';
import { buildFlowScene } from './gridScene';
import { EMITTER_STRIDE, OUTSIDE_REACH_MM } from './flowParams';
import { hullCuts } from './hull';
import { obstaclesOf } from './obstacles';

// Y70 is T1's record; the others are buildResolved output of nexus-build layoutPc on build-db.mjs geometry from case-models.json (ATX board, 2 or 3 fan GPU, AIO 360 or tower cooler, 3 placed fans, lines and checks dropped).
const FIXTURES = [
  { name: 'HYTE Y70', file: 'y70', dual: true },
  { name: 'HYTE Y50', file: 'y50', dual: true },
  { name: 'HYTE Y60', file: 'y60', dual: true },
  { name: 'HYTE X50', file: 'x50', dual: false },
  { name: 'Lian Li Lancool 216', file: 'lancool216', dual: false },
] as const;

const rawOf = (file: string) => JSON.parse(readFileSync(new URL(`../__fixtures__/${file}-case-layout.json`, import.meta.url), 'utf8')) as Record<string, unknown> & { boxes: unknown[]; fanSlots: { key: string }[] };
const LOW = 32 * 24 * 48;
const sim = (rpm: number, slotKeys: string[]): FanBinding => ({ channelId: `sim:${rpm}`, slotKeys });
const sizeOf = (l: CaseLayout): Vec3 => [l.size[0], l.size[2], l.size[1]];
const centerOf = (s: CaseFanSlot): Vec3 => [0, 1, 2].map(a => s.box!.min[a] + s.box!.size[a] / 2) as Vec3;

/** A card laid flat in the middle of the case, for a fixture whose record carries none. */
const flatGpu = (l: CaseLayout) => ({ slot: 'gpu', role: 'part', min: [sizeOf(l)[0] * 0.3, sizeOf(l)[1] * 0.25, sizeOf(l)[2] * 0.3], size: [300, 40, 125], fans: { axis: 'y', side: 'min', count: 3, diameter: 90 } });

describe.each(FIXTURES)('$name', ({ name, file, dual }) => {
  const raw = rawOf(file);
  const record = (choice?: string | null, extra: unknown[] = []) => parseCaseLayout({ ...raw, boxes: [...raw.boxes, ...extra] }, choice) as CaseLayout;
  const plain = record();
  const withCard = (): CaseLayout => (plain.boxes.some(b => b.slot === 'gpu' && b.fans) ? plain : record(null, [flatGpu(plain)]));

  /** A layout with the bound slots as fans, one slot per mount, and every figure the Cooling page derives from it. */
  const derive = (bindings: FanBinding[], source: CaseLayout = plain, overrides: Record<string, FanDirection> = {}) => {
    const keys = boundSlotKeys(bindings, []);
    const layout = withBoundFans(source, keys);
    const speeds = slotSpeeds(layout.fanSlots, bindings, []);
    const directions = slotDirections(layout.fanSlots, overrides);
    const lumped = lumpedModel(layout.fanSlots, [], speeds, directions);
    const visual = visualFlow(layout.fanSlots, [], speeds, directions);
    const scene = buildFlowScene({ layout, directions, fanCfm: visual.fanCfm, ventCfm: visual.ventCfm, referenceCfm: visual.referenceCfm }, LOW);
    return { layout, speeds, directions, lumped, visual, scene };
  };

  const shown = withBoundFans(plain, []);
  const mounts = shown.fanSlots.filter(s => s.taken === null && s.position !== 'gpu' && !s.key.startsWith('rad:'));
  const radKeys = withBoundFans(plain, []).fanSlots.filter(s => s.key.startsWith('rad:')).map(s => s.key);
  const sizeSet = new Set(mounts.map(s => s.size));

  it('parses to a case with mounts that each have a box and a unit axis pointing into the case', () => {
    expect(plain.caseModel).toBe(name);
    expect(mounts.length).toBeGreaterThanOrEqual(2);
    const center = sizeOf(plain).map(v => v / 2);
    for (const s of shown.fanSlots) {
      expect(s.box, s.key).toBeDefined();
      expect(s.axis, s.key).toBeDefined();
      expect(Math.hypot(...s.axis!)).toBeCloseTo(1, 6);
      if (s.position === 'gpu') continue;
      const c = centerOf(s);
      expect(s.axis!.reduce((sum, v, a) => sum + v * (center[a] - c[a]), 0), `${s.key} faces outward`).toBeGreaterThan(0);
    }
    expect(sizeSet.size).toBeGreaterThan(0);
  });

  it('gives every fan slot a fan that moves air, and every intake spawn particles outside its face', () => {
    const slots = shown.fanSlots.filter(s => s.taken !== 'radiator');
    const run = derive([sim(1500, slots.map(s => s.key))]);
    const fanned = run.layout.fanSlots.filter(s => s.taken === 'fan');
    expect(fanned.length).toBe(slots.length);
    for (const s of fanned) expect(run.visual.fanCfm[s.key], s.key).toBeGreaterThan(0);
    expect(run.scene.fanCount, 'every fan opens a ring in the grid').toBe(fanned.length);
    let intakes = 0;
    for (const s of fanned) {
      if (run.directions[s.key] !== 'intake') continue;
      intakes++;
      expect(run.scene.emitterCounts[s.key], s.key).toBeGreaterThan(0);
    }
    expect(intakes).toBeGreaterThan(0);
    // Each emitter entry sits at the center of a fanned slot, in cell coordinates; a fan on a case face starts its particles out past that face; a card, radiator or shroud-mounted fan does not.
    const e = run.scene.emitters;
    const cell = run.scene.cellMm;
    const centers = new Map(fanned.map(s => [s.key, [0, 1, 2].map(a => (centerOf(s)[a] + run.scene.origin[a]) / cell - 0.5)]));
    for (let o = 0; o < e.length; o += EMITTER_STRIDE) {
      const hit = [...centers.entries()].find(([, c]) => [0, 1, 2].every(a => Math.abs(c[a] - e[o + a]) < 1e-3));
      expect(hit, 'emitter on a fan center').toBeDefined();
      const slot = fanned.find(s => s.key === hit![0])!;
      if (!['front', 'rear', 'top', 'bottom', 'left', 'right'].includes(slot.position) || slot.key.startsWith('rad:')) continue;
      expect(e[o + 11] * cell).toBeGreaterThan(0);
      expect((e[o + 11] + e[o + 12]) * cell).toBeLessThan(OUTSIDE_REACH_MM + 80);
    }
  });

  it('keeps every particle within the outside reach of the case box and out of solid cells', () => {
    const run = derive([sim(1500, withBoundFans(withCard(), []).fanSlots.filter(s => s.taken !== 'radiator').map(s => s.key))], withCard());
    const flow = new CpuFlow(run.scene);
    for (let i = 0; i < 150; i++) flow.step();
    const particles = new CpuParticles(flow, 500, 3);
    const size = sizeOf(plain);
    let seen = 0;
    for (let s = 0; s < 300; s++) {
      particles.step();
      for (let i = 0; i < particles.count; i++) {
        if (particles.pos[i * 3] < -1e5) continue;
        seen++;
        for (let a = 0; a < 3; a++) {
          const mm = (particles.pos[i * 3 + a] + 0.5) * run.scene.cellMm - run.scene.origin[a];
          expect(mm).toBeGreaterThan(-OUTSIDE_REACH_MM - run.scene.cellMm);
          expect(mm).toBeLessThan(size[a] + OUTSIDE_REACH_MM + run.scene.cellMm);
        }
        expect(run.scene.solid[particles.cellAt(particles.pos[i * 3], particles.pos[i * 3 + 1], particles.pos[i * 3 + 2])]).toBe(0);
      }
    }
    expect(seen).toBeGreaterThan(2000);
  }, 120000);

  describe('fan edits', () => {
    const [a, b, c] = mounts.map(s => s.key);
    const base = (): FanBinding[] => [sim(1200, [a])];
    const edits: [string, FanBinding[]][] = [
      ['add a fan', [sim(1200, [a]), sim(1500, [b])]],
      ['remove the fan', []],
      ['bind another fan at a different speed', [sim(1200, [a]), sim(2400, [c])]],
      ['move the fan to another slot', [sim(1200, [b])]],
      ['change the fan speed', [sim(2400, [a])]],
    ];
    for (const [label, next] of edits) {
      it(`${label} keeps the grid, the solver and the particle buffers`, () => {
        const before = derive(base());
        const after = derive(next);
        expect(after.scene.dims).toEqual(before.scene.dims);
        expect(after.scene.cellMm).toBe(before.scene.cellMm);
        const flow = new CpuFlow(before.scene);
        for (let i = 0; i < 30; i++) flow.step();
        const particles = new CpuParticles(flow, 200, 3);
        for (let i = 0; i < 10; i++) particles.step();
        const velocity = flow.u;
        const positions = particles.pos;
        flow.setScene(after.scene);
        expect(flow.u).toBe(velocity);
        expect(particles.pos).toBe(positions);
        particles.step();
        expect(particles.pos).toBe(positions);
      }, 60000);
    }
  });

  it('moves the flow and the case pressure with a simulated fan speed', () => {
    const slot = mounts.find(s => !['rear', 'top'].includes(s.position)) ?? mounts[0];
    const low = derive([sim(500, [slot.key])]);
    const high = derive([sim(2500, [slot.key])]);
    const off = derive([sim(0, [slot.key])]);
    expect(high.visual.fanCfm[slot.key]).toBeGreaterThan(low.visual.fanCfm[slot.key]);
    expect(off.visual.fanCfm[slot.key]).toBe(0);
    const key = high.directions[slot.key] === 'intake' ? 'intakeCfm' : 'exhaustCfm';
    expect(high.lumped.result[key]).toBeGreaterThan(low.lumped.result[key]);
    expect(high.lumped.result.pressurePa).not.toBe(low.lumped.result.pressurePa);
  });

  it('binds the graphics card fans and blows through them, outside the case totals', () => {
    const layout = withCard();
    const keys = withBoundFans(layout, []).fanSlots.filter(s => s.position === 'gpu').map(s => s.key);
    expect(keys.length).toBeGreaterThanOrEqual(2);
    const idle = derive([sim(0, keys)], layout);
    const spinning = derive([sim(1500, keys)], layout);
    for (const k of keys) {
      expect(idle.visual.fanCfm[k]).toBe(0);
      expect(spinning.visual.fanCfm[k], k).toBeGreaterThan(0);
      expect(spinning.scene.emitterCounts[k], k).toBeGreaterThan(0);
    }
    expect(spinning.scene.fanCount).toBe(spinning.layout.fanSlots.filter(s => s.taken === 'fan' && (spinning.visual.fanCfm[s.key] ?? 0) > 0).length);
    expect(spinning.lumped.fanCount).toBe(idle.lumped.fanCount);
    expect(spinning.lumped.result).toEqual(idle.lumped.result);
  });

  describe.runIf(radKeys.length > 0)('radiator fans', () => {
    it('are one slot per radiator fan, inside the case, and bind and blow', () => {
      expect(radKeys.length).toBeGreaterThanOrEqual(2);
      const run = derive([sim(1500, radKeys)]);
      const extents = sizeOf(plain);
      for (const k of radKeys) {
        const s = run.layout.fanSlots.find(x => x.key === k)!;
        expect(s.taken).toBe('fan');
        for (let a = 0; a < 3; a++) {
          expect(s.box!.min[a], `${k} axis ${a}`).toBeGreaterThanOrEqual(-1);
          expect(s.box!.min[a] + s.box!.size[a], `${k} axis ${a}`).toBeLessThanOrEqual(extents[a] + 1);
        }
        expect(run.visual.fanCfm[k]).toBeGreaterThan(0);
        expect(run.scene.emitterCounts[k] ?? 0).toBeGreaterThanOrEqual(0);
      }
      expect(run.scene.fanCount).toBe(run.layout.fanSlots.filter(s => s.taken === 'fan' && (run.visual.fanCfm[s.key] ?? 0) > 0).length);
      expect(run.scene.obstacles.some(o => o.porous)).toBe(true);
      expect(derive([sim(0, radKeys)]).visual.fanCfm[radKeys[0]]).toBe(0);
    });
  });

  describe.runIf(Array.isArray(raw.radiatorOptions) && (raw.radiatorOptions as unknown[]).length >= 2)('radiator mounts', () => {
    const options = (raw.radiatorOptions as { mount: string; radiator: string[]; fans: string[] }[]);
    it('switch between every listed mount and keep the radiator fans inside the case', () => {
      for (const option of options) {
        const switched = record(option.mount);
        expect(switched.radiatorMount).toBe(option.mount);
        expect(switched.fanSlots.filter(s => s.taken === 'radiator').map(s => s.key).sort()).toEqual([...option.radiator].sort());
        const keys = switched.fanSlots.filter(s => s.key.startsWith('rad:')).map(s => s.key);
        expect(keys).toEqual(radKeys);
        const run = derive([sim(1500, keys)], switched);
        expect(run.scene.fanCount).toBeGreaterThanOrEqual(keys.length);
        for (const k of keys) {
          const s = run.layout.fanSlots.find(x => x.key === k)!;
          expect(s.position).toBe(option.mount);
          expect(run.visual.fanCfm[k]).toBeGreaterThan(0);
          for (let a = 0; a < 3; a++) {
            expect(s.box!.min[a], `${option.mount} ${k}`).toBeGreaterThanOrEqual(-1);
            expect(s.box!.min[a] + s.box!.size[a], `${option.mount} ${k}`).toBeLessThanOrEqual(sizeOf(plain)[a] + 1);
          }
        }
        // The radiator box moved with the mount, and no taken case fan overlaps it.
        const radBox = switched.boxes.find(x => x.slot === 'cooler' && x.fans?.bothSides) ?? switched.boxes.find(x => x.slot === 'cooler');
        expect(radBox).toBeDefined();
      }
    });
  });

  describe('hull', () => {
    const shell = (raw.boxes as { slot: string; chamfers?: { legA: number; legB: number; round?: boolean }[] }[]).find(x => x.slot === 'case' && x.chamfers);
    const expected = (shell?.chamfers ?? []).filter(x => Math.min(x.legA, x.legB) >= 30 && !x.round).length;
    it(expected > 0 ? 'cuts a prism per large straight chamfer, solid in the grid' : 'adds no prism when the shape has no large straight chamfer', () => {
      const cuts = hullCuts(plain);
      expect(cuts).toHaveLength(expected);
      const scene = derive([sim(1500, [mounts[0].key])]).scene;
      expect(scene.obstacles.filter(o => o.kind === 'hull')).toHaveLength(expected);
      for (const cut of cuts) {
        const mid = [0, 1, 2].map(a => cut.min[a] + cut.size[a] * 0.1);
        const [NX, NY] = scene.dims;
        const c = [0, 1, 2].map(a => Math.floor((mid[a] + scene.origin[a]) / scene.cellMm));
        expect(scene.solid[c[0] + NX * (c[1] + NY * c[2])]).toBe(1);
      }
    });
  });

  it('draws every collision shape inside the case box', () => {
    const layout = withCard();
    const extents = sizeOf(layout);
    const obstacles = obstaclesOf(layout);
    for (const o of obstacles) {
      const { geometry, position } = obstacleGeometry(o.box);
      geometry.computeBoundingBox();
      const bb = geometry.boundingBox!;
      const lo = [bb.min.x + position[0], bb.min.y + position[1], bb.min.z + position[2]];
      const hi = [bb.max.x + position[0], bb.max.y + position[1], bb.max.z + position[2]];
      for (let a = 0; a < 3; a++) {
        expect(lo[a], `${o.kind} ${o.box.slot}`).toBeGreaterThanOrEqual(-0.01);
        expect(hi[a], `${o.kind} ${o.box.slot}`).toBeLessThanOrEqual(extents[a] + 0.01);
      }
      geometry.dispose();
    }
    const { dispose } = buildCollisionShapes(obstacles, new Color('#fff'), new Color('#aaa'));
    dispose();
  });

  it(dual ? 'keeps the chamber divider as an obstacle' : 'keeps the card, PSU and board as solids', () => {
    const obstacles = obstaclesOf(withCard());
    expect(obstacles.some(o => o.kind === 'gpu')).toBe(true);
    expect(obstacles.some(o => o.kind === 'psu')).toBe(true);
    expect(obstacles.some(o => o.kind === 'board')).toBe(true);
    if (dual) {
      const divider = (o: { box: CaseBox }) => o.box.plate?.normal === 2 && o.box.size[1] > sizeOf(plain)[1] * 0.7 && o.box.plate.holes.length > 0;
      expect(obstacles.some(o => o.kind === 'panel' && divider(o))).toBe(true);
    }
  });
});

describe('the fixtures', () => {
  it('cover a case with a hull, one without, a tower cooler, an AIO and a radiator with two mounts', () => {
    const layouts = FIXTURES.map(f => rawOf(f.file));
    expect(layouts.some(l => l.boxes.some(b => (b as { chamfers?: { round?: boolean; legA: number; legB: number }[] }).chamfers?.some(c => !c.round && Math.min(c.legA, c.legB) >= 30)))).toBe(true);
    expect(layouts.some(l => !l.boxes.some(b => (b as { chamfers?: unknown[] }).chamfers?.length))).toBe(true);
    expect(layouts.some(l => (l.radiatorOptions as unknown[] | undefined)?.length ?? 0 >= 2)).toBe(true);
    expect(layouts.filter(l => (l.fanSlots as { key: string }[]).length > 0).length).toBe(FIXTURES.length);
  });
});

describe('fans Build places from the case maker', () => {
  const placed = (file: string) => (parseCaseLayout(rawOf(file)) as CaseLayout).fanSlots.filter(s => s.taken === 'fan' && !s.key.startsWith('rad:') && s.position !== 'gpu');

  it.each(FIXTURES)('$name: placed fans keep their default directions, rear and top out and the rest in', ({ file }) => {
    const slots = placed(file);
    const directions = slotDirections(slots, {});
    for (const s of slots) expect(directions[s.key], s.key).toBe(['rear', 'top'].includes(s.position) ? 'exhaust' : 'intake');
  });

  it('the Y50 record ships the three side fans and the rear fan, each facing into the case', () => {
    const slots = placed('y50');
    expect(slots.map(s => s.key).sort()).toEqual(['rear:120:0', 'right:120:0', 'right:120:1', 'right:120:2']);
    expect(slots.find(s => s.position === 'rear')!.axis).toEqual([-1, 0, 0]);
    expect(slots.filter(s => s.position === 'right').every(s => s.axis![2] === -1)).toBe(true);
  });
});
