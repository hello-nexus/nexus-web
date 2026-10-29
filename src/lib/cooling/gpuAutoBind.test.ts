// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { collapseMounts, NONE_CHANNEL, parseCaseLayout, SIM_RPM_UNASSIGNED, simChannelId, type CaseLayout } from './caseLayout';
import { boundSlotKeys, lumpedModel, slotDirections, slotSpeeds, withDefaultBindings } from './slotFlow';

const raw = JSON.parse(readFileSync(new URL('./__fixtures__/y70-case-layout.json', import.meta.url), 'utf8')) as { boxes: object[]; fanSlots: object[] };

// The Y70 box's channels: the NVIDIA GPU fan channels (no maxRpm), a motherboard header and a hub port.
const channels = (gpuRpm: number) => [
  { id: '/lpc/nct6798d/0/control/0', name: 'Fan #1', rpm: 0, dutyPercent: 61, isGpu: false, isAio: false, kind: 'Fan' },
  { id: '/gpu-nvidia/0/control/1', name: 'GPU Fan 1', rpm: gpuRpm, dutyPercent: 40, isGpu: true, isAio: false, kind: 'Fan' },
  { id: '/gpu-nvidia/0/control/2', name: 'GPU Fan 2', rpm: gpuRpm, dutyPercent: 40, isGpu: true, isAio: false, kind: 'Fan' },
  { id: 'minihub:205D36703632:port1', name: 'Port 1 Fan', rpm: 1200, dutyPercent: 50, isGpu: false, isAio: false, kind: 'Fan' },
];

// The card Build lays out for a GPU it only knows by chip: no maker fan data, so estimated fans on a long card.
const gpuBox = { slot: 'gpu', role: 'part', min: [40, 90, 150], size: [300, 55, 125], source: 'estimate', fans: { axis: 'y', side: 'min', count: 3, diameter: 84, source: 'estimate' } };
const withGpu = () => parseCaseLayout({ ...raw, boxes: [...raw.boxes, gpuBox] }) as CaseLayout;
const placeFans = (layout: CaseLayout, keys: string[]): CaseLayout => ({ ...layout, fanSlots: layout.fanSlots.map(s => (keys.includes(s.key) ? { ...s, taken: 'fan' as const } : s)) });

describe('the Y70 box with an estimated GPU and no case fans', () => {
  const layout = withGpu();
  const gpuKeys = layout.fanSlots.filter(s => s.key.startsWith('gpu:fan:')).map(s => s.key);

  it('lays out one slot per estimated card fan', () => {
    expect(gpuKeys).toEqual(['gpu:fan:0', 'gpu:fan:1', 'gpu:fan:2']);
  });

  it('binds every GPU fan to the GPU channels with no stored binding, the last channel shared', () => {
    const effective = withDefaultBindings([], layout.fanSlots, channels(1858));
    expect(effective.find(b => b.channelId === '/gpu-nvidia/0/control/1')?.slotKeys).toEqual(['gpu:fan:0']);
    expect(effective.find(b => b.channelId === '/gpu-nvidia/0/control/2')?.slotKeys).toEqual(['gpu:fan:1', 'gpu:fan:2']);
    expect(effective.some(b => b.slotKeys.some(k => !k.startsWith('gpu:fan:')))).toBe(false);
  });

  it('blows at the live GPU fan speed and counts as installed', () => {
    const effective = withDefaultBindings([], layout.fanSlots, channels(1858));
    expect(boundSlotKeys(effective, channels(1858))).toEqual(expect.arrayContaining(gpuKeys));
    const speeds = slotSpeeds(layout.fanSlots, effective, channels(1858));
    for (const k of gpuKeys) expect(speeds.get(k)?.fraction).toBeGreaterThan(0.7);
    const collapsed = collapseMounts(layout, boundSlotKeys(effective, channels(1858))).layout;
    expect(collapsed.fanSlots.filter(s => s.taken === 'fan').map(s => s.key)).toEqual(gpuKeys);
  });

  it('reads stopped GPU fans as idle', () => {
    const effective = withDefaultBindings([], layout.fanSlots, channels(0));
    const speeds = slotSpeeds(layout.fanSlots, effective, channels(0));
    for (const k of gpuKeys) expect(speeds.get(k)?.fraction).toBe(0);
  });

  it('keeps empty case mounts unbound, so a Y70 with no case fans shows only the GPU fans', () => {
    const effective = withDefaultBindings([], layout.fanSlots, channels(1858));
    expect(effective.flatMap(b => b.slotKeys).filter(k => !k.startsWith('gpu:'))).toEqual([]);
    const speeds = slotSpeeds(layout.fanSlots, effective, channels(1858));
    const model = lumpedModel(layout.fanSlots, [], speeds, slotDirections(layout.fanSlots, {}));
    expect(model.fanCount).toBe(0);
  });

  it('lets an explicit none win over the GPU default', () => {
    const effective = withDefaultBindings([{ channelId: NONE_CHANNEL, slotKeys: ['gpu:fan:1'] }], layout.fanSlots, channels(1858));
    expect(effective.flatMap(b => b.slotKeys).filter(k => k === 'gpu:fan:1')).toHaveLength(1);
    expect(effective.find(b => b.slotKeys.includes('gpu:fan:1'))?.channelId).toBe(NONE_CHANNEL);
  });
});

