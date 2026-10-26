// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fanGeometries, parseCaseLayout, withBoundFans, type CaseLayout, type FanBinding, type Vec3 } from '../caseLayout';
import { boundSlotKeys, slotDirections, slotSpeeds } from '../slotFlow';
import { visualFlow } from '../visualFlow';
import { CpuFlow } from './cpuSolver';
import { CpuParticles } from './cpuParticles';
import { FAN_CLEARANCE_MM, OUTSIDE_REACH_MM, PARTICLE_DRAW_SHARE, STUCK_MOVE_CELLS, drawnParticles } from './flowParams';
import { buildFlowScene } from './gridScene';
import { fanRadii } from '../fanGeometry';
import { boxContains } from './voxelize';
import { defaultDir, fronts, inputFor, rear } from './flowFixtures';

// The same five Build layouts as caseAgnostic.test.ts.
const FIXTURES = ['y70', 'y50', 'y60', 'x50', 'lancool216'] as const;
const LOW = 32 * 24 * 48;
const rawOf = (file: string) => JSON.parse(readFileSync(new URL(`../__fixtures__/${file}-case-layout.json`, import.meta.url), 'utf8')) as Record<string, unknown>;
const centerOf = (b: { min: number[]; size: number[] }): Vec3 => [0, 1, 2].map(a => b.min[a] + b.size[a] / 2) as Vec3;

function derive(file: string, rpm = 1500) {
  const plain = parseCaseLayout(rawOf(file)) as CaseLayout;
  const keys = withBoundFans(plain, []).fanSlots.filter(s => s.taken !== 'radiator' && s.position !== 'gpu').map(s => s.key);
  const bindings: FanBinding[] = [{ channelId: `sim:${rpm}`, slotKeys: keys }];
  const layout = withBoundFans(plain, boundSlotKeys(bindings, []));
  const directions = slotDirections(layout.fanSlots, {});
  const visual = visualFlow(layout.fanSlots, [], slotSpeeds(layout.fanSlots, bindings, []), directions);
  const scene = buildFlowScene({ layout, directions, fanCfm: visual.fanCfm, ventCfm: visual.ventCfm, referenceCfm: visual.referenceCfm }, LOW);
  return { layout, directions, scene };
}

const exhaustSamples: number[] = [];

