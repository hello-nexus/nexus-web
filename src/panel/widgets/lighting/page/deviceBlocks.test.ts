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
  parentDeviceId: 'openrgb-0',
  zoneIndex: Number(id.slice(-1)),
  ...extra,
});

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

describe('stripParentPrefix', () => {
  it('trims the motherboard prefix off a zone name', () => {
    expect(stripParentPrefix('B650E - ARGB header 1', 'B650E')).toBe('ARGB header 1');
  });

  it('leaves a renamed zone alone - it no longer carries the prefix', () => {
    expect(stripParentPrefix('Top intake', 'B650E')).toBe('Top intake');
  });
});
