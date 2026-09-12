import { describe, expect, it } from 'vitest';
import type { LightingDevice } from '../../../../api/lighting';
import { buildDeviceBlocks } from './deviceBlocks';
import { canStack, isStackedSet, stackDevices, stackedWith, rowOfDevice, unstackDevices, withStacked, type DeviceStack } from './deviceStacks';

const device = (id: string, name: string, extra: Partial<LightingDevice> = {}): LightingDevice => ({
  id, name, ledsOn: true, ledCount: 10, canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, canvasRotation: 0, ...extra,
});
const port = (suffix: string, name: string) =>
  device(`openrgb-C000-${suffix}`, `B850I - ${name}`, { parentDeviceId: 'openrgb-C000', zoneIndex: 0, deviceId: `openrgb-C000-${suffix}` });
const devices = [device('a', 'A'), device('b', 'B'), device('c', 'C'), port('0', 'ARGB_1'), port('1', 'ARGB_2')];
const blocks = buildDeviceBlocks(devices);
const stacks: DeviceStack[] = [{ id: 'l1', name: '', members: ['a', 'b'] }];

describe('deviceStacks', () => {
  it('names a card\'s stack members, itself alone when unstacked', () => {
    expect(stackedWith(stacks, 'a')).toEqual(['a', 'b']);
    expect(stackedWith(stacks, 'c')).toEqual(['c']);
    expect([...withStacked(stacks, ['b', 'c'])]).toEqual(['a', 'b', 'c']);
  });

  it('places a card at the top level and a zone inside its hardware group', () => {
    expect(rowOfDevice(blocks, [], 'a')).toEqual({ rowId: 'a', container: null, hardware: null });
    expect(rowOfDevice(blocks, [], 'openrgb-C000-1')).toEqual({ rowId: 'openrgb-C000-1', container: 'mb:openrgb-C000', hardware: 'mb:openrgb-C000' });
  });

  it('stacks cards whose rows share a container and refuses a mix', () => {
    expect(canStack(blocks, [], ['a', 'c'])).toBe(true);
    expect(canStack(blocks, [], ['openrgb-C000-0', 'openrgb-C000-1'])).toBe(true);
    expect(canStack(blocks, [], ['a', 'openrgb-C000-0'])).toBe(false);
    expect(canStack(blocks, [], ['a'])).toBe(false);
    expect(canStack(blocks, [{ id: 'g', name: 'G', members: ['c'] }], ['a', 'c'])).toBe(false);
  });

  it('stacks a set, pulling its cards out of any earlier stack', () => {
    const next = stackDevices(stacks, ['b', 'c'], 'Pair');
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ name: 'Pair', members: ['b', 'c'] });
  });

  it('unstacks, dissolving a stack left with one card', () => {
    expect(unstackDevices(stacks, ['a'])).toEqual([]);
    const three: DeviceStack[] = [{ id: 'l', name: '', members: ['a', 'b', 'c'] }];
    expect(unstackDevices(three, ['c'])[0].members).toEqual(['a', 'b']);
  });

  it('knows when a set is exactly one stack', () => {
    expect(isStackedSet(stacks, ['a', 'b'])).toBe(true);
    expect(isStackedSet(stacks, ['b', 'a'])).toBe(true);
    expect(isStackedSet(stacks, ['a'])).toBe(false);
    expect(isStackedSet(stacks, ['a', 'b', 'c'])).toBe(false);
  });
});