describe.each(FIXTURES)('%s fans and the air outside', file => {
  const { layout, directions, scene } = derive(file);
  const [NX, NY, NZ] = scene.dims;
  const cellAt = (mm: Vec3) => {
    const i = Math.floor((mm[0] + scene.origin[0]) / scene.cellMm), j = Math.floor((mm[1] + scene.origin[1]) / scene.cellMm), k = Math.floor((mm[2] + scene.origin[2]) / scene.cellMm);
    return i < 0 || j < 0 || k < 0 || i >= NX || j >= NY || k >= NZ ? -1 : i + NX * (j + NY * k);
  };
  const mmOf = (p: ArrayLike<number>, o: number): Vec3 => [0, 1, 2].map(a => (p[o + a] + 0.5) * scene.cellMm - scene.origin[a]) as Vec3;
  const extents: Vec3 = [layout.size[0], layout.size[2], layout.size[1]];
  const fans = layout.fanSlots.filter(s => s.taken === 'fan' && s.box && s.axis);
  const hull = scene.obstacles.filter(o => o.kind === 'hull');
  const inCaseMm = (m: Vec3) => [0, 1, 2].every(a => m[a] >= 0 && m[a] <= extents[a]);

  it('keeps every fan disc free of solid cells on both sides, to the clearance', () => {
    expect(fans.length).toBeGreaterThan(0);
    for (const s of fans) {
      const c = centerOf(s.box!);
      const axis = s.axis as Vec3;
      const k = axis.findIndex(v => Math.abs(v) > 0.5);
      const frame = Math.min(...[0, 1, 2].filter(a => a !== k).map(a => s.box!.size[a]));
      const { tip } = fanRadii(frame);
      const halfEff = Math.max(s.box!.size[k] / 2, scene.cellMm);
      let checked = 0;
      for (let q = 0; q < NX * NY * NZ; q++) {
        const i = q % NX, j = Math.floor(q / NX) % NY, kk = Math.floor(q / (NX * NY));
        const m: Vec3 = [(i + 0.5) * scene.cellMm - scene.origin[0], (j + 0.5) * scene.cellMm - scene.origin[1], (kk + 0.5) * scene.cellMm - scene.origin[2]];
        if (!inCaseMm(m)) continue;
        const d = [0, 1, 2].map(a => m[a] - c[a]);
        const along = d[0] * axis[0] + d[1] * axis[1] + d[2] * axis[2];
        const r = Math.hypot(...d.map((v, a) => v - axis[a] * along));
        // Past the fan's own thickness plus a cell of slack for the grid, and short of the clearance.
        if (Math.abs(along) <= halfEff || Math.abs(along) > halfEff + FAN_CLEARANCE_MM - 0.01 || r > tip * 0.9) continue;
        // The case wall at the disc's own face is a shell cell; the wall is open there or this fan has no ring.
        if (hull.some(h => boxContains(h.box, m, scene.cellMm))) continue;
        // Another fan's own frame and hub are drawn parts, not invisible walls.
        if (fans.some(f => f !== s && [0, 1, 2].every(a => Math.abs(m[a] - centerOf(f.box!)[a]) <= f.box!.size[a] / 2 + scene.cellMm))) continue;
        const onShell = i === scene.caseMin[0] || i === scene.caseMax[0] || j === scene.caseMin[1] || j === scene.caseMax[1] || kk === scene.caseMin[2] || kk === scene.caseMax[2];
        if (onShell) continue;
        checked++;
        expect(scene.solid[q], `${file} ${s.key} cell at ${m.map(Math.round)} along ${Math.round(along)} r ${Math.round(r)} in ${scene.obstacles.filter(o => boxContains(o.box, m, scene.cellMm)).map(o => `${o.box.slot}/${o.kind}`)}`).toBe(0);
      }
      expect(checked, s.key).toBeGreaterThan(0);
    }
  });

  it('opens the case wall across each mounted fan ring', () => {
    for (const s of fans) {
      if (!['front', 'rear', 'top', 'bottom', 'left', 'right'].includes(s.position) || s.key.startsWith('rad:')) continue;
      const axis = s.axis as Vec3;
      const k = axis.findIndex(v => Math.abs(v) > 0.5);
      const c = centerOf(s.box!);
      const frame = Math.min(...[0, 1, 2].filter(a => a !== k).map(a => s.box!.size[a]));
      const { tip, hub } = fanRadii(frame);
      const face = axis[k] > 0 ? scene.caseMin[k] : scene.caseMax[k];
      let open = 0, ring = 0;
      const lat = [0, 1, 2].filter(a => a !== k);
      for (let u = -tip; u <= tip; u += scene.cellMm / 2) for (let v = -tip; v <= tip; v += scene.cellMm / 2) {
        const r = Math.hypot(u, v);
        if (r < hub * 1.4 || r > tip * 0.85) continue;
        const m: Vec3 = [c[0], c[1], c[2]];
        m[lat[0]] += u; m[lat[1]] += v;
        m[k] = ((face + 0.5) * scene.cellMm) - scene.origin[k];
        const q = cellAt(m);
        if (q < 0) continue;
        ring++;
        if (!scene.solid[q]) open++;
      }
      expect(ring, s.key).toBeGreaterThan(0);
      expect(open / ring, s.key).toBeGreaterThan(0.9);
    }
  });

  describe('particles', () => {
    const flow = new CpuFlow(scene);
    for (let i = 0; i < 200; i++) flow.step();
    const particles = new CpuParticles(flow, 1500, 5);
    type Sample = { m: Vec3; v: Vec3 };
    const outside: Sample[] = [];
    let violations = 0;
    let solidHits = 0;
    let stalledRuns = 0;
    const calm = new Uint16Array(particles.count);
    const prev = new Float32Array(particles.count * 3);
    const [lo, hi] = [scene.caseBounds.min, scene.caseBounds.max];
        const caseCell = (c: number) => { const i = c % NX, j = Math.floor(c / NX) % NY, k = Math.floor(c / (NX * NY)); return i >= scene.caseMin[0] && i <= scene.caseMax[0] && j >= scene.caseMin[1] && j <= scene.caseMax[1] && k >= scene.caseMin[2] && k <= scene.caseMax[2]; };
    const histogram = new Map<string, number>();
    for (let s = 0; s < 900; s++) {
      prev.set(particles.pos);
      particles.step((_i, from, to) => {
        if (to < 0) return;
        if (scene.solid[to]) violations++;
        if (from >= 0 && !caseCell(from) && caseCell(to) && scene.opening[to] === 0) violations++;
      });
      if (s < 450) continue;
      for (let i = 0; i < particles.count; i++) {
        const o = i * 3;
        if (particles.pos[o] < -1e5 || particles.age[i] < 1) { calm[i] = 0; continue; }
        const q = particles.cellAt(particles.pos[o], particles.pos[o + 1], particles.pos[o + 2]);
        if (q >= 0 && scene.solid[q]) solidHits++;
        if (q < 0 || caseCell(q)) { calm[i] = 0; continue; }
        const d = [0, 1, 2].map(a => particles.pos[o + a] - prev[o + a]);
        if (Math.hypot(...d) > 3) { calm[i] = 0; continue; }
        outside.push({ m: mmOf(particles.pos, o), v: d as Vec3 });
        const key = [0, 1, 2].map(a => Math.floor(particles.pos[o + a] / 3)).join(',');
        histogram.set(key, (histogram.get(key) ?? 0) + 1);
        calm[i] = Math.hypot(...d) < STUCK_MOVE_CELLS ? calm[i] + 1 : 0;
        if (calm[i] === 10) stalledRuns++;
      }
    }

    /** Outside samples in front of a fan's opening, split by how they move along its inward axis. */
    const near = (key: string) => {
      const s = fans.find(f => f.key === key)!;
      const axis = s.axis as Vec3;
      const k = axis.findIndex(v => Math.abs(v) > 0.5);
      const c = centerOf(s.box!);
      const inward = axis[k];
      let n = 0, toward = 0;
      for (const p of outside) {
        const lat = [0, 1, 2].filter(a => a !== k).every(a => Math.abs(p.m[a] - c[a]) <= s.box!.size[a] / 2 + scene.cellMm);
        const beyond = (p.m[k] - c[k]) * inward < -(s.box!.size[k] / 2);
        if (!lat || !beyond || inCaseMm(p.m)) continue;
        n++;
        if (p.v[k] * inward > 0) toward++;
      }
      return { n, toward };
    };
    const mounted = fans.filter(s => ['front', 'rear', 'top', 'bottom', 'left', 'right'].includes(s.position) && !s.key.startsWith('rad:'));
    if (process.env.PROBE) for (const s of mounted) console.log('PROBE', file, s.key, directions[s.key], JSON.stringify(near(s.key)), 'outside total', outside.length, 'stalled', stalledRuns, 'maxbin', Math.max(...histogram.values()));

    it('start outside the case at the intakes and move toward the opening', () => {
      let n = 0, toward = 0;
      for (const s of mounted) if (directions[s.key] === 'intake') { const r = near(s.key); n += r.n; toward += r.toward; }
      expect(n).toBeGreaterThan(40);
      expect(toward / n).toBeGreaterThan(0.7);
    });

    it('leave through the exhausts and keep moving away from the case', () => {
      let n = 0, away = 0;
      for (const s of mounted) if (directions[s.key] === 'exhaust') { const r = near(s.key); n += r.n; away += r.n - r.toward; }
      exhaustSamples.push(n);
      // Whether any air reaches an exhaust depends on the layout's inner chambers; what does leave keeps going out.
      if (n > 0) expect(away / n).toBeGreaterThan(0.7);
    });

    it('stay within the reach of the case and never cross a wall or enter a solid cell', () => {
      const reachCells = OUTSIDE_REACH_MM / scene.cellMm + 1;
      let beyond = 0;
      for (const p of outside) for (let a = 0; a < 3; a++) {
        const cell = (p.m[a] + scene.origin[a]) / scene.cellMm - 0.5;
        if (cell < lo[a] - reachCells || cell > hi[a] + reachCells) beyond++;
      }
      expect(beyond).toBe(0);
      expect(violations).toBe(0);
      expect(solidHits).toBe(0);
    });

    it('leave no stalled stragglers and no dense clump outside', () => {
      expect(outside.length).toBeGreaterThan(200);
      expect(stalledRuns / outside.length).toBeLessThan(0.01);
      const worst = Math.max(...histogram.values());
      expect(worst / outside.length).toBeLessThan(0.12);
    });
  });
});

