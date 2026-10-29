// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { FanChannel } from '../../../api/cooling';
import { parseCaseLayout, type CaseFanSlot, type CaseLayout, type FanBinding } from '../caseLayout';
import type { FanDirection } from '../pressureModel';
import { boundSlotKeys, lumpedModel, slotDirections, slotSpeeds, withDefaultBindings } from '../slotFlow';
import { visualFlow } from '../visualFlow';
import { CpuParticles } from './cpuParticles';
import { CpuFlow } from './cpuSolver';
import { buildFlowScene } from './gridScene';

// The exhaust fan pushes harder as the case pressurizes, so it follows the intake.
// The T1 setup on the real Y70 layout: Fan #1 exhausts at the rear, Fans #2 and #5 take air in on the right panel at about 600 rpm with no top speed.
const raw = JSON.parse(readFileSync(new URL('../__fixtures__/y70-case-layout.json', import.meta.url), 'utf8')) as { boxes: unknown[]; fanSlots: { key: string }[] };
// T1's vertical graphics card (304 x 125 x 38.6) with its two fans.
const verticalGpu = { slot: 'gpu', role: 'part', min: [150, 150, 12], size: [125, 304, 38.6], fans: { axis: 'z', side: 'min', count: 2, diameter: 90 } };
const LOW = 32 * 24 * 48;
const catalog: never[] = [];

type Channel = Pick<FanChannel, 'id' | 'rpm' | 'dutyPercent' | 'maxRpm' | 'isGpu' | 'kind'>;
interface State {
  channels: Channel[];
  bindings: FanBinding[];
  overrides: Record<string, FanDirection>;
}

const ch = (id: string, rpm: number, extra: Partial<Channel> = {}): Channel => ({ id, rpm, dutyPercent: 40, ...extra });
const baseline = (): State => ({
  channels: [ch('fan-1', 1800), ch('fan-2', 600), ch('fan-5', 600), ch('gpu-fan', 0, { isGpu: true })],
  bindings: [
    { channelId: 'fan-1', slotKeys: ['rear:120:0'] },
    { channelId: 'fan-2', slotKeys: ['right:120:1'] },
    { channelId: 'fan-5', slotKeys: ['right:120:2'] },
  ],
  overrides: {},
});

const derive = (s: State) => {
  const bindings = withDefaultBindings(s.bindings, ['gpu:fan:0', 'gpu:fan:1', ...raw.fanSlots.map(f => f.key)].map(key => ({ key, taken: null })), s.channels);
  const keys = boundSlotKeys(bindings, s.channels);
  const layout = parseCaseLayout({ ...raw, boxes: [...raw.boxes, verticalGpu], fanSlots: raw.fanSlots.map(f => (keys.includes(f.key) ? { ...f, taken: 'fan' } : f)) }) as CaseLayout;
  const speeds = slotSpeeds(layout.fanSlots, bindings, s.channels);
  const directions = slotDirections(layout.fanSlots, s.overrides);
  const lumped = lumpedModel(layout.fanSlots, catalog, speeds, directions);
  const visual = visualFlow(layout.fanSlots, catalog, speeds, directions);
  const scene = buildFlowScene({ layout, directions, fanCfm: visual.fanCfm, ventCfm: visual.ventCfm, referenceCfm: visual.referenceCfm }, LOW);
  return { layout, speeds, directions, lumped, visual, scene };
};

const withChannel = (s: State, c: Channel): State => ({ ...s, channels: [...s.channels.filter(x => x.id !== c.id), c] });
const setRpm = (id: string, rpm: number) => (s: State): State => ({ ...s, channels: s.channels.map(c => (c.id === id ? { ...c, rpm } : c)) });
const bindSim = (rpm: number, slots: string[]) => (s: State): State => ({ ...s, bindings: [...s.bindings, { channelId: `sim:${rpm}`, slotKeys: slots }] });

