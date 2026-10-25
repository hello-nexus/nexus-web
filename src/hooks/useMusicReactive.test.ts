import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMusicReactive } from './useMusicReactive';

const api = vi.hoisted(() => ({
  reads: [] as { enabled?: boolean; resolve: (v: { enabled: boolean }) => void }[],
  writes: [] as { value: boolean; resolve: (v: object) => void }[],
}));

vi.mock('../api/lighting', () => ({
  fetchMusicReactive: () => new Promise(resolve => { api.reads.push({ resolve: resolve as (v: { enabled: boolean }) => void }); }),
  setMusicReactive: (value: boolean) => new Promise(resolve => { api.writes.push({ value, resolve: resolve as (v: object) => void }); }),
}));

describe('useMusicReactive', () => {
  beforeEach(() => { api.reads.length = 0; api.writes.length = 0; });
  // Release anything still pending so no request leaks into the next test.
  afterEach(async () => {
    await act(async () => {
      api.writes.forEach(w => w.resolve({}));
      api.reads.forEach(r => r.resolve({ enabled: true }));
    });
  });

  it('keeps a toggle when a read that started before the write lands after it', async () => {
    const early = renderHook(() => useMusicReactive(true));
    const mine = renderHook(() => useMusicReactive(true));
    await waitFor(() => expect(api.reads.length).toBe(2));
    // Both mount reads settle: the flag starts on.
    await act(async () => { api.reads.forEach(r => r.resolve({ enabled: true })); });
    await waitFor(() => expect(mine.result.current.enabled).toBe(true));

    // The other instance starts a read before this one writes.
    act(() => { early.result.current.refresh(); });
    const staleRead = api.reads[2];

    act(() => { mine.result.current.toggle(); });
    expect(mine.result.current.enabled).toBe(false);
    // The write settles first, then this instance re-reads and sees the new value.
    await act(async () => { api.writes[0].resolve({}); });
    await waitFor(() => expect(api.reads.length).toBe(4));
    await act(async () => { api.reads[3].resolve({ enabled: false }); });
    // The read that predates the write finally lands with the old value.
    await act(async () => { staleRead.resolve({ enabled: true }); });

    expect(mine.result.current.enabled).toBe(false);
  });

  it('ignores a read that predates a toggle made meanwhile', async () => {
    const { result } = renderHook(() => useMusicReactive(true));
    await waitFor(() => expect(api.reads.length).toBe(1));
    act(() => { result.current.toggle(); });
    await act(async () => { api.reads[0].resolve({ enabled: false }); });
    expect(result.current.enabled).toBe(true);
  });

  it('refresh re-reads without a multiplex connection', async () => {
    const { result } = renderHook(() => useMusicReactive(true));
    await waitFor(() => expect(api.reads.length).toBe(1));
    act(() => { result.current.refresh(); });
    expect(api.reads.length).toBe(2);
    await act(async () => { api.reads[1].resolve({ enabled: false }); });
    await waitFor(() => expect(result.current.enabled).toBe(false));
  });

  it('reads nothing while inactive', () => {
    renderHook(() => useMusicReactive(false));
    expect(api.reads.length).toBe(0);
  });
});
