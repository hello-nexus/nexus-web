import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMusicReactive } from './useMusicReactive';

const api = vi.hoisted(() => ({
  resolveRead: null as null | ((v: { enabled: boolean }) => void),
  reads: 0,
  writes: [] as boolean[],
}));

vi.mock('../api/lighting', () => ({
  fetchMusicReactive: () => {
    api.reads += 1;
    return new Promise(resolve => { api.resolveRead = resolve as (v: { enabled: boolean }) => void; });
  },
  setMusicReactive: (enabled: boolean) => { api.writes.push(enabled); return Promise.resolve({}); },
}));

describe('useMusicReactive', () => {
  // A write re-reads when it settles; release that read so no request stays in flight across tests.
  afterEach(async () => { await act(async () => { api.resolveRead?.({ enabled: true }); }); });

  beforeEach(() => { api.resolveRead = null; api.reads = 0; api.writes.length = 0; });

  it('does not let a read that was pending revert a toggle made meanwhile', async () => {
    const { result } = renderHook(() => useMusicReactive(true));
    await waitFor(() => expect(api.resolveRead).not.toBeNull());
    const staleRead = api.resolveRead!;

    act(() => { result.current.toggle(); });
    expect(result.current.enabled).toBe(true);
    await act(async () => { staleRead({ enabled: false }); });
    expect(result.current.enabled).toBe(true);
    expect(api.writes).toEqual([true]);
  });

  it('reads nothing while inactive', () => {
    renderHook(() => useMusicReactive(false));
    expect(api.reads).toBe(0);
  });

  it('shares one request between hooks that read together', () => {
    renderHook(() => { useMusicReactive(true); useMusicReactive(true); });
    expect(api.reads).toBe(1);
  });
});