type Move = 'up' | 'down' | 'same';
const cases: { name: string; edit: (s: State) => State; intake: Move; exhaust: Move }[] = [
  ...[[0, 'down'], [500, 'down'], [1500, 'up'], [2500, 'up']].map(([rpm, intake]) => ({
    name: `real fan at ${rpm} rpm`, edit: setRpm('fan-2', rpm as number), intake: intake as Move, exhaust: intake as Move,
  })),
  ...[[0, 'same'], [100, 'up'], [500, 'up'], [1500, 'up'], [3000, 'up']].map(([rpm, intake]) => ({
    name: `sim fan at ${rpm} rpm`, edit: bindSim(rpm as number, ['bottom:120:0']), intake: intake as Move, exhaust: intake as Move,
  })),
  { name: 'bind a real fan', edit: s => ({ ...withChannel(s, ch('fan-4', 1500)), bindings: [...s.bindings, { channelId: 'fan-4', slotKeys: ['right:120:0'] }] }), intake: 'up', exhaust: 'up' },
  { name: 'unbind a real fan', edit: s => ({ ...s, bindings: s.bindings.filter(b => b.channelId !== 'fan-5') }), intake: 'down', exhaust: 'down' },
  { name: 'place a sim fan then remove it', edit: s => ({ ...bindSim(1500, ['bottom:120:0'])(s), bindings: s.bindings }), intake: 'same', exhaust: 'same' },
  { name: 'move a real fan between slots', edit: s => ({ ...s, bindings: s.bindings.map(b => (b.channelId === 'fan-2' ? { ...b, slotKeys: ['bottom:120:0'] } : b)) }), intake: 'same', exhaust: 'same' },
  ...[900, 2000].map(rpm => ({
    name: `GPU channel at ${rpm} rpm (outside the case totals)`, edit: setRpm('gpu-fan', rpm), intake: 'same' as Move, exhaust: 'same' as Move,
  })),
  { name: 'GPU channel at 900 rpm with a none override', edit: s => ({ ...setRpm('gpu-fan', 900)(s), bindings: [...s.bindings, { channelId: 'none', slotKeys: ['gpu:fan:0', 'gpu:fan:1'] }] }), intake: 'same', exhaust: 'same' },
  { name: 'a user binding on a GPU fan slot', edit: s => ({ ...setRpm('gpu-fan', 900)(s), bindings: [...s.bindings, { channelId: 'fan-2', slotKeys: ['gpu:fan:0'] }] }), intake: 'same', exhaust: 'same' },
  { name: 'flip intake to exhaust', edit: s => ({ ...s, overrides: { 'right:120:1': 'exhaust' } }), intake: 'down', exhaust: 'down' },
  { name: 'flip exhaust to intake', edit: s => ({ ...s, overrides: { 'rear:120:0': 'intake' } }), intake: 'up', exhaust: 'down' },
  { name: 'one real channel on three slots', edit: s => ({ ...withChannel(s, ch('splitter', 1500)), bindings: [...s.bindings, { channelId: 'splitter', slotKeys: ['bottom:120:0', 'bottom:120:1', 'right:120:0'] }] }), intake: 'up', exhaust: 'up' },
  { name: 'one sim fan on three slots', edit: bindSim(1500, ['bottom:120:0', 'bottom:120:1', 'right:120:0']), intake: 'up', exhaust: 'up' },
];

const delta = (a: number, b: number, move: Move) => {
  if (move === 'same') expect(b).toBeCloseTo(a, 6);
  else if (move === 'up') expect(b).toBeGreaterThan(a + 1e-6);
  else expect(b).toBeLessThan(a - 1e-6);
};

const sumSpeed = (sim: CpuFlow, solid: Uint8Array) => {
  let sum = 0;
  for (let c = 0; c < solid.length; c++) if (!solid[c]) sum += Math.hypot(sim.u[c * 3], sim.u[c * 3 + 1], sim.u[c * 3 + 2]);
  return sum;
};

