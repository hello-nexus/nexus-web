import { describe, expect, it } from 'vitest';
import { linkChannelToSlot, simChannelId, type FanBinding } from './caseLayout';
import { linkChannelToSlots, nextSelection, sharedOf, simSpeeds } from './fanSelection';

const none = { toggle: false, add: false };

describe('nextSelection', () => {
  it('selects only the pressed fan on a plain press', () => {
    expect(nextSelection(['a', 'b'], 'c', none)).toEqual(['c']);
  });
  it('toggles a fan in and out with Ctrl or Cmd', () => {
    expect(nextSelection(['a'], 'b', { toggle: true, add: false })).toEqual(['a', 'b']);
    expect(nextSelection(['a', 'b'], 'a', { toggle: true, add: false })).toEqual(['b']);
  });
  it('adds a fan with Shift and keeps one already selected', () => {
    expect(nextSelection(['a'], 'b', { toggle: false, add: true })).toEqual(['a', 'b']);
    expect(nextSelection(['a', 'b'], 'a', { toggle: false, add: true })).toEqual(['a', 'b']);
  });
  it('clears on a press on nothing', () => {
    expect(nextSelection(['a', 'b'], null, { toggle: true, add: true })).toEqual([]);
  });
  it('picks the radiator block alone and drops it from a multi-selection', () => {
    const alone = (k: string) => k === 'radiator';
    expect(nextSelection(['a'], 'radiator', { toggle: true, add: false }, alone)).toEqual(['radiator']);
    expect(nextSelection(['radiator'], 'a', { toggle: true, add: false }, alone)).toEqual(['a']);
  });
});

describe('sharedOf', () => {
  it('reports the common value when all agree', () => {
    expect(sharedOf(['intake', 'intake'])).toEqual({ mixed: false, value: 'intake' });
  });
  it('reports a mix when they differ', () => {
    expect(sharedOf(['intake', 'exhaust'])).toEqual({ mixed: true, value: undefined });
  });
  it('has no value and no mix for nothing', () => {
    expect(sharedOf([])).toEqual({ mixed: false, value: undefined });
  });
});

describe('multi-apply', () => {
  const link = (b: readonly FanBinding[], id: string, key: string) => linkChannelToSlot(b, id, key, false);
  it('points every selected fan at one channel in one pass', () => {
    const start: FanBinding[] = [{ channelId: 'x', slotKeys: ['a'] }];
    const next = linkChannelToSlots(start, simChannelId(1500), ['a', 'b', 'c'], link);
    const sim = next.find(b => b.channelId === simChannelId(1500));
    expect(sim?.slotKeys).toEqual(['a', 'b', 'c']);
    expect(next.find(b => b.channelId === 'x')).toBeUndefined();
    expect(start[0].slotKeys).toEqual(['a']);
  });
  it('reads simulated speeds only when every fan is simulated', () => {
    const channel = (k: string) => ({ a: simChannelId(1000), b: simChannelId(1000), c: '/gpu/0' } as Record<string, string>)[k] ?? null;
    expect(simSpeeds(channel, ['a', 'b'])).toEqual([1000, 1000]);
    expect(simSpeeds(channel, ['a', 'c'])).toBeNull();
  });
});
