import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ fetchOpenRgbZones: vi.fn(), setOpenRgbZoneSize: vi.fn() }));
vi.mock('../api/openRgbZones', () => api);
vi.mock('./useMultiplexSocket', () => ({ useTopicCallback: () => undefined }));

import { useOpenRgbZones } from './useOpenRgbZones';

const reply = (ledCount: number) => ({
  error: false, msg: '',
  devices: [{ deviceId: 'd', name: 'D', zones: [{ index: 1, name: 'Fan', ledCount, ledsMin: 0, ledsMax: 34, resizable: true, needsSize: false }] }],
});

describe('useOpenRgbZones', () => {
  beforeEach(() => {
    vi.useRealTimers();
    api.fetchOpenRgbZones.mockReset();
    api.setOpenRgbZoneSize.mockReset();
  });

  it('keeps fetching until the queued resize shows up', async () => {
    api.setOpenRgbZoneSize.mockResolvedValue({ error: false, msg: '' });
    api.fetchOpenRgbZones
      .mockResolvedValueOnce(reply(0)) // mount
      .mockResolvedValueOnce(reply(12))
      .mockResolvedValueOnce(reply(20));
    const { result } = renderHook(() => useOpenRgbZones(true));
    await vi.waitFor(() => expect(result.current.devices).toHaveLength(1));
    let ok = false;
    await act(async () => { ok = await result.current.setSize('d', 1, 20); });
    expect(ok).toBe(true);
    expect(api.fetchOpenRgbZones).toHaveBeenCalledTimes(3);
    expect(result.current.devices[0].zones[0].ledCount).toBe(20);
  });

  it('stops after a bounded number of tries when the count never lands', async () => {
    api.setOpenRgbZoneSize.mockResolvedValue({ error: false, msg: '' });
    api.fetchOpenRgbZones.mockResolvedValue(reply(12));
    const { result } = renderHook(() => useOpenRgbZones(false));
    await act(async () => { await result.current.setSize('d', 1, 20); });
    expect(api.fetchOpenRgbZones.mock.calls.length).toBeLessThanOrEqual(6);
    expect(result.current.devices[0].zones[0].ledCount).toBe(12);
  });

  it('reports a refused write', async () => {
    api.setOpenRgbZoneSize.mockResolvedValue({ error: true, msg: 'no' });
    api.fetchOpenRgbZones.mockResolvedValue(reply(0));
    const { result } = renderHook(() => useOpenRgbZones(false));
    let ok = true;
    await act(async () => { ok = await result.current.setSize('d', 1, 20); });
    expect(ok).toBe(false);
  });

  it('ignores an older fetch that resolves after a newer one', async () => {
    let slow: (v: unknown) => void = () => undefined;
    api.fetchOpenRgbZones
      .mockImplementationOnce(() => new Promise(r => { slow = r; }))
      .mockResolvedValueOnce(reply(20));
    const { result } = renderHook(() => useOpenRgbZones(false));
    await act(async () => { void result.current.refresh(); });
    await act(async () => { await result.current.refresh(); });
    await act(async () => { slow(reply(0)); });
    expect(result.current.devices[0].zones[0].ledCount).toBe(20);
  });

  it('drops devices the LED map editor owns', async () => {
    const owned = { deviceId: 'mb', name: 'Board', splitOwned: true, zones: [] };
    const plain = { deviceId: 'd', name: 'D', zones: [] };
    api.fetchOpenRgbZones.mockResolvedValue({ error: false, msg: '', devices: [owned, plain] });
    const { result } = renderHook(() => useOpenRgbZones(true));
    await vi.waitFor(() => expect(result.current.devices.map(d => d.deviceId)).toEqual(['d']));
  });
});
