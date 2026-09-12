import { describe, expect, it } from 'vitest';
import type { LightingDevice } from '../../../../api/lighting';
import { buildDeviceBlocks } from './deviceBlocks';
import { canLink, frameOwner, isLinkedSet, linkDevices, linkedWith, rowOfDevice, unlinkDevices, withLinked, type DeviceLink } from './deviceLinks';

const device = (id: string, name: string, extra: Partial<LightingDevice> = {}): LightingDevice => ({
  id, name, ledsOn: true, ledCount: 10, canvasX: 0, canvasY: 0, canvasW: 1, canvasH: 1, canvasRotation: 0, ...extra,
});
const port = (suffix: string, name: string) =>
  device(`openrgb-C000-${suffix}`, `B850I - ${name}`, { parentDeviceId: 'openrgb-C000', zoneIndex: 0, deviceId: `openrgb-C000-${suffix}` });
const devices = [device('a', 'A'), device('b', 'B'), device('c', 'C'), port('0', 'ARGB_1'), port('1', 'ARGB_2')];
const blocks = buildDeviceBlocks(devices);
const links: DeviceLink[] = [{ id: 'l1', name: '', members: ['a', 'b'] }];

describe('deviceLinks', () => {
  it('names a card\'s link members, itself alone when unlinked', () => {
    expect(linkedWith(links, 'a')).toEqual(['a', 'b']);
    expect(linkedWith(links, 'c')).toEqual(['c']);
    expect([...withLinked(links, ['b', 'c'])]).toEqual(['a', 'b', 'c']);
  });

  it('places a card at the top level and a zone inside its hardware group', () => {
    expect(rowOfDevice(blocks, [], 'a')).toEqual({ rowId: 'a', container: null, hardware: null });
    expect(rowOfDevice(blocks, [], 'openrgb-C000-1')).toEqual({ rowId: 'openrgb-C000-1', container: 'mb:openrgb-C000', hardware: 'mb:openrgb-C000' });
  });

  it('links cards whose rows share a container and refuses a mix', () => {
    expect(canLink(blocks, [], ['a', 'c'])).toBe(true);
    expect(canLink(blocks, [], ['openrgb-C000-0', 'openrgb-C000-1'])).toBe(true);
    expect(canLink(blocks, [], ['a', 'openrgb-C000-0'])).toBe(false);
    expect(canLink(blocks, [], ['a'])).toBe(false);
    expect(canLink(blocks, [{ id: 'g', name: 'G', members: ['c'] }], ['a', 'c'])).toBe(false);
  });

  it('links a set, pulling its cards out of any earlier link', () => {
    const next = linkDevices(links, ['b', 'c'], 'Pair');
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ name: 'Pair', members: ['b', 'c'] });
  });

  it('unlinks, dissolving a link left with one card', () => {
    expect(unlinkDevices(links, ['a'])).toEqual([]);
    const three: DeviceLink[] = [{ id: 'l', name: '', members: ['a', 'b', 'c'] }];
    expect(unlinkDevices(three, ['c'])[0].members).toEqual(['a', 'b']);
  });

  it('knows when a set is exactly one link', () => {
    expect(isLinkedSet(links, ['a', 'b'])).toBe(true);
    expect(isLinkedSet(links, ['b', 'a'])).toBe(true);
    expect(isLinkedSet(links, ['a'])).toBe(false);
    expect(isLinkedSet(links, ['a', 'b', 'c'])).toBe(false);
  });

  it('lets the first drawn member own the frame', () => {
    expect(frameOwner(links, devices, devices[1])).toBe('a');
    expect(frameOwner(links, devices.slice(1), devices[1])).toBe('b');
    expect(frameOwner(links, devices, devices[2])).toBe('c');
  });
});
