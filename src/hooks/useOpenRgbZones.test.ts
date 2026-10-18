import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const api = vi.hoisted(() => ({ fetchOpenRgbZones: vi.fn(), setOpenRgbZoneSize: vi.fn() }));
const topic = vi.hoisted(() => ({ cb: (() => undefined) as () => void }));
vi.mock('../api/openRgbZones', () => api);
vi.mock('./useMultiplexSocket', () => ({ useTopicCallback: (_t: string, _e: boolean, cb: () => void) => { topic.cb = cb; } }));

import { useOpenRgbZones } from './useOpenRgbZones';

const reply = (ledCount: number) => ({
  error: false, msg: '',
  devices: [{ deviceId: 'd', name: 'D', zones: [{ index: 1, name: 'Fan', ledCount, ledsMin: 0, ledsMax: 34, resizable: true, needsSize: false }] }],
});

describe('useOpenRgbZones', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    api.fetchOpenRgbZones.mockReset();
    api.setOpenRgbZoneSize.mockReset();
    api.setOpenRgbZoneSize.mockResolvedValue({ error: false, msg: '' });
  });
  afterEach(() => vi.useRealTimers());

  it('settles on the lighting frame that shows the committed count', async () => {
    api.fetchOpenRgbZones.mockResolvedValue(reply(12));
    const { result } = renderHook(() => useOpenRgbZones(false));
    let settled = false;
    await act(async () => { void result.current.setSize('d', 1, 20).then(() => { settled = true; }); });
    expect(settled).toBe(false);
    api.fetchOpenRgbZones.mockResolvedValue(reply(20));
    await act(async () => { topic.cb(); });
    expect(settled).toBe(true);
    expect(result.current.devices[0].zones[0].ledCount).toBe(20);
  });

  it('falls back to a bounded poll with no sleep after the last miss', async () => {
    api.fetchOpenRgbZones.mockResolvedValue(reply(12));
    const { result } = renderHook(() => useOpenRgbZones(false));
    let settled = false;
    await act(async () => { void result.current.setSize('d', 1, 20).then(() => { settled = true; }); });
    expect(api.fetchOpenRgbZones).toHaveBeenCalledTimes(1);
    for (let i = 2; i <= 6; i++) {
      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
      expect(api.fetchOpenRgbZones).toHaveBeenCalledTimes(i);
    }
    expect(settled).toBe(true);
    expect(result.current.devices[0].zones[0].ledCount).toBe(12);
  });

  it('cancels the wait of a superseded write to the same zone', async () => {
    api.fetchOpenRgbZones.mockResolvedValue(reply(12));
    const { result } = renderHook(() => useOpenRgbZones(false));
    let first = false;
    await act(async () => { void result.current.setSize('d', 1, 20).then(() => { first = true; }); });
    expect(first).toBe(false);
    await act(async () => { void result.current.setSize('d', 1, 25); });
    expect(first).toBe(true);
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
    await act(async () => { await Promise.resolve(); });
    expect(result.current.devices.map(d => d.deviceId)).toEqual(['d']);
  });
});
