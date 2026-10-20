import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ fetchOpenRgbZones: vi.fn() }));
vi.mock('../api/openRgbZones', () => api);

import { useZoneSizeDeviceIds } from './useZoneSizeDeviceIds';

const zone = (needsSize: boolean) => ({ index: 0, name: 'Fan', ledCount: 0, ledsMin: 0, ledsMax: 34, resizable: true, needsSize });

const reply = {
  error: false, msg: '',
  devices: [
    { deviceId: 'unsized', name: 'A', zones: [zone(true)] },
    { deviceId: 'sized', name: 'B', zones: [zone(false)] },
    { deviceId: 'split', name: 'C', splitOwned: true, zones: [zone(true)] },
  ],
};

describe('useZoneSizeDeviceIds', () => {
  beforeEach(() => {
    api.fetchOpenRgbZones.mockReset();
    api.fetchOpenRgbZones.mockResolvedValue(reply);
  });

  it('lists only unsized devices the Devices page sizes', async () => {
    const { result } = renderHook(() => useZoneSizeDeviceIds(true, [{ id: 'unsized', ledCount: 0 }]));
    await act(async () => {});
    expect([...result.current]).toEqual(['unsized']);
  });

  it('refetches when a device or its LED count changes, not on a re-render with the same set', async () => {
    let devices = [{ id: 'unsized', ledCount: 0 }, { id: 'sized', ledCount: 8 }];
    const { rerender } = renderHook(() => useZoneSizeDeviceIds(true, devices));
    await act(async () => {});
    expect(api.fetchOpenRgbZones).toHaveBeenCalledTimes(1);

    devices = [{ id: 'sized', ledCount: 8 }, { id: 'unsized', ledCount: 0 }];
    rerender();
    await act(async () => {});
    expect(api.fetchOpenRgbZones).toHaveBeenCalledTimes(1);

    devices = [{ id: 'sized', ledCount: 8 }, { id: 'unsized', ledCount: 12 }];
    rerender();
    await act(async () => {});
    expect(api.fetchOpenRgbZones).toHaveBeenCalledTimes(2);
  });

  it('fetches nothing while disabled', async () => {
    renderHook(() => useZoneSizeDeviceIds(false, [{ id: 'unsized', ledCount: 0 }]));
    await act(async () => {});
    expect(api.fetchOpenRgbZones).not.toHaveBeenCalled();
  });
});
