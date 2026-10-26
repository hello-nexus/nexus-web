// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCaseLayout, type CaseLayout } from '../caseLayout';
import { visualFlow } from '../visualFlow';
import { CpuParticles } from './cpuParticles';
import { CpuFlow } from './cpuSolver';
import { STREAK_MAX_MM, STREAK_MIN_MM, STREAK_STEPS } from './flowParams';
import { buildFlowScene } from './gridScene';
import { stepDisplacement, streakEnds, streakOf, type Vec3 } from './streak';

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
    for (let s = 0; s < 30; s++) {
      p.step(undefined, speed);
      if (s < 10) continue;
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

  it('slow motion draws shorter streaks, never zero-length ones', () => {
    const { flow, cellMm } = sim();
    const normal = meanLength(flow, cellMm, 1.5);
    const slow = meanLength(flow, cellMm, 0.25);
    expect(slow).toBeLessThan(normal);
    expect(slow).toBeGreaterThanOrEqual(STREAK_MIN_MM);
  }, 60000);

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
    expect(PARTICLE_DRAW_SHARE).toBe(0.5);
  });
});
