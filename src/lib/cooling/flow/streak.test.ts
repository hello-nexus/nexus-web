// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCaseLayout, type CaseLayout } from '../caseLayout';
import { visualFlow } from '../visualFlow';
import { CpuParticles } from './cpuParticles';
import { CpuFlow } from './cpuSolver';
import { PARTICLE_MAX_AGE, PARTICLE_REFERENCE_SPEED, PARTICLE_SPEED_SCALE, STREAK_MAX_MM, STREAK_MIN_MM, STREAK_SEGMENTS, STREAK_STEPS } from './flowParams';
import { buildFlowScene } from './gridScene';
import { stepDisplacement, streakEnds, streakOf, streakPath, type Vec3 } from './streak';

const norm = (v: Vec3) => Math.hypot(v[0], v[1], v[2]);

describe('streak geometry', () => {
  it('points along the velocity, tail behind the head', () => {
    const d: Vec3 = [1, -2, 2];
    const { dir } = streakOf(d);
    const m = norm(d);
    expect(dir[0]).toBeCloseTo(d[0] / m, 6);
    expect(dir[1]).toBeCloseTo(d[1] / m, 6);
    expect(dir[2]).toBeCloseTo(d[2] / m, 6);
    const head: Vec3 = [10, 20, 30];
    const { tail } = streakEnds(head, d);
    const back = [head[0] - tail[0], head[1] - tail[1], head[2] - tail[2]];
    expect(back[0] * d[0] + back[1] * d[1] + back[2] * d[2]).toBeGreaterThan(0);
    expect(norm(back)).toBeCloseTo(streakOf(d).length, 6);
  });

  it('grows with speed and is clamped to the bounds', () => {
    const lenAt = (mm: number) => streakOf([mm, 0, 0]).length;
    const a = STREAK_MIN_MM / STREAK_STEPS * 1.5;
    expect(lenAt(a)).toBeCloseTo(a * STREAK_STEPS, 6);
    expect(lenAt(a * 2)).toBeGreaterThan(lenAt(a));
    expect(lenAt(1000)).toBe(STREAK_MAX_MM);
    expect(lenAt(0.0001 * 2)).toBe(STREAK_MIN_MM);
  });

  it('keeps a non-zero stub and a unit direction for a stalled particle', () => {
    const { dir, length } = streakOf([0, 0, 0]);
    expect(length).toBe(STREAK_MIN_MM);
    expect(norm(dir)).toBeCloseTo(1, 6);
    const { head, tail } = streakEnds([5, 5, 5], [0, 0, 0]);
    expect(norm([head[0] - tail[0], head[1] - tail[1], head[2] - tail[2]])).toBeGreaterThan(0);
  });

  it('treats a respawn or absent particle as not moved', () => {
    expect(stepDisplacement([0, 0, 0], [30, 0, 0], 40, 0, 5)).toEqual([0, 0, 0]);
    expect(stepDisplacement([-1e6, 0, 0], [3, 0, 0], 1, 2, 5)).toEqual([0, 0, 0]);
    expect(stepDisplacement([0, 0, 0], [1, 2, 3], 1, 2, 5)).toEqual([5, 10, 15]);
  });
});

const raw = JSON.parse(readFileSync(new URL('../__fixtures__/y70-case-layout.json', import.meta.url), 'utf8')) as { fanSlots: { key: string }[] };
const layout = parseCaseLayout({ ...raw, fanSlots: raw.fanSlots.map(s => ({ ...s, taken: 'fan' })) }) as CaseLayout;