describe('fan edit matrix on the T1 setup', () => {
  const before = derive(baseline());

  it('starts from spinning fans that all move and emit', () => {
    expect(before.lumped.result.intakeCfm).toBeGreaterThan(0);
    for (const k of ['right:120:1', 'right:120:2']) {
      expect(before.visual.fanCfm[k]).toBeGreaterThan(10);
      expect(before.scene.emitterCounts[k]).toBeGreaterThan(0);
    }
  });

  for (const c of cases) {
    it(`${c.name}: stats move the right way, every spinning fan emits, the solver stays live`, () => {
      const after = derive(c.edit(baseline()));
      delta(before.lumped.result.intakeCfm, after.lumped.result.intakeCfm, c.intake);
      delta(before.lumped.result.exhaustCfm, after.lumped.result.exhaustCfm, c.exhaust);
      for (const [key, cfm] of Object.entries(after.visual.fanCfm)) {
        const intake = after.directions[key.split('#')[0]] === 'intake';
        const rpmZero = after.speeds.get(key)?.fraction === 0;
        // A stopped fan forces no flow; its open slot may still admit air when the case is under negative pressure.
        if (rpmZero) { expect(cfm).toBe(0); continue; }
        expect(cfm).toBeGreaterThan(0);
        if (intake) expect(after.scene.emitterCounts[key]).toBeGreaterThan(0);
      }

      // The grid never changes under a fan edit, so the update is warm: same solver and particle buffers, field kept.
      expect(after.scene.dims).toEqual(before.scene.dims);
      const sim = new CpuFlow(before.scene);
      for (let i = 0; i < 40; i++) sim.step();
      const particles = new CpuParticles(sim, 300, 3);
      for (let i = 0; i < 20; i++) particles.step();
      const velocity = sim.u;
      const positions = particles.pos;
      const kept = sumSpeed(sim, after.scene.solid);
      sim.setScene(after.scene);
      expect(sim.u).toBe(velocity);
      expect(particles.pos).toBe(positions);
      expect(sumSpeed(sim, after.scene.solid)).toBeGreaterThan(kept * 0.5);
      const prev = Float32Array.from(positions);
      particles.step();
      let jumped = 0;
      for (let i = 0; i < particles.count; i++) {
        if (Math.hypot(positions[i * 3] - prev[i * 3], positions[i * 3 + 1] - prev[i * 3 + 1], positions[i * 3 + 2] - prev[i * 3 + 2]) > 3) jumped++;
      }
      expect(jumped).toBeLessThan(particles.count * 0.25);
    }, 60000);
  }

  it('gives a real fan and a sim fan at equal rpm equal flow, stats and emitters', () => {
    const real = derive(setRpm('fan-2', 500)(baseline()));
    const simState = baseline();
    simState.bindings = simState.bindings.map(b => (b.channelId === 'fan-2' ? { channelId: 'sim:500', slotKeys: b.slotKeys } : b));
    const sim = derive(simState);
    expect(sim.visual).toEqual(real.visual);
    expect(sim.lumped.result).toEqual(real.lumped.result);
    expect(sim.scene.emitterCounts).toEqual(real.scene.emitterCounts);
  });

  it('keeps every slot of one sim fan at the same flow', () => {
    const s = derive(bindSim(1500, ['bottom:120:0', 'bottom:120:1', 'right:120:0'])(baseline()));
    const flows = ['bottom:120:0', 'bottom:120:1', 'right:120:0'].map(k => s.visual.fanCfm[k]);
    expect(new Set(flows).size).toBe(1);
    expect(flows[0]).toBeGreaterThan(0);
  });

  it('separates sim:500 from sim:2500 on one slot in both the stats and the flow', () => {
    const low = derive(bindSim(500, ['bottom:120:0'])(baseline()));
    const high = derive(bindSim(2500, ['bottom:120:0'])(baseline()));
    expect(high.lumped.result.intakeCfm).toBeGreaterThan(low.lumped.result.intakeCfm);
    expect(high.lumped.result.pressurePa).not.toBe(low.lumped.result.pressurePa);
    expect(high.visual.fanCfm['bottom:120:0']).toBeGreaterThan(low.visual.fanCfm['bottom:120:0']);
  });
});

