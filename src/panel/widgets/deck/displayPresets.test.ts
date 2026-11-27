import { describe, it, expect } from 'vitest';
import { buildDisplayPresetTargets } from './displayPresets';

const devices = [
  { name: 'Lian Li Wireless LCD #2', panelRecordId: 'rec-2' },
  { name: 'Y70', panelRecordId: undefined },
  { name: 'Xeneon Edge', panelRecordId: 'rec-3' },
  { name: 'Empty panel', panelRecordId: 'rec-4' },
];

describe('buildDisplayPresetTargets', () => {
  it('keeps only displays that own a panel record and at least one preset', () => {
    const targets = buildDisplayPresetTargets(devices, {
      'rec-2': [{ id: 'pa', name: 'frieren' }],
      'rec-3': [{ id: 'pc', name: 'work' }, { id: 'pd', name: 'game' }],
      'rec-4': [],
    });
    expect(targets).toEqual([
      { deviceId: 'rec-2', name: 'Lian Li Wireless LCD #2', presets: [{ id: 'pa', name: 'frieren' }] },
      { deviceId: 'rec-3', name: 'Xeneon Edge', presets: [{ id: 'pc', name: 'work' }, { id: 'pd', name: 'game' }] },
    ]);
  });

  it('lists a record once even when two device rows share it', () => {
    const targets = buildDisplayPresetTargets(
      [{ name: 'A', panelRecordId: 'r' }, { name: 'B', panelRecordId: 'r' }],
      { r: [{ id: 'p', name: 'x' }] },
    );
    expect(targets.map(t => t.name)).toEqual(['A']);
  });

  it('is empty before any presets have loaded', () => {
    expect(buildDisplayPresetTargets(devices, {})).toEqual([]);
  });
});
