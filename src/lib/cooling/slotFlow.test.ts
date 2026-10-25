import { describe, expect, it } from 'vitest';
import { inferRadiatorFans } from './fanSpecs';
import { withDefaultBindings } from './slotFlow';

const gpuSlots = ['gpu:fan:0', 'gpu:fan:1', 'gpu:fan:2'].map(key => ({ key, taken: null, size: 90 }));
const channels = [{ id: 'g0', isGpu: true }, { id: 'g1', isGpu: true }, { id: 'g2', isGpu: true }];

describe('withDefaultBindings owners', () => {
  it('keeps each GPU fan on its own channel when an earlier one is unlinked', () => {
    const none = [{ channelId: 'none', slotKeys: ['gpu:fan:0'] }];
    const derived = withDefaultBindings(none, gpuSlots, channels);
    expect(derived.find(b => b.channelId === 'g1')?.slotKeys).toEqual(['gpu:fan:1']);
    expect(derived.find(b => b.channelId === 'g2')?.slotKeys).toEqual(['gpu:fan:2']);
    expect(derived.find(b => b.channelId === 'g0')).toBeUndefined();
  });

  it('keeps a radiator\'s fans on their own channels when the first is unlinked', () => {
    const slots = [{ key: 'top:360:0', taken: 'radiator' as const, size: 360, radiator: { fanCount: 3 } }];
    const aio = [{ id: 'a0', isAio: true }, { id: 'a1', isAio: true }, { id: 'a2', isAio: true }];
    const derived = withDefaultBindings([{ channelId: 'none', slotKeys: ['top:360:0'] }], slots, aio);
    expect(derived.find(b => b.channelId === 'a1')?.slotKeys).toEqual(['top:360:0#1']);
    expect(derived.find(b => b.channelId === 'a2')?.slotKeys).toEqual(['top:360:0#2']);
  });
});

describe('inferRadiatorFans', () => {
  it('reads at most four fans from any length', () => {
    expect(inferRadiatorFans(420)).toEqual({ count: 3, sizeMm: 140 });
    expect(inferRadiatorFans(1200).count).toBe(4);
    expect(inferRadiatorFans(10000).count).toBe(4);
  });
});