describe('one real channel on many slots', () => {
  it('runs every slot at the channel rpm and full per-fan flow, and the stats count all three', () => {
    const slots3 = ['bottom:120:0', 'bottom:120:1', 'right:120:0'];
    const one: State = { ...baseline(), channels: [...baseline().channels, ch('splitter', 1500)], bindings: [...baseline().bindings, { channelId: 'splitter', slotKeys: ['bottom:120:0'] }] };
    const three: State = { ...one, bindings: [...baseline().bindings, { channelId: 'splitter', slotKeys: slots3 }] };
    const a = derive(one);
    const b = derive(three);
    const flows = slots3.map(k => b.visual.fanCfm[k]);
    expect(new Set(flows).size).toBe(1);
    // Three fans on one case raise its pressure, so each runs no faster than the lone fan did.
    expect(flows[0]).toBeGreaterThan(0);
    expect(flows[0]).toBeLessThanOrEqual(a.visual.fanCfm['bottom:120:0']);
    expect(slots3.every(k => b.scene.emitterCounts[k] > 0)).toBe(true);
    expect(b.lumped.fanCount).toBe(a.lumped.fanCount + 2);
    expect(b.lumped.result.intakeCfm).toBeGreaterThan(a.lumped.result.intakeCfm);
  });
});

describe('AIO radiator fans on the shared path', () => {
  const rad = (count = 3): CaseFanSlot[] => [
    { key: 'top:120:0', position: 'top', size: 120, index: 0, taken: 'radiator', radiator: { fanCount: count } },
    ...Array.from({ length: count }, (_, i): CaseFanSlot => ({ key: `rad:${i}`, position: 'top', size: 120, index: i, taken: 'fan', fan: { airflowCfm: 60, staticPressureMmH2O: 2 } })),
  ];
  const aio = [ch('aio-fan', 1200, { isAio: true }), ch('pump', 2800, { isAio: true, kind: 'Pump' }), ch('fan-2', 800)];
  const keys360 = ['rad:0', 'rad:1', 'rad:2'];
  const run = (slots: CaseFanSlot[], bindings: FanBinding[], channels: Channel[]) => {
    const effective = withDefaultBindings(bindings, slots, channels);
    const speeds = slotSpeeds(slots, effective, channels);
    const directions = slotDirections(slots, {});
    return { effective, speeds, lumped: lumpedModel(slots, catalog, speeds, directions), visual: visualFlow(slots, catalog, speeds, directions) };
  };

  it('binds every fan of a mounted 360 radiator to the AIO fan channel, not the pump', () => {
    expect(withDefaultBindings([], rad(), aio)).toEqual([{ channelId: 'aio-fan', slotKeys: keys360 }]);
  });

  it('runs a 360 top radiator as 3 spinning fans at equal flow that all count in the stats', () => {
    const r = run(rad(), [], aio);
    expect(keys360.map(k => r.visual.fanCfm[k] > 0)).toEqual([true, true, true]);
    expect(new Set(keys360.map(k => r.visual.fanCfm[k])).size).toBe(1);
    expect(r.lumped.fanCount).toBe(3);
  });

  it('stops only the fan a none binding names', () => {
    const r = run(rad(), [{ channelId: 'none', slotKeys: ['rad:1'] }], aio);
    expect(r.visual.fanCfm['rad:1']).toBe(0);
    expect(r.visual.fanCfm['rad:0']).toBeGreaterThan(0);
    expect(r.visual.fanCfm['rad:2']).toBeGreaterThan(0);
    expect(r.effective).toEqual([{ channelId: 'none', slotKeys: ['rad:1'] }, { channelId: 'aio-fan', slotKeys: ['rad:0', 'rad:2'] }]);
  });

  it('lets a user binding win on one radiator fan and drives nothing from a binding on a covered case slot', () => {
    const named = withDefaultBindings([{ channelId: 'fan-2', slotKeys: ['rad:1'] }], rad(), aio);
    expect(named.find(b => b.slotKeys.includes('rad:1'))?.channelId).toBe('fan-2');
    expect(named.find(b => b.slotKeys.includes('rad:0'))?.channelId).toBe('aio-fan');
    const r = run(rad(), [{ channelId: 'fan-2', slotKeys: ['top:120:0'] }], aio);
    expect(r.speeds.has('top:120:0')).toBe(false);
    expect(r.lumped.fanCount).toBe(3);
  });

  it('moves the stats with the AIO fan rpm', () => {
    const at = (rpm: number) => run(rad(), [], [ch('aio-fan', rpm, { isAio: true })]);
    const [slow, fast] = [at(500), at(2000)];
    expect(fast.lumped.result.exhaustCfm).toBeGreaterThan(slow.lumped.result.exhaustCfm);
    expect(at(0).visual.fanCfm['rad:0']).toBe(0);
    expect(slow.visual.fanCfm['rad:0']).toBeGreaterThan(0);
  });
});

