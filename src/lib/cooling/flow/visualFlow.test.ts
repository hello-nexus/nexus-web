// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseCaseLayout, type CaseLayout } from '../caseLayout';
import { simRpm, visualFlowCfm, type SlotSpeed } from '../fanSpeed';
import { visualFlow } from '../visualFlow';
import { CpuParticles } from './cpuParticles';
import { CpuFlow } from './cpuSolver';
import { buildFlowScene } from './gridScene';

const raw = JSON.parse(readFileSync(new URL('../__fixtures__/y70-case-layout.json', import.meta.url), 'utf8')) as { fanSlots: { key: string }[] };
const LOW = 32 * 24 * 48;
const catalog: never[] = [];

const layoutWith = (keys: string[]): CaseLayout =>
  parseCaseLayout({ ...raw, fanSlots: raw.fanSlots.map(s => (keys.includes(s.key) ? { ...s, taken: 'fan' } : s)) }) as CaseLayout;

const flowFor = (layout: CaseLayout, fractions: Record<string, number>, intakes: string[]) => {
  const speeds = new Map<string, SlotSpeed>(Object.entries(fractions).map(([k, f]) => [k, { fraction: f, estimated: false }]));
  const directions: Record<string, 'intake' | 'exhaust'> = {};
  for (const s of layout.fanSlots) directions[s.key] = intakes.includes(s.key) ? 'intake' : 'exhaust';
  const v = visualFlow(layout.fanSlots, catalog, speeds, directions);
  return { directions, ...v };
};

const meanSpeed = (layout: CaseLayout, f: ReturnType<typeof flowFor>, steps = 40) => {
  const scene = buildFlowScene({ layout, directions: f.directions, fanCfm: f.fanCfm, ventCfm: f.ventCfm, referenceCfm: f.referenceCfm }, LOW);
  const sim = new CpuFlow(scene);
  for (let i = 0; i < 500; i++) sim.step();
  const particles = new CpuParticles(sim, 600, 5, false);
  // Air speed where the pool starts, before lifetimes and respawns skew how long particles sit in fast or slow air.
  const u = [0, 0, 0];
  let born = 0;
  for (let i = 0; i < particles.count; i++) {
    sim.sample(particles.pos[i * 3], particles.pos[i * 3 + 1], particles.pos[i * 3 + 2], u);
    born += Math.hypot(u[0], u[1], u[2]);
  }
  const birth = born / particles.count;
  // Mean cells per step over the first steps of a fresh pool, before lifetimes and respawns skew the time spent near the fan; respawn jumps left out.
  let sum = 0;
  let n = 0;
  let prev = Float32Array.from(particles.pos);
  for (let s = 0; s < steps; s++) {
    particles.step();
    for (let i = 0; i < particles.count; i++) {
      const d = Math.hypot(particles.pos[i * 3] - prev[i * 3], particles.pos[i * 3 + 1] - prev[i * 3 + 1], particles.pos[i * 3 + 2] - prev[i * 3 + 2]);
      if (d < 3) { sum += d; n++; }
    }
    prev = Float32Array.from(particles.pos);
  }
  const mean = n ? sum / n : 0;
  return { scene, mean, birth };
};

describe('visual flow compression', () => {
  it('keeps any spinning fan moving and a stopped one still', () => {
    expect(visualFlowCfm(60, 0)).toBe(0);
    expect(visualFlowCfm(60, 0.01)).toBeGreaterThan(60 * 0.4);
    const ratio = visualFlowCfm(60, 500 / 2500) / visualFlowCfm(60, 1);
    expect(ratio).toBeGreaterThan(0.45);
    expect(ratio).toBeLessThan(0.6);
  });

  it('parses simulated channel ids and clamps them', () => {
    expect(simRpm('sim:1300')).toBe(1300);
    expect(simRpm('sim:9999')).toBe(3000);
    expect(simRpm('sim:-5')).toBe(0);
    expect(simRpm('pwm:1')).toBeNull();
  });

  it('shows 500 and 2500 rpm on one face as clearly moving, the slow one about half as fast', () => {
    const layout = layoutWith(['right:120:1']);
    const slow = meanSpeed(layout, flowFor(layout, { 'right:120:1': 0.2 }, ['right:120:1']));
    const fast = meanSpeed(layout, flowFor(layout, { 'right:120:1': 1 }, ['right:120:1']));
    expect(slow.mean).toBeGreaterThan(0.005);
    const ratio = slow.birth / fast.birth;
    expect(ratio).toBeGreaterThan(0.45);
    expect(ratio).toBeLessThan(0.6);
  }, 120000);

  it('runs rpm 0 as no flow', () => {
    const layout = layoutWith(['right:120:1']);
    const f = flowFor(layout, { 'right:120:1': 0 }, ['right:120:1']);
    expect(f.fanCfm['right:120:1']).toBe(0);
    const scene = buildFlowScene({ layout, directions: f.directions, fanCfm: f.fanCfm, ventCfm: f.ventCfm, referenceCfm: f.referenceCfm }, LOW);
    expect(scene.emitters.length).toBe(0);
  });

  it('T1 setup: every spinning intake emits and moves though nothing exhausts', () => {
    const keys = ['bottom:120:1', 'right:120:1', 'right:120:2', 'top:120:0'];
    const layout = layoutWith(keys);
    const f = flowFor(layout, { 'bottom:120:1': 0.72, 'right:120:1': 0.39, 'right:120:2': 0.39, 'top:120:0': 0 }, keys.slice(0, 3));
    expect(f.fanCfm['top:120:0']).toBe(0);
    for (const k of keys.slice(0, 3)) expect(f.fanCfm[k]).toBeGreaterThan(20);
    const slowest = Math.min(...keys.slice(0, 3).map(k => f.fanCfm[k]));
    const fastest = Math.max(...keys.slice(0, 3).map(k => f.fanCfm[k]));
    expect(slowest / fastest).toBeGreaterThan(0.45);
    const { scene, mean } = meanSpeed(layout, f);
    // Each spinning fan holds emitter entries near its own ring.
    const e = scene.emitters;
    const owners = new Set<string>();
    for (let o = 0; o < e.length; o += 12) owners.add(`${Math.round(e[o])},${Math.round(e[o + 1])},${Math.round(e[o + 2])}`);
    expect(owners.size).toBeGreaterThanOrEqual(3);
    expect(mean).toBeGreaterThan(0.005);
  }, 120000);
});
