import { describe, expect, it } from 'vitest';
import { buildDeviceBlocks, stripParentPrefix } from './deviceBlocks';
import type { LightingDevice } from '../../../../api/lighting';

const zone = (id: string, name: string, extra: Partial<LightingDevice> = {}): LightingDevice => ({
  id,
  name,
  ledsOn: true,
  ledCount: 10,
  canvasX: 0,
  canvasY: 0,
  canvasW: 1,
  canvasH: 1,
  canvasRotation: 0,
  // The wire shape of a split motherboard's header: routes to the board.
  parentDeviceId: 'openrgb-0',
  zoneIndex: Number(id.slice(-1)),
  deviceId: 'openrgb-0',
  type: 'motherboard',
  ...extra,
});

// The keeb's wire shape: both zones route to the keyboard itself.
const keebZone = (suffix: 'keys' | 'underglow', extra: Partial<LightingDevice> = {}): LightingDevice => zone(
  `keeb:tkl-1:${suffix}`,
  `HYTE Keeb TKL - ${suffix === 'keys' ? 'Keys' : 'Underglow'}`,
  { parentDeviceId: 'keeb:tkl-1', deviceId: 'keeb:tkl-1', type: 'ledstrip', zoneIndex: suffix === 'keys' ? 0 : 1, ...extra },
);

describe('buildDeviceBlocks group header', () => {
  it('names the group from the motherboard half of a zone name', () => {
    const blocks = buildDeviceBlocks([
      zone('openrgb-0-0', 'B650E - ARGB header 1'),
      zone('openrgb-0-1', 'B650E - ARGB header 2'),
    ]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind === 'group' && blocks[0].label).toBe('B650E');
  });

  it('keeps the header on the hardware name when the first zone is renamed', () => {
    const blocks = buildDeviceBlocks([
      zone('openrgb-0-0', 'Top intake', { originalName: 'B650E - ARGB header 1' }),
      zone('openrgb-0-1', 'B650E - ARGB header 2'),
    ]);
    expect(blocks[0].kind === 'group' && blocks[0].label).toBe('B650E');
  });

  it('shows the group its own rename when the header itself was renamed', () => {
    const blocks = buildDeviceBlocks([
      zone('openrgb-0-0', 'B650E - ARGB header 1', { parentName: 'Motherboard' }),
      zone('openrgb-0-1', 'B650E - ARGB header 2', { parentName: 'Motherboard' }),
    ]);
    expect(blocks[0].kind === 'group' && blocks[0].label).toBe('Motherboard');
  });

  it('still strips the hardware prefix off children of a renamed group', () => {
    const blocks = buildDeviceBlocks([
      zone('openrgb-0-0', 'B650E - ARGB header 1', { parentName: 'Motherboard' }),
      zone('openrgb-0-1', 'B650E - ARGB header 2', { parentName: 'Motherboard' }),
    ]);
    const block = blocks[0];
    expect(block.kind === 'group' && block.stripLabel).toBe('B650E');
    expect(block.kind === 'group' && stripParentPrefix(block.devices[1].name, block.stripLabel))
      .toBe('ARGB header 2');
  });

  it('names the rename target so the header can post one', () => {
    const blocks = buildDeviceBlocks([
      zone('openrgb-0-0', 'B650E - ARGB header 1'),
      zone('openrgb-0-1', 'B650E - ARGB header 2'),
    ]);
    expect(blocks[0].kind === 'group' && blocks[0].parentDeviceId).toBe('openrgb-0');
  });
});

describe('buildDeviceBlocks split card', () => {
  it('stacks one device\'s zones into a split card, in device order', () => {
    const blocks = buildDeviceBlocks([keebZone('keys'), keebZone('underglow')]);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('split');
    expect(blocks[0].kind === 'split' && blocks[0].devices.map(d => d.id))
      .toEqual(['keeb:tkl-1:keys', 'keeb:tkl-1:underglow']);
  });

  it('keys the split card the way its group form was, so a user group still holds it', () => {
    const blocks = buildDeviceBlocks([keebZone('keys'), keebZone('underglow')]);
    expect(blocks[0].kind === 'split' && blocks[0].groupKey).toBe('mb:keeb:tkl-1');
  });

  it('keeps a motherboard a group even though its headers route to the board', () => {
    const blocks = buildDeviceBlocks([
      zone('openrgb-0-0', 'B650E - ARGB header 1'),
      zone('openrgb-0-1', 'B650E - ARGB header 2'),
    ]);
    expect(blocks[0].kind).toBe('group');
  });

  it('keeps a hub a group: its port cards route to the port device, not the hub', () => {
    const blocks = buildDeviceBlocks([
      zone('lianli:hub-1:p1', 'Uni Hub - Port 1', { parentDeviceId: 'lianli:hub-1', deviceId: 'lianli:hub-1:p1', type: 'ledstrip' }),
      zone('lianli:hub-1:p2', 'Uni Hub - Port 2', { parentDeviceId: 'lianli:hub-1', deviceId: 'lianli:hub-1:p2', type: 'ledstrip' }),
    ]);
    expect(blocks[0].kind).toBe('group');
  });

  it('keeps the group rendering for an older service that sends no deviceId', () => {
    const blocks = buildDeviceBlocks([
      keebZone('keys', { deviceId: undefined }),
      keebZone('underglow', { deviceId: undefined }),
    ]);
    expect(blocks[0].kind).toBe('group');
  });

  it('collapses a lone zone to a single card rather than a one-member stack', () => {
    const blocks = buildDeviceBlocks([keebZone('keys')]);
    expect(blocks[0].kind).toBe('single');
  });

  it('sits where its first zone sat among the other blocks', () => {
    const strip = (id: string): LightingDevice => ({ ...zone(id, id), parentDeviceId: undefined, zoneIndex: undefined, deviceId: id, type: 'ledstrip' });
    const blocks = buildDeviceBlocks([strip('a'), keebZone('keys'), strip('b'), keebZone('underglow')]);
    expect(blocks.map(b => b.kind)).toEqual(['single', 'split', 'single']);
  });
});

describe('stripParentPrefix', () => {
  it('trims the motherboard prefix off a zone name', () => {
    expect(stripParentPrefix('B650E - ARGB header 1', 'B650E')).toBe('ARGB header 1');
  });

  it('leaves a renamed zone alone - it no longer carries the prefix', () => {
    expect(stripParentPrefix('Top intake', 'B650E')).toBe('Top intake');
  });
});
