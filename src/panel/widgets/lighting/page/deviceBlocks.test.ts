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
  // The wire shape of a split motherboard's header: its own device under the board.
  parentDeviceId: 'openrgb-0',
  zoneIndex: Number(id.slice(-1)),
  deviceId: id,
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

  it('heads the card with the hardware name and strips it off the zones', () => {
    const blocks = buildDeviceBlocks([keebZone('keys'), keebZone('underglow')]);
    const block = blocks[0];
    expect(block.kind === 'split' && block.label).toBe('HYTE Keeb TKL');
    expect(block.kind === 'split' && block.devices.map(d => stripParentPrefix(d.name, block.stripLabel)))
      .toEqual(['Keys', 'Underglow']);
  });

  it('heads the card with the device rename while still stripping the hardware prefix', () => {
    const blocks = buildDeviceBlocks([
      keebZone('keys', { deviceName: 'Desk keyboard' }),
      keebZone('underglow', { deviceName: 'Desk keyboard' }),
    ]);
    const block = blocks[0];
    expect(block.kind === 'split' && block.label).toBe('Desk keyboard');
    expect(block.kind === 'split' && block.stripLabel).toBe('HYTE Keeb TKL');
  });

  it('falls back to the parent rename on a service without deviceName', () => {
    const blocks = buildDeviceBlocks([
      keebZone('keys', { parentName: 'Desk keyboard' }),
      keebZone('underglow', { parentName: 'Desk keyboard' }),
    ]);
    expect(blocks[0].kind === 'split' && blocks[0].label).toBe('Desk keyboard');
  });

  it('keeps a motherboard a group: each header routes to itself, not the board', () => {
    const blocks = buildDeviceBlocks([
      zone('openrgb-0-0', 'B650E - ARGB header 1'),
      zone('openrgb-0-1', 'B650E - ARGB header 2'),
    ]);
    expect(blocks[0].kind).toBe('group');
  });

  it('stacks headers that all route to the board (older service) into one split card', () => {
    const blocks = buildDeviceBlocks([
      zone('openrgb-0-0', 'B650E - ARGB header 1', { deviceId: 'openrgb-0' }),
      zone('openrgb-0-1', 'B650E - ARGB header 2', { deviceId: 'openrgb-0' }),
    ]);
    expect(blocks[0].kind).toBe('split');
    expect(blocks[0].kind === 'split' && blocks[0].label).toBe('B650E');
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

// The T1 board: three ARGB ports, one of them carrying a three-product chain.
describe('buildDeviceBlocks board ports', () => {
  const board = 'openrgb-C000';
  const port = (suffix: string, deviceSuffix: string, name: string, extra: Partial<LightingDevice> = {}): LightingDevice =>
    zone(`${board}-${suffix}`, `B850I AORUS PRO - ${name}`, { parentDeviceId: board, deviceId: `${board}-${deviceSuffix}`, ...extra });
  const t1 = () => [
    port('0', '0', 'ARGB_V2_1'),
    port('2', '2', 'LED_C'),
    port('1:z0', '1', 'ARGB_V2_2 - QX Fan 1'),
    port('1:z1', '1', 'ARGB_V2_2 - Generic ARGB Strip - 20 LED 2'),
    port('1:z2', '1', 'ARGB_V2_2 - Corsair QL Fan - 34 LED 3'),
  ];
  const groupOf = (blocks: ReturnType<typeof buildDeviceBlocks>) => {
    const b = blocks[0];
    if (b.kind !== 'group') throw new Error(b.kind);
    return b;
  };

  it('gives the board one row per port: a card for a lone product, a split for a chain', () => {
    const blocks = buildDeviceBlocks(t1());
    expect(blocks).toHaveLength(1);
    const g = groupOf(blocks);
    expect(g.label).toBe('B850I AORUS PRO');
    expect(g.blocks.map(r => r.kind)).toEqual(['single', 'single', 'split']);
    expect(g.devices).toHaveLength(5);
  });

  it('heads the chained port with the port name and strips it off the products', () => {
    const g = groupOf(buildDeviceBlocks(t1()));
    const chain = g.blocks[2];
    if (chain.kind !== 'split') throw new Error(chain.kind);
    expect(chain.groupKey).toBe(`mb:${board}-1`);
    expect(chain.stripLabel).toBe('B850I AORUS PRO - ARGB_V2_2');
    expect(chain.label).toBe('ARGB_V2_2');
    expect(chain.devices.map(d => stripParentPrefix(d.name, chain.stripLabel)))
      .toEqual(['QX Fan 1', 'Generic ARGB Strip - 20 LED 2', 'Corsair QL Fan - 34 LED 3']);
    expect(g.blocks.slice(0, 2).map(r => r.kind === 'single' && stripParentPrefix(r.device.name, g.stripLabel)))
      .toEqual(['ARGB_V2_1', 'LED_C']);
  });

  it('orders rows by first occurrence and lists the cards in row order', () => {
    const [a, c, z0, z1, z2] = t1();
    const g = groupOf(buildDeviceBlocks([z0, a, z1, z2, c]));
    expect(g.blocks.map(r => r.kind)).toEqual(['split', 'single', 'single']);
    expect(g.devices.map(d => d.id)).toEqual([z0.id, z1.id, z2.id, a.id, c.id]);
  });

  it('caps the shared prefix so every zone keeps its own last segment', () => {
    const g = groupOf(buildDeviceBlocks([
      port('0', '0', 'ARGB_V2_1'),
      port('1:z0', '1', 'ARGB_V2_2'),
      port('1:z1', '1', 'ARGB_V2_2 - Tail'),
    ]));
    const chain = g.blocks[1];
    expect(chain.kind === 'split' && chain.stripLabel).toBe('B850I AORUS PRO');
    expect(chain.kind === 'split' && chain.devices.map(d => stripParentPrefix(d.name, chain.stripLabel)))
      .toEqual(['ARGB_V2_2', 'ARGB_V2_2 - Tail']);
  });

  it('heads a chained port with its device rename over the derived port name', () => {
    const g = groupOf(buildDeviceBlocks([
      port('0', '0', 'ARGB_V2_1'),
      port('1:z0', '1', 'ARGB_V2_2 - QX Fan 1', { deviceName: 'Front fans' }),
      port('1:z1', '1', 'ARGB_V2_2 - QL Fan 2', { deviceName: 'Front fans' }),
    ]));
    const chain = g.blocks[1];
    expect(chain.kind === 'split' && chain.label).toBe('Front fans');
    expect(chain.kind === 'split' && chain.stripLabel).toBe('B850I AORUS PRO - ARGB_V2_2');
  });

  it('reads the prefix off hardware names, so a renamed zone does not break the run', () => {
    const g = groupOf(buildDeviceBlocks([
      port('0', '0', 'ARGB_V2_1'),
      port('1:z0', '1', 'ARGB_V2_2 - QX Fan 1'),
      { ...port('1:z1', '1', 'ARGB_V2_2 - Corsair QL Fan - 34 LED 3'), name: 'Front', originalName: 'B850I AORUS PRO - ARGB_V2_2 - Corsair QL Fan - 34 LED 3' },
    ]));
    const chain = g.blocks[1];
    expect(chain.kind === 'split' && chain.label).toBe('ARGB_V2_2');
    expect(chain.kind === 'split' && chain.devices.map(d => stripParentPrefix(d.name, chain.stripLabel)))
      .toEqual(['QX Fan 1', 'Front']);
  });

  it('falls back to the first segment when the zones share no prefix', () => {
    const g = groupOf(buildDeviceBlocks([
      port('0', '0', 'ARGB_V2_1'),
      zone(`${board}-1:z0`, 'Alpha - one', { parentDeviceId: board, deviceId: `${board}-1` }),
      zone(`${board}-1:z1`, 'Beta - two', { parentDeviceId: board, deviceId: `${board}-1` }),
    ]));
    expect(g.blocks[1].kind === 'split' && g.blocks[1].stripLabel).toBe('Alpha');
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