describe('the exhausts', () => {
  it('send particles out of most of the fixtures', () => {
    expect(exhaustSamples).toHaveLength(FIXTURES.length);
    expect(exhaustSamples.filter(n => n > 15).length).toBeGreaterThanOrEqual(3);
  });
});

describe('the Y70 bottom intakes', () => {
  const { layout, scene } = derive('y70');
  const flow = new CpuFlow(scene);
  for (let i = 0; i < 300; i++) flow.step();
  const [NX, NY] = scene.dims;

  it('pull air past the clearance, up into the case, without stalling at a wall', () => {
    const bottoms = layout.fanSlots.filter(s => s.position === 'bottom' && s.taken === 'fan');
    expect(bottoms.length).toBeGreaterThan(0);
    for (const s of bottoms) {
      const c = centerOf(s.box!);
      const frame = Math.min(s.box!.size[0], s.box!.size[2]);
      const { hub, tip } = fanRadii(frame);
      const x = c[0] + (hub + tip) / 2;
      const speedAt = (y: number) => {
        const i = Math.floor((x + scene.origin[0]) / scene.cellMm), j = Math.floor((y + scene.origin[1]) / scene.cellMm), k = Math.floor((c[2] + scene.origin[2]) / scene.cellMm);
        const q = i + NX * (j + NY * k);
        expect(scene.solid[q], `${s.key} y ${y}`).toBe(0);
        return flow.u[q * 3 + 1];
      };
      const plane = speedAt(c[1]);
      expect(plane).toBeGreaterThan(0);
      for (const beyond of [FAN_CLEARANCE_MM * 0.5, FAN_CLEARANCE_MM, FAN_CLEARANCE_MM + scene.cellMm * 2]) {
        expect(speedAt(c[1] + s.box!.size[1] / 2 + beyond), `${s.key} ${beyond} mm past the fan`).toBeGreaterThan(plane * 0.2);
      }
    }
  });
});

