import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppIcon } from './AppPicker';

vi.mock('../../../api/service', async importOriginal => ({
  ...await importOriginal<typeof import('../../../api/service')>(),
  fetchService: vi.fn(),
  fetchServiceBlob: vi.fn(),
  fetchServiceBlobWithStatus: vi.fn(),
}));

import { fetchServiceBlobWithStatus } from '../../../api/service';

const topic = vi.hoisted(() => ({ subs: [] as Array<{ topic: string; enabled: boolean; cb: (data: unknown) => void }> }));
vi.mock('../../../hooks/useMultiplexSocket', () => ({
  useTopicCallback: (name: string, enabled: boolean, cb: (data: unknown) => void) => { topic.subs.push({ topic: name, enabled, cb }); },
}));
const lastDeckSub = () => topic.subs.filter(s => s.topic === 'deck').at(-1)!;

const ok = (blob: Blob) => ({ blob, status: 200 });
const miss = (status: number) => ({ blob: null, status });

describe('useAppIcon', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('returns null when no appId provided', () => {
    const { result } = renderHook(() => useAppIcon(undefined));
    expect(result.current).toBeNull();
  });

  it('fetches icon blob and returns object URL', async () => {
    const mockBlob = new Blob(['png-data'], { type: 'image/png' });
    vi.mocked(fetchServiceBlobWithStatus).mockResolvedValue(ok(mockBlob));

    const { result } = renderHook(() => useAppIcon('com.spotify.client'));

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    expect(fetchServiceBlobWithStatus).toHaveBeenCalledWith(
      '/shortcuts/icon?targetId=com.spotify.client'
    );
    expect(result.current).toBe('blob:mock-url');
  });

  it('returns null and stops asking on a 404 (the app has no icon)', async () => {
    vi.mocked(fetchServiceBlobWithStatus).mockResolvedValue(miss(404));

    const { result } = renderHook(() => useAppIcon('missing-app'));

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    expect(result.current).toBeNull();
    expect(fetchServiceBlobWithStatus).toHaveBeenCalledTimes(1);
  });

  it('returns null when blob is empty', async () => {
    const emptyBlob = new Blob([], { type: 'image/png' });
    vi.mocked(fetchServiceBlobWithStatus).mockResolvedValue(ok(emptyBlob));

    const { result } = renderHook(() => useAppIcon('empty-icon'));

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    expect(result.current).toBeNull();
    expect(fetchServiceBlobWithStatus).toHaveBeenCalledTimes(1);
  });

  it('revokes old URL when appId changes', async () => {
    const mockBlob = new Blob(['png'], { type: 'image/png' });
    vi.mocked(fetchServiceBlobWithStatus).mockResolvedValue(ok(mockBlob));

    const { rerender } = renderHook(
      ({ id }) => useAppIcon(id),
      { initialProps: { id: 'app-1' as string | undefined } }
    );

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    rerender({ id: 'app-2' });

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
  });

  it('encodes special characters in targetId', async () => {
    vi.mocked(fetchServiceBlobWithStatus).mockResolvedValue(miss(404));

    renderHook(() => useAppIcon('app with spaces!'));

    await act(async () => {
      await new Promise(r => setTimeout(r, 10));
    });

    expect(fetchServiceBlobWithStatus).toHaveBeenCalledWith(
      '/shortcuts/icon?targetId=app%20with%20spaces!'
    );
  });

  // Many launch buttons / picker rows mounting at once must not occupy all 6
  // browser connections and starve the panel's /ping (the false-offline bug).
  it('caps concurrent icon fetches so the connection pool keeps headroom', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const releases: Array<() => void> = [];
    vi.mocked(fetchServiceBlobWithStatus).mockImplementation(() => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise<{ blob: Blob; status: number }>(resolve => {
        releases.push(() => { inFlight--; resolve(ok(new Blob(['x'], { type: 'image/png' }))); });
      });
    });

    const hooks = Array.from({ length: 8 }, (_, i) => renderHook(() => useAppIcon(`app-${i}`)));
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });

    // Only the cap (3) start; the rest queue behind the permits.
    expect(maxInFlight).toBe(3);
    expect(releases.length).toBe(3);

    // Draining one admits exactly one queued fetch - never exceeding the cap.
    while (releases.length) {
      const release = releases.shift()!;
      await act(async () => { release(); await new Promise(r => setTimeout(r, 5)); });
    }
    expect(maxInFlight).toBe(3);
    expect(fetchServiceBlobWithStatus).toHaveBeenCalledTimes(8);
    hooks.forEach(h => h.unmount());
  });

  // The Fast Startup case: the kiosk deck mounts before the Windows helper
  // that extracts icons has connected, so the service answers 503. One miss
  // must not settle the slot on its placeholder for the panel's lifetime.
  describe('transient misses', () => {
    beforeEach(() => { vi.useFakeTimers(); });
    afterEach(() => { vi.useRealTimers(); });

    const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

    it('retries a 503 with backoff and resolves once the icon is served', async () => {
      const mockBlob = new Blob(['png'], { type: 'image/png' });
      vi.mocked(fetchServiceBlobWithStatus)
        .mockResolvedValueOnce(miss(503))
        .mockResolvedValueOnce(miss(503))
        .mockResolvedValue(ok(mockBlob));

      const { result } = renderHook(() => useAppIcon('app-1'));
      await flush();
      expect(fetchServiceBlobWithStatus).toHaveBeenCalledTimes(1);
      expect(result.current).toBeNull();

      // Below the first backoff step nothing is re-asked.
      await act(async () => { await vi.advanceTimersByTimeAsync(1999); });
      expect(fetchServiceBlobWithStatus).toHaveBeenCalledTimes(1);

      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      await flush();
      expect(fetchServiceBlobWithStatus).toHaveBeenCalledTimes(2);
      expect(result.current).toBeNull();

      // Second step doubles.
      await act(async () => { await vi.advanceTimersByTimeAsync(3999); });
      expect(fetchServiceBlobWithStatus).toHaveBeenCalledTimes(2);
      await act(async () => { await vi.advanceTimersByTimeAsync(1); });
      await flush();
      expect(fetchServiceBlobWithStatus).toHaveBeenCalledTimes(3);
      expect(result.current).toBe('blob:mock-url');

      // Resolved: no further polling.
      await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
      expect(fetchServiceBlobWithStatus).toHaveBeenCalledTimes(3);
    });

    it('does not retry a 401: every 4xx is final', async () => {
      vi.mocked(fetchServiceBlobWithStatus).mockResolvedValue(miss(401));

      const { result } = renderHook(() => useAppIcon('app-1'));
      await flush();
      await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });

      expect(fetchServiceBlobWithStatus).toHaveBeenCalledTimes(1);
      expect(result.current).toBeNull();
    });

    it('treats a transport failure (status 0) as transient too', async () => {
      vi.mocked(fetchServiceBlobWithStatus)
        .mockResolvedValueOnce(miss(0))
        .mockResolvedValue(ok(new Blob(['png'], { type: 'image/png' })));

      const { result } = renderHook(() => useAppIcon('app-1'));
      await flush();
      await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
      await flush();

      expect(fetchServiceBlobWithStatus).toHaveBeenCalledTimes(2);
      expect(result.current).toBe('blob:mock-url');
    });

    it('caps the backoff at 30s', async () => {
      vi.mocked(fetchServiceBlobWithStatus).mockResolvedValue(miss(503));

      renderHook(() => useAppIcon('app-1'));
      await flush();
      // 2s, 4s, 8s, 16s, 30s, 30s ...
      for (const step of [2000, 4000, 8000, 16_000, 30_000, 30_000]) {
        const before = vi.mocked(fetchServiceBlobWithStatus).mock.calls.length;
        await act(async () => { await vi.advanceTimersByTimeAsync(step - 1); });
        expect(fetchServiceBlobWithStatus).toHaveBeenCalledTimes(before);
        await act(async () => { await vi.advanceTimersByTimeAsync(1); });
        await flush();
        expect(fetchServiceBlobWithStatus).toHaveBeenCalledTimes(before + 1);
      }
    });

    it('unmounting cancels a pending retry', async () => {
      vi.mocked(fetchServiceBlobWithStatus).mockResolvedValue(miss(503));

      const { unmount } = renderHook(() => useAppIcon('app-1'));
      await flush();
      expect(fetchServiceBlobWithStatus).toHaveBeenCalledTimes(1);

      unmount();
      await act(async () => { await vi.advanceTimersByTimeAsync(120_000); });
      expect(fetchServiceBlobWithStatus).toHaveBeenCalledTimes(1);
    });
  });

  // Windows: the service broadcasts deck {kind:'icons'} when the user-session
  // helper connects, so a slot still on its placeholder refetches at once.
  describe('icons frame', () => {
    beforeEach(() => { topic.subs.length = 0; });

    it('refetches a missing icon when the helper connects, then unsubscribes', async () => {
      vi.mocked(fetchServiceBlobWithStatus)
        .mockResolvedValueOnce(miss(404))
        .mockResolvedValue(ok(new Blob(['png'], { type: 'image/png' })));

      const { result } = renderHook(() => useAppIcon('app-1'));
      await act(async () => { await new Promise(r => setTimeout(r, 10)); });
      expect(fetchServiceBlobWithStatus).toHaveBeenCalledTimes(1);
      expect(lastDeckSub().enabled).toBe(true);

      await act(async () => { lastDeckSub().cb({ kind: 'icons' }); await new Promise(r => setTimeout(r, 10)); });

      expect(fetchServiceBlobWithStatus).toHaveBeenCalledTimes(2);
      expect(result.current).toBe('blob:mock-url');
      expect(lastDeckSub().enabled).toBe(false);
    });

    it('ignores other deck frame kinds', async () => {
      vi.mocked(fetchServiceBlobWithStatus).mockResolvedValue(miss(404));

      renderHook(() => useAppIcon('app-1'));
      await act(async () => { await new Promise(r => setTimeout(r, 10)); });
      await act(async () => { lastDeckSub().cb({ kind: 'recents' }); await new Promise(r => setTimeout(r, 10)); });

      expect(fetchServiceBlobWithStatus).toHaveBeenCalledTimes(1);
    });
  });
});
