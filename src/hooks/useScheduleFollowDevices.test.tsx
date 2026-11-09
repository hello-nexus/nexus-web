import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useScheduleFollowDevices } from './useScheduleFollowDevices';

const api = vi.hoisted(() => ({
  fetchScheduleFollowDevices: vi.fn(),
  setScheduleFollowDevice: vi.fn(),
}));
vi.mock('../api/lighting', () => api);
const topic = vi.hoisted(() => ({ fire: () => {} }));
vi.mock('./useMultiplexSocket', () => ({
  useTopicCallback: (_t: string, _e: boolean, cb: () => void) => { topic.fire = cb; },
}));

const y70 = { key: 'y70', follows: true, levelPercent: 40, appliedPercent: 32 };

describe('useScheduleFollowDevices', () => {
  beforeEach(() => {
    api.fetchScheduleFollowDevices.mockReset().mockResolvedValue({ devices: [y70] });
    api.setScheduleFollowDevice.mockReset();
  });

  it('loads the device list keyed by device', async () => {
    const { result } = renderHook(() => useScheduleFollowDevices(true));
    await waitFor(() => expect(result.current.devices.y70).toEqual(y70));
  });

  it('does not fetch while disabled', () => {
    renderHook(() => useScheduleFollowDevices(false));
    expect(api.fetchScheduleFollowDevices).not.toHaveBeenCalled();
  });

  it('refetches on the lighting topic', async () => {
    const { result } = renderHook(() => useScheduleFollowDevices(true));
    await waitFor(() => expect(result.current.devices.y70).toBeDefined());
    api.fetchScheduleFollowDevices.mockResolvedValue({ devices: [{ ...y70, levelPercent: 70, appliedPercent: 56 }] });
    act(() => { topic.fire(); });
    await waitFor(() => expect(result.current.devices.y70.appliedPercent).toBe(56));
  });

  it('flips a device optimistically and adopts the answer', async () => {
    const { result } = renderHook(() => useScheduleFollowDevices(true));
    await waitFor(() => expect(result.current.devices.y70).toBeDefined());
    let answer: (v: unknown) => void = () => {};
    api.setScheduleFollowDevice.mockReturnValue(new Promise(r => { answer = r; }));
    let done: Promise<void> = Promise.resolve();
    act(() => { done = result.current.setFollows('y70', false); });
    expect(result.current.devices.y70.follows).toBe(false);
    api.fetchScheduleFollowDevices.mockResolvedValue({ devices: [{ ...y70, follows: false, levelPercent: 100, appliedPercent: 80 }] });
    await act(async () => { answer({ ...y70, follows: false, levelPercent: 100, appliedPercent: 80 }); await done; });
    expect(api.setScheduleFollowDevice).toHaveBeenCalledWith('y70', false);
    expect(result.current.devices.y70).toMatchObject({ follows: false, levelPercent: 100, appliedPercent: 80 });
  });

  it('creates an entry for a device the service has not listed', async () => {
    const { result } = renderHook(() => useScheduleFollowDevices(true));
    await waitFor(() => expect(result.current.devices.y70).toBeDefined());
    api.setScheduleFollowDevice.mockResolvedValue({ error: false, msg: '' });
    // The service lists the device once it has been switched.
    api.fetchScheduleFollowDevices.mockResolvedValue({
      devices: [y70, { key: 'display-1', follows: false, levelPercent: 100, appliedPercent: null }],
    });
    await act(async () => { await result.current.setFollows('display-1', false); });
    expect(result.current.devices['display-1']).toMatchObject({ key: 'display-1', follows: false });
  });

  it('drops a refetch that lands while a write is in flight', async () => {
    const { result } = renderHook(() => useScheduleFollowDevices(true));
    await waitFor(() => expect(result.current.devices.y70).toBeDefined());
    let answer: (v: unknown) => void = () => {};
    api.setScheduleFollowDevice.mockReturnValue(new Promise(r => { answer = r; }));
    let done: Promise<void> = Promise.resolve();
    act(() => { done = result.current.setFollows('y70', false); });
    api.fetchScheduleFollowDevices.mockResolvedValue({ devices: [y70] });
    await act(async () => { topic.fire(); await Promise.resolve(); });
    expect(result.current.devices.y70.follows).toBe(false);
    await act(async () => { answer({ ...y70, follows: false }); await done; });
  });

  it('exposes a refresh for the popover opening', async () => {
    const { result } = renderHook(() => useScheduleFollowDevices(true));
    await waitFor(() => expect(result.current.devices.y70).toBeDefined());
    api.fetchScheduleFollowDevices.mockClear().mockResolvedValue({ devices: [{ ...y70, capPercent: 55 }] });
    act(() => { result.current.refresh(); });
    await waitFor(() => expect(result.current.devices.y70.capPercent).toBe(55));
  });
});