describe('the drawn particle budget', () => {
  it('draws half of the pool at every grid tier, outside air included', () => {
    expect(PARTICLE_DRAW_SHARE).toBeCloseTo(0.5, 10);
    for (const tier of [1, 0.75, 0.5]) expect(drawnParticles(10752, tier)).toBe(Math.round(10752 * tier * 0.5));
  });
});

describe('a face fan keeps its rated speed on both sides of its face', () => {
  it('drives the cells inward of the face to the fan target, in proportion between a slow and a fast fan', () => {
    const input = inputFor([fronts[0], fronts[1], rear], [], defaultDir, 60);
    input.fanCfm = { [fronts[0].key]: 26.4, [fronts[1].key]: 60, [rear.key]: 86.4 };
    input.referenceCfm = 60;
    const scene = buildFlowScene(input, 64 * 48 * 96);
    const [NX, NY] = scene.dims;
    const targetAt = (mm: Vec3) => {
      const c = [0, 1, 2].map(a => Math.floor((mm[a] + scene.origin[a]) / scene.cellMm));
      const o = (c[0] + NX * (c[1] + NY * c[2])) * 3;
      return Math.hypot(scene.target[o], scene.target[o + 1], scene.target[o + 2]);
    };
    // Layout mm: the centre of each fan, moved 60 mm in along its axis, inside the reach.
    const geometry = fanGeometries(input.layout);
    const inward = (key: string): Vec3 => {
      const g = geometry.find(x => x.slot.key === key)!;
      const axis = g.slot.axis ?? [0, 0, 0];
      // Off the hub, on the open ring.
      const lateral = [0, 1, 2].filter(a => Math.abs(axis[a]) < 0.5)[0];
      return [0, 1, 2].map(a => g.box.min[a] + g.box.size[a] / 2 + axis[a] * 60 + (a === lateral ? 40 : 0)) as Vec3;
    };
    expect(OUTSIDE_REACH_MM).toBeGreaterThan(60);
    const slow = targetAt(inward(fronts[0].key));
    const fast = targetAt(inward(fronts[1].key));
    expect(slow).toBeGreaterThan(0);
    expect(slow / fast).toBeGreaterThan(0.38);
    expect(slow / fast).toBeLessThan(0.52);
  });
});
