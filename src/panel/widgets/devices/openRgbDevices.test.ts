import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { LightingDevice } from '../../../api/lighting';

const setControlled = vi.fn();
vi.mock('../../../api/lighting', () => ({
  setLightingDeviceControlled: (...a: unknown[]) => setControlled(...a),
}));

import { groupOpenRgbDevices, openRgbNoticeShown, setOpenRgbDeviceControlled } from './openRgbDevices';

function card(over: Partial<LightingDevice>): LightingDevice {
  return { id: 'c', name: 'Board', ledsOn: true, ledCount: 1, ...over } as LightingDevice;
}

describe('groupOpenRgbDevices', () => {
  beforeEach(() => setControlled.mockReset());

  it('folds zone cards of one device into a single row', () => {
    const rows = groupOpenRgbDevices([
      card({ id: 'a1', deviceId: 'dev-a', name: 'Board - Header 1', controlled: false }),
      card({ id: 'a2', deviceId: 'dev-a', name: 'Board - Header 2', conflictAppIds: ['x'] }),
      card({ id: 'b', name: 'Mouse' }),
    ]);
    expect(rows).toHaveLength(2);
    const board = rows.find(r => r.deviceId === 'dev-a')!;
    expect(board.name).toBe('Board');
    expect(board.cardIds).toEqual(['a1', 'a2']);
    expect(board.controlled).toBe(true);
    expect(board.conflictAppIds).toEqual(['x']);
    expect(rows.find(r => r.deviceId === 'b')!.cardIds).toEqual(['b']);
  });

  it('is off only when every card is uncontrolled', () => {
    const [row] = groupOpenRgbDevices([
      card({ id: 'a1', deviceId: 'd', controlled: false }),
      card({ id: 'a2', deviceId: 'd', controlled: false }),
    ]);
    expect(row.controlled).toBe(false);
  });

  it('skips cards a curated handler already owns', () => {
    expect(groupOpenRgbDevices([card({ id: 'h', controlHandlerId: 'lianli' })])).toEqual([]);
  });

  it('sets every card of the device', async () => {
    const [row] = groupOpenRgbDevices([card({ id: 'a1', deviceId: 'd' }), card({ id: 'a2', deviceId: 'd' })]);
    await setOpenRgbDeviceControlled(row, false);
    expect(setControlled.mock.calls).toEqual([['a1', false], ['a2', false]]);
  });
});

describe('openRgbNoticeShown', () => {
  it('shows when the feature is off or the daemon is down', () => {
    expect(openRgbNoticeShown(false, true)).toBe(true);
    expect(openRgbNoticeShown(true, false)).toBe(true);
    expect(openRgbNoticeShown(true, true)).toBe(false);
  });
});
