import { describe, expect, it } from 'vitest';
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
    const slots = [0, 1, 2].map(i => ({ key: `rad:${i}`, taken: 'fan' as const }));
    const aio = [{ id: 'a0', isAio: true }, { id: 'a1', isAio: true }, { id: 'a2', isAio: true }];
    const derived = withDefaultBindings([{ channelId: 'none', slotKeys: ['rad:0'] }], slots, aio);
    expect(derived.find(b => b.channelId === 'a1')?.slotKeys).toEqual(['rad:1']);
    expect(derived.find(b => b.channelId === 'a2')?.slotKeys).toEqual(['rad:2']);
  });

  it('gives the case slots a radiator covers no default binding', () => {
    const slots = [{ key: 'top:120:0', taken: 'radiator' as const }, { key: 'rad:0', taken: 'fan' as const }];
    expect(withDefaultBindings([], slots, [{ id: 'a0', isAio: true }])).toEqual([{ channelId: 'a0', slotKeys: ['rad:0'] }]);
  });
});
