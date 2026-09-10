import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useConflictAutostart } from './useConflictAutostart';

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockFetch = vi.fn();
const mockDisable = vi.fn();

vi.mock('../api/conflicts', () => ({
  fetchConflictAutostart: (...args: any[]) => mockFetch(...args),
  disableConflictAutostart: (...args: any[]) => mockDisable(...args),
}));

beforeEach(() => {
  mockFetch.mockReset();
  mockDisable.mockReset();
});

const icue = { id: 'icue', entries: [{ kind: 'runKeyMachine', entryName: 'Corsair iCUE5 Software' }] };
const detected = [{ id: 'icue', displayName: 'iCUE', category: 'lighting', processName: 'iCUE', pid: 1 }] as any;

describe('useConflictAutostart', () => {
  it('reads nothing while the surface is closed', () => {
    renderHook(() => useConflictAutostart([], false));
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('maps the response by catalog id', async () => {
    mockFetch.mockResolvedValue([icue, { id: 'nzxt-cam', entries: [] }]);
    const { result } = renderHook(() => useConflictAutostart(detected, true));

    await waitFor(() => expect(result.current.autostartByApp.size).toBe(2));
    expect(result.current.autostartByApp.get('icue')).toHaveLength(1);
    // Listed with no entries: the app has a recipe, nothing starts it now.
    expect(result.current.autostartByApp.get('nzxt-cam')).toEqual([]);
    // Absent: no verified recipe, so no action may be offered.
    expect(result.current.autostartByApp.get('signalrgb')).toBeUndefined();
  });

  it('leaves the map empty when the FIRST read fails, so nothing is offered', async () => {
    mockFetch.mockResolvedValue(null);
    const { result } = renderHook(() => useConflictAutostart(detected, true));

    await waitFor(() => expect(mockFetch).toHaveBeenCalled());
    expect(result.current.autostartByApp.size).toBe(0);
  });

  it('keeps what it knows when a LATER read fails', async () => {
    // Wiping here would pull the action off every row at once, silently.
    mockFetch.mockResolvedValueOnce([icue]).mockResolvedValueOnce(null);
    mockDisable.mockResolvedValue({ error: false, msg: 'Ok', disabled: 1 });
    const { result } = renderHook(() => useConflictAutostart(detected, true));
    await waitFor(() => expect(result.current.autostartByApp.get('icue')).toHaveLength(1));

    await act(async () => { await result.current.disable('icue'); });

    expect(result.current.autostartByApp.get('icue')).toHaveLength(1);
  });

  it('re-reads when a new app is detected while the surface is open', async () => {
    mockFetch.mockResolvedValue([icue]);
    const { rerender } = renderHook(
      ({ list }) => useConflictAutostart(list, true),
      { initialProps: { list: detected } },
    );
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    // A pid change is not a boot-entry change and must not re-read.
    rerender({ list: [{ ...detected[0], pid: 99 }] as any });
    expect(mockFetch).toHaveBeenCalledTimes(1);

    rerender({ list: [...detected, { id: 'signalrgb', displayName: 'SignalRGB', category: 'lighting', processName: 'x', pid: 2 }] as any });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  });

  it('re-reads after a disable and reports the service verdict', async () => {
    mockFetch.mockResolvedValueOnce([icue]).mockResolvedValueOnce([{ id: 'icue', entries: [] }]);
    mockDisable.mockResolvedValue({ error: false, msg: 'Ok', disabled: 1 });
    const { result } = renderHook(() => useConflictAutostart(detected, true));
    await waitFor(() => expect(result.current.autostartByApp.get('icue')).toHaveLength(1));

    let ok = false;
    await act(async () => { ok = await result.current.disable('icue'); });

    expect(mockDisable).toHaveBeenCalledWith('icue');
    expect(ok).toBe(true);
    expect(result.current.autostartByApp.get('icue')).toEqual([]);
  });

  it('reports a partial disable as a failure and keeps what survived', async () => {
    mockFetch.mockResolvedValueOnce([icue]).mockResolvedValueOnce([icue]);
    mockDisable.mockResolvedValue({ error: true, msg: 'disabled 0 of 1', disabled: 0 });
    const { result } = renderHook(() => useConflictAutostart(detected, true));
    await waitFor(() => expect(result.current.autostartByApp.get('icue')).toHaveLength(1));

    let ok = true;
    await act(async () => { ok = await result.current.disable('icue'); });

    expect(ok).toBe(false);
    expect(result.current.autostartByApp.get('icue')).toHaveLength(1);
  });
});
