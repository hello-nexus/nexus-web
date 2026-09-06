import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';

const fetchMock = vi.fn();
const patchMock = vi.fn();

vi.mock('../../api/panel', () => ({
  fetchPanelDeviceWithStatus: (...args: unknown[]) => fetchMock(...args),
  patchPanelDeviceWithStatus: (...args: unknown[]) => patchMock(...args),
}));

vi.mock('../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: () => {},
  useMultiplex: () => null,
}));

vi.mock('./panelSync', () => ({
  broadcastLayoutChanged: vi.fn(),
  onLayoutChanged: () => () => {},
}));

import { usePanelLayout } from './usePanelLayout';
import { defaultLayoutForSurface } from './defaultLayout';

beforeEach(() => {
  fetchMock.mockReset();
  patchMock.mockReset();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('usePanelLayout device-missing guard', () => {
  it('suppresses patch when the server has no record for the deviceId', async () => {
    fetchMock.mockResolvedValue({ found: false, status: 404 });

    const { result } = renderHook(() => usePanelLayout('missing-id', 'y70'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.deviceMissing).toBe(true);

    act(() => {
      result.current.setLayout(defaultLayoutForSurface('y70'));
    });
    // Drain the 250 ms patch debounce deterministically rather than waiting
    // wall-clock time, which can race CI stalls.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(patchMock).not.toHaveBeenCalled();
  });

  it('suppresses patch when the fetch never reached the record (relay timeout)', async () => {
    // status 0 is the bounded relay tunnel giving up. `layout` is still the
    // local default at that point, so persisting would overwrite whatever the
    // user actually has stored on the PC - data loss on a slow-but-alive
    // tunnel, where the follow-up PATCH succeeds.
    fetchMock.mockResolvedValue({ found: false, status: 0 });

    const { result } = renderHook(() => usePanelLayout('phone-id', 'phone'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.deviceMissing).toBe(true);

    act(() => {
      result.current.setLayout(defaultLayoutForSurface('phone'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(patchMock).not.toHaveBeenCalled();
  });

  it('suppresses patch when the fetch throws', async () => {
    fetchMock.mockRejectedValue(new Error('offline'));

    const { result } = renderHook(() => usePanelLayout('phone-id', 'phone'));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => {
      result.current.setLayout(defaultLayoutForSurface('phone'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(patchMock).not.toHaveBeenCalled();
  });

  it('persists layout normally when the device exists', async () => {
    const liveRecord = {
      id: 'live',
      displayName: 'Live',
      firstSeenAt: 0,
      lastSeenAt: 0,
      layout: defaultLayoutForSurface('y70'),
    };
    fetchMock.mockResolvedValue({ found: true, record: liveRecord });
    patchMock.mockResolvedValue({ ok: true, record: liveRecord });

    const { result } = renderHook(() => usePanelLayout('live', 'y70'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.deviceMissing).toBe(false);

    act(() => {
      result.current.setLayout(defaultLayoutForSurface('y70'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(patchMock).toHaveBeenCalledTimes(1);
  });

  it('flags saveForbidden on a 403 (a phone session tried to introduce a privileged deck action), without touching deviceMissing', async () => {
    const liveRecord = {
      id: 'live',
      displayName: 'Live',
      firstSeenAt: 0,
      lastSeenAt: 0,
      layout: defaultLayoutForSurface('y70'),
    };
    fetchMock.mockResolvedValue({ found: true, record: liveRecord });
    patchMock.mockResolvedValue({ ok: false, status: 403, msg: 'deck_action_requires_desktop' });

    const { result } = renderHook(() => usePanelLayout('live', 'y70'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(result.current.saveForbidden).toBe(false);

    act(() => {
      result.current.setLayout(defaultLayoutForSurface('y70'));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(result.current.saveForbidden).toBe(true);
    expect(result.current.deviceMissing).toBe(false);
  });

  it('ignores a 403 with no matching msg (e.g. the Pair Remote killswitch), leaving saveForbidden false', async () => {
    fetchMock.mockResolvedValue({
      found: true,
      record: { id: 'live', displayName: 'Live', firstSeenAt: 0, lastSeenAt: 0, layout: defaultLayoutForSurface('y70') },
    });
    patchMock.mockResolvedValue({ ok: false, status: 403, msg: 'RemoteDisabled' });

    const { result } = renderHook(() => usePanelLayout('live', 'y70'));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => { result.current.setLayout(defaultLayoutForSurface('y70')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    expect(result.current.saveForbidden).toBe(false);
  });

  it('refetches the device record on a refused save, so local state snaps back to the stored layout', async () => {
    const storedLayout = defaultLayoutForSurface('y70');
    fetchMock.mockResolvedValue({
      found: true,
      record: { id: 'live', displayName: 'Live', firstSeenAt: 0, lastSeenAt: 0, layout: storedLayout },
    });
    patchMock.mockResolvedValue({ ok: false, status: 403, msg: 'deck_action_requires_desktop' });

    const { result } = renderHook(() => usePanelLayout('live', 'y70'));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const fetchesBeforeSave = fetchMock.mock.calls.length;

    const rejectedLayout = defaultLayoutForSurface('y70');
    act(() => { result.current.setLayout(rejectedLayout); });
    expect(result.current.layout.pages[0]?.id).toBe(rejectedLayout.pages[0]?.id);

    await act(async () => { await vi.advanceTimersByTimeAsync(500); });

    expect(fetchMock.mock.calls.length).toBeGreaterThan(fetchesBeforeSave);
    expect(result.current.layout.pages[0]?.id).toBe(storedLayout.pages[0]?.id);
  });

  it('clears saveForbidden once a later save succeeds', async () => {
    const liveRecord = {
      id: 'live',
      displayName: 'Live',
      firstSeenAt: 0,
      lastSeenAt: 0,
      layout: defaultLayoutForSurface('y70'),
    };
    fetchMock.mockResolvedValue({ found: true, record: liveRecord });
    patchMock
      .mockResolvedValueOnce({ ok: false, status: 403, msg: 'deck_action_requires_desktop' })
      .mockResolvedValueOnce({ ok: true, record: liveRecord });

    const { result } = renderHook(() => usePanelLayout('live', 'y70'));
    await waitFor(() => expect(result.current.loaded).toBe(true));

    act(() => { result.current.setLayout(defaultLayoutForSurface('y70')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(result.current.saveForbidden).toBe(true);

    act(() => { result.current.setLayout(defaultLayoutForSurface('y70')); });
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(result.current.saveForbidden).toBe(false);
  });

  it('clears deviceMissing when a fresh fetch finds the record again', async () => {
    fetchMock.mockImplementation((id: string) =>
      id === 'reborn-2'
        ? Promise.resolve({
            found: true,
            record: {
              id: 'reborn-2',
              displayName: 'Reborn 2',
              firstSeenAt: 0,
              lastSeenAt: 0,
              layout: defaultLayoutForSurface('y70'),
            },
          })
        : Promise.resolve({ found: false, status: 404 }),
    );

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => usePanelLayout(id, 'y70'),
      { initialProps: { id: 'reborn-1' } },
    );
    await waitFor(() => expect(result.current.deviceMissing).toBe(true));

    rerender({ id: 'reborn-2' });

    await waitFor(() => expect(result.current.deviceMissing).toBe(false));
  });
});
