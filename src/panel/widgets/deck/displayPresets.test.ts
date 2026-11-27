import { describe, it, expect } from 'vitest';
import { buildDisplayPresetTargets } from './displayPresets';

const devices = [
  { name: 'Lian Li Wireless LCD #2', panelRecordId: 'rec-2' },
  { name: 'Y70', panelRecordId: undefined },
  { name: 'Xeneon Edge', panelRecordId: 'rec-3' },
  { name: 'Empty panel', panelRecordId: 'rec-4' },
];

describe('buildDisplayPresetTargets', () => {
  it('keeps displays that own a panel record, including one with no presets', () => {
    const targets = buildDisplayPresetTargets(devices, {
      'rec-2': [{ id: 'pa', name: 'frieren' }],
      'rec-3': [{ id: 'pc', name: 'work' }, { id: 'pd', name: 'game' }],
      'rec-4': [],
    });
    expect(targets).toEqual([
      { deviceId: 'rec-2', name: 'Lian Li Wireless LCD #2', presets: [{ id: 'pa', name: 'frieren' }] },
      { deviceId: 'rec-3', name: 'Xeneon Edge', presets: [{ id: 'pc', name: 'work' }, { id: 'pd', name: 'game' }] },
      { deviceId: 'rec-4', name: 'Empty panel', presets: [] },
    ]);
  });

  it('lists a record once even when two device rows share it', () => {
    const targets = buildDisplayPresetTargets(
      [{ name: 'A', panelRecordId: 'r' }, { name: 'B', panelRecordId: 'r' }],
      { r: [{ id: 'p', name: 'x' }] },
    );
    expect(targets.map(t => t.name)).toEqual(['A']);
  });

  it('lists record-backed displays with no presets before any have loaded', () => {
    expect(buildDisplayPresetTargets(devices, {}).map(t => t.deviceId)).toEqual(['rec-2', 'rec-3', 'rec-4']);
  });
});
