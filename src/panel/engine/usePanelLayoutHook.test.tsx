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