describe('streaks of simulated particles', () => {
  const sim = () => {
    const fanSlots = layout.fanSlots;
    const speeds = new Map(fanSlots.map(s => [s.key, { fraction: 1, estimated: false }]));
    const directions: Record<string, 'intake' | 'exhaust'> = {};
    fanSlots.forEach((s, i) => { directions[s.key] = i % 2 ? 'intake' : 'exhaust'; });
    const v = visualFlow(fanSlots, [], speeds, directions);
    const scene = buildFlowScene({ layout, directions, fanCfm: v.fanCfm, ventCfm: v.ventCfm, referenceCfm: v.referenceCfm }, 32 * 24 * 48);
    const flow = new CpuFlow(scene);
    for (let i = 0; i < 400; i++) flow.step();
    return { flow, cellMm: scene.cellMm };
  };
  const meanLength = (flow: CpuFlow, cellMm: number, speed: number) => {
    const p = new CpuParticles(flow, 400, 3, false);
    let sum = 0;
    let n = 0;
    // The same simulated duration at every speed: a slower speed takes proportionally more steps.
    const steps = Math.round((30 * PARTICLE_SPEED_SCALE) / speed);
    for (let s = 0; s < steps; s++) {
      p.step(undefined, speed);
      if (s < steps / 3) continue;
      for (let i = 0; i < p.count; i++) {
        const { head, tail } = p.streak(i, cellMm);
        const len = norm([head[0] - tail[0], head[1] - tail[1], head[2] - tail[2]]);
        expect(len).toBeGreaterThanOrEqual(STREAK_MIN_MM - 1e-9);
        expect(len).toBeLessThanOrEqual(STREAK_MAX_MM + 1e-9);
        sum += len;
        n++;
      }
    }
    return sum / n;
  };

  it('draws the same trail at every drawn speed, since length follows simulation time', () => {
    const { flow, cellMm } = sim();
    const normal = meanLength(flow, cellMm, 1.5);
    const slow = meanLength(flow, cellMm, 0.25);
    expect(slow).toBeGreaterThanOrEqual(STREAK_MIN_MM);
    expect(Math.abs(slow - normal) / normal).toBeLessThan(0.2);
  }, 60000);

  it('a particle travels the same path before it is recycled at every drawn speed', () => {
    const { flow } = sim();
    const pathBeforeRecycle = (speed: number) => {
      const p = new CpuParticles(flow, 400, 3, false);
      const total = new Float64Array(p.count);
      const done: number[] = [];
      const steps = Math.ceil((PARTICLE_MAX_AGE * 2.2) / speed);
      for (let s = 0; s < steps; s++) {
        const before = Float32Array.from(p.pos);
        const ageBefore = Float32Array.from(p.age);
        p.step(undefined, speed);
        for (let i = 0; i < p.count; i++) {
          const respawned = p.age[i] <= ageBefore[i] && ageBefore[i] >= 0;
          if (p.age[i] < 0 || ageBefore[i] < 0) { total[i] = 0; continue; }
          if (respawned) { if (total[i] > 0) done.push(total[i]); total[i] = 0; continue; }
          total[i] += Math.hypot(p.pos[i * 3] - before[i * 3], p.pos[i * 3 + 1] - before[i * 3 + 1], p.pos[i * 3 + 2] - before[i * 3 + 2]);
        }
      }
      return done.reduce((n, v) => n + v, 0) / Math.max(1, done.length);
    };
    // Speeds that share a sub-step count must match; one sub-step against two changes how a path slides along walls (about a third), which is independent of age.
    const close = (a: number, b: number) => expect(Math.abs(a - b) / b).toBeLessThan(0.25);
    const fast = pathBeforeRecycle(PARTICLE_REFERENCE_SPEED);
    expect(fast).toBeGreaterThan(0);
    close(pathBeforeRecycle(PARTICLE_SPEED_SCALE), fast);
    const global = pathBeforeRecycle(0.6);
    close(pathBeforeRecycle(0.15), global);
  }, 600000);

  it('streak direction equals the particle displacement direction', () => {
    const { flow, cellMm } = sim();
    const p = new CpuParticles(flow, 400, 3, false);
    for (let s = 0; s < 20; s++) p.step(undefined, 1.5);
    const before = Float32Array.from(p.pos);
    p.step(undefined, 1.5);
    let checked = 0;
    for (let i = 0; i < p.count; i++) {
      const d: Vec3 = [(p.pos[i * 3] - before[i * 3]) * cellMm, (p.pos[i * 3 + 1] - before[i * 3 + 1]) * cellMm, (p.pos[i * 3 + 2] - before[i * 3 + 2]) * cellMm];
      const m = norm(d);
      if (m < 0.05 || m > 5 * cellMm) continue;
      const { head, tail } = p.streak(i, cellMm);
      const back = [head[0] - tail[0], head[1] - tail[1], head[2] - tail[2]];
      const bm = norm(back);
      expect((back[0] * d[0] + back[1] * d[1] + back[2] * d[2]) / (bm * m)).toBeCloseTo(1, 4);
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
  }, 60000);
});

describe('streak tuning', () => {
  it('pins the streak reach and the particle draw share', async () => {
    const { PARTICLE_DRAW_SHARE } = await import('./flowParams');
    expect([STREAK_STEPS, STREAK_MAX_MM, STREAK_MIN_MM]).toEqual([10, 70, 3]);
    expect(PARTICLE_DRAW_SHARE).toBe(0.1);
  });
});

describe('streak path', () => {
  const cellMm = 10;
  const d: Vec3 = [1, 0, 0];
  const total = (path: Vec3[]) => path.slice(1).reduce((n, p, i) => n + Math.hypot(p[0] - path[i][0], p[1] - path[i][1], p[2] - path[i][2]), 0) * cellMm;

  it('walks straight back through a uniform field, as long as the streak', () => {
    const path = streakPath([50, 50, 50], d, cellMm, () => [1, 0, 0], () => false);
    expect(path).toHaveLength(STREAK_SEGMENTS + 1);
    expect(total(path)).toBeCloseTo(streakOf(d).length, 6);
    expect(path[STREAK_SEGMENTS][1]).toBeCloseTo(50, 9);
    expect(path[STREAK_SEGMENTS][0]).toBeLessThan(50);
  });

  it('bends where the field bends', () => {
    const path = streakPath([50, 50, 50], [6, 0, 0], cellMm, p => (p[0] < 48 ? [0, 1, 0] : [1, 0, 0]), () => false);
    const tail = path[STREAK_SEGMENTS];
    expect(tail[1]).toBeLessThan(50);
  });

  it('stays put against a solid and keeps its direction in dead air', () => {
    const blocked = streakPath([50, 50, 50], d, cellMm, () => [1, 0, 0], () => true);
    expect(blocked.every(p => p[0] === 50)).toBe(true);
    const still = streakPath([50, 50, 50], d, cellMm, () => [0, 0, 0], () => false);
    expect(still[STREAK_SEGMENTS][0]).toBeLessThan(50);
  });
});