describe('installed case fans with no link', () => {
  const layout = placeFans(withGpu(), ['front:120:0', 'rear:120:0', 'top:120:0'].filter(k => withGpu().fanSlots.some(s => s.key === k)));
  const installed = layout.fanSlots.filter(s => s.taken === 'fan' && !s.key.startsWith('gpu:')).map(s => s.key);

  it('are simulated at the unassigned speed', () => {
    expect(installed.length).toBeGreaterThan(0);
    const effective = withDefaultBindings([], layout.fanSlots, channels(1858));
    const sim = effective.find(b => b.channelId === simChannelId(SIM_RPM_UNASSIGNED));
    expect(sim?.slotKeys).toEqual(installed);
    const speeds = slotSpeeds(layout.fanSlots, effective, channels(1858));
    for (const k of installed) expect(speeds.get(k)?.fraction).toBeGreaterThan(0);
  });

  it('stay at 0 rpm when explicitly unlinked, and a chosen device replaces the default', () => {
    const none = withDefaultBindings([{ channelId: NONE_CHANNEL, slotKeys: installed }], layout.fanSlots, channels(1858));
    for (const k of installed) expect(slotSpeeds(layout.fanSlots, none, channels(1858)).get(k)?.fraction).toBe(0);
    const picked = withDefaultBindings([{ channelId: 'minihub:205D36703632:port1', slotKeys: [installed[0]] }], layout.fanSlots, channels(1858));
    expect(picked.filter(b => b.slotKeys.includes(installed[0])).map(b => b.channelId)).toEqual(['minihub:205D36703632:port1']);
  });

  it('use the simulated default for a radiator fan when no AIO channel exists', () => {
    const slots = [{ key: 'rad:0', taken: 'fan' as const }, { key: 'rad:1', taken: 'fan' as const }];
    expect(withDefaultBindings([], slots, channels(0))).toEqual([{ channelId: simChannelId(SIM_RPM_UNASSIGNED), slotKeys: ['rad:0', 'rad:1'] }]);
    expect(withDefaultBindings([], slots, [{ id: 'a0', isAio: true }])).toEqual([{ channelId: 'a0', slotKeys: ['rad:0', 'rad:1'] }]);
  });
});

describe('derived defaults and stored bindings on one channel', () => {
  it('join the stored binding instead of repeating the channel id', () => {
    const slots = [{ key: 'front:120:0', taken: 'fan' as const }, { key: 'rear:120:0', taken: 'fan' as const }];
    const out = withDefaultBindings([{ channelId: simChannelId(SIM_RPM_UNASSIGNED), slotKeys: ['front:120:0'] }], slots, []);
    expect(out).toEqual([{ channelId: simChannelId(SIM_RPM_UNASSIGNED), slotKeys: ['front:120:0', 'rear:120:0'] }]);
  });
});