describe('GPU fans on the shared path', () => {
  const gpuSlot = (index: number): CaseFanSlot => ({ key: `gpu:fan:${index}`, position: 'gpu', size: 92, index, taken: 'fan' });
  const slots = [gpuSlot(0), gpuSlot(1)];
  const keys = slots.map(s => s.key);
  const gpu = (rpm: number): Channel => ch('gpu-fan', rpm, { isGpu: true });
  const run = (bindings: FanBinding[], channels: Channel[]) => {
    const effective = withDefaultBindings(bindings, slots, channels);
    const speeds = slotSpeeds(slots, effective, channels);
    const directions = slotDirections(slots, {});
    return { effective, speeds, lumped: lumpedModel(slots, catalog, speeds, directions), visual: visualFlow(slots, catalog, speeds, directions) };
  };

  it('binds both GPU fan slots to the GPU channel when nothing is stored, derived and not written', () => {
    const stored: FanBinding[] = [];
    const r = run(stored, [gpu(900)]);
    expect(r.effective).toEqual([{ channelId: 'gpu-fan', slotKeys: keys }]);
    expect(stored).toEqual([]);
  });

  it('maps several GPU channels in order', () => {
    const r = withDefaultBindings([], slots, [ch('g0', 500, { isGpu: true }), ch('g1', 500, { isGpu: true })]);
    expect(r).toEqual([{ channelId: 'g0', slotKeys: ['gpu:fan:0'] }, { channelId: 'g1', slotKeys: ['gpu:fan:1'] }]);
  });

  it('lets a stored binding win and a none binding stop the default', () => {
    const user = run([{ channelId: 'fan-2', slotKeys: ['gpu:fan:0'] }], [gpu(900), ch('fan-2', 1500)]);
    expect(user.effective.find(b => b.slotKeys.includes('gpu:fan:0'))?.channelId).toBe('fan-2');
    expect(user.effective.find(b => b.slotKeys.includes('gpu:fan:1'))?.channelId).toBe('gpu-fan');
    const none = run([{ channelId: 'none', slotKeys: keys }], [gpu(900)]);
    expect([...none.speeds.values()].every(v => v.fraction === 0)).toBe(true);
    expect(none.visual.fanCfm['gpu:fan:0']).toBe(0);
    expect(none.effective).toEqual([{ channelId: 'none', slotKeys: keys }]);
  });

  it('gives no flow at 0 rpm and flow above it, and keeps GPU fans out of the case totals', () => {
    const idle = run([], [gpu(0)]);
    expect(idle.visual.fanCfm['gpu:fan:0']).toBe(0);
    const spinning = run([], [gpu(900)]);
    expect(spinning.visual.fanCfm['gpu:fan:0']).toBeGreaterThan(0);
    expect(spinning.visual.fanCfm['gpu:fan:0']).toBe(spinning.visual.fanCfm['gpu:fan:1']);
    const faster = run([], [gpu(2000)]);
    expect(faster.visual.fanCfm['gpu:fan:0']).toBeGreaterThan(spinning.visual.fanCfm['gpu:fan:0']);
    for (const r of [idle, spinning, faster]) {
      expect(r.lumped.fanCount).toBe(0);
      expect(r.lumped.result.intakeCfm).toBe(0);
      expect(r.lumped.result.exhaustCfm).toBe(0);
      expect(r.visual.ventCfm).toBe(0);
    }
  });

  it('defaults GPU fans to intake and honors a stored direction', () => {
    expect(slotDirections(slots, {})['gpu:fan:0']).toBe('intake');
    expect(slotDirections(slots, { 'gpu:fan:0': 'exhaust' })['gpu:fan:0']).toBe('exhaust');
  });
});
