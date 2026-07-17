import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { useProcessIcon } from './useProcessIcon';

vi.mock('../api/processIcon', () => ({ fetchProcessIcon: vi.fn() }));

import { fetchProcessIcon } from '../api/processIcon';

describe('useProcessIcon', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    global.URL.createObjectURL = vi.fn(() => `blob:${Math.random()}`);
    global.URL.revokeObjectURL = vi.fn();
  });

  it('returns null when no name is provided', () => {
    const { result } = renderHook(() => useProcessIcon(undefined));
    expect(result.current).toBeNull();
  });

  it('resolves the real endpoint and returns an object URL', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    vi.mocked(fetchProcessIcon).mockResolvedValue(blob);

    const { result } = renderHook(() => useProcessIcon('proc-a.exe'));
    await waitFor(() => expect(result.current).toMatch(/^blob:/));

    expect(fetchProcessIcon).toHaveBeenCalledWith('proc-a.exe');
  });

  it('falls back to the dev mock when the real endpoint has no icon for a curated name (vitest runs in dev mode)', async () => {
    vi.mocked(fetchProcessIcon).mockResolvedValue(null);

    const { result } = renderHook(() => useProcessIcon('chrome.exe'));
    // Crosses a real dynamic import() (the dev-mock module) - waits on the
    // actual resolved value rather than a fixed timer, which is not
    // reliably long enough under load (contended CI / concurrent test runs).
    await waitFor(() => expect(result.current).toMatch(/^blob:/));
  });

  it('negative-caches an unresolvable name so a second mount does not re-fetch', async () => {
    vi.mocked(fetchProcessIcon).mockResolvedValue(null);

    const first = renderHook(() => useProcessIcon('proc-negcache.exe'));
    await waitFor(() => expect(fetchProcessIcon).toHaveBeenCalledTimes(1));
    expect(first.result.current).toBeNull();

    const second = renderHook(() => useProcessIcon('proc-negcache.exe'));
    await waitFor(() => expect(second.result.current).toBeNull());
    // Still exactly one real fetch for this name across both mounts.
    expect(fetchProcessIcon).toHaveBeenCalledTimes(1);
  });

  it('resolved-caches a name so a later mount renders instantly without a fetch', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    vi.mocked(fetchProcessIcon).mockResolvedValue(blob);

    const first = renderHook(() => useProcessIcon('proc-poscache.exe'));
    await waitFor(() => expect(first.result.current).toMatch(/^blob:/));
    const url = first.result.current;

    vi.mocked(fetchProcessIcon).mockClear();
    const second = renderHook(() => useProcessIcon('proc-poscache.exe'));
    // Synchronous initial state from the cache - no need to await a fetch.
    expect(second.result.current).toBe(url);
    expect(fetchProcessIcon).not.toHaveBeenCalled();
  });

  it('dedups two concurrent mounts for the same never-seen name into one fetch', async () => {
    const blob = new Blob(['png'], { type: 'image/png' });
    let resolveFetch!: (b: Blob | null) => void;
    vi.mocked(fetchProcessIcon).mockReturnValue(new Promise(res => { resolveFetch = res; }));

    const a = renderHook(() => useProcessIcon('proc-dedup.exe'));
    const b = renderHook(() => useProcessIcon('proc-dedup.exe'));

    act(() => { resolveFetch(blob); });
    await waitFor(() => expect(a.result.current).toMatch(/^blob:/));

    expect(fetchProcessIcon).toHaveBeenCalledTimes(1);
    expect(a.result.current).toBe(b.result.current);
  });

  it('caps concurrent icon fetches for new names so the connection pool keeps headroom', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const releases: Array<() => void> = [];
    vi.mocked(fetchProcessIcon).mockImplementation(() => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      return new Promise<Blob>(resolve => {
        releases.push(() => { inFlight--; resolve(new Blob(['x'], { type: 'image/png' })); });
      });
    });

    const hooks = Array.from({ length: 8 }, (_, i) => renderHook(() => useProcessIcon(`proc-cap-${i}.exe`)));
    await waitFor(() => expect(releases.length).toBe(3));
    expect(maxInFlight).toBe(3);

    // Draining one at a time admits exactly the next queued fetch (never
    // exceeding the cap) until all 8 names have been fetched. waitFor polls
    // for the next release to appear rather than assuming a fixed number of
    // microtask hops, so this is robust under CI/contention timing noise.
    for (let i = 0; i < 8; i++) {
      await waitFor(() => expect(releases.length).toBeGreaterThan(0));
      const release = releases.shift()!;
      act(() => { release(); });
    }
    await waitFor(() => expect(fetchProcessIcon).toHaveBeenCalledTimes(8));
    expect(maxInFlight).toBe(3);
    hooks.forEach(h => h.unmount());
  });
});
