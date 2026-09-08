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
});

describe('stripParentPrefix', () => {
  it('trims the motherboard prefix off a zone name', () => {
    expect(stripParentPrefix('B650E - ARGB header 1', 'B650E')).toBe('ARGB header 1');
  });

  it('leaves a renamed zone alone - it no longer carries the prefix', () => {
    expect(stripParentPrefix('Top intake', 'B650E')).toBe('Top intake');
  });
});
