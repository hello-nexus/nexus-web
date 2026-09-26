// Unit-level coverage for the SDK's useAppData hook: CAS/retry, the adopt-push
// on a 409, live pushes from another instance, and the no-bridge (preview /
// missing capability) fallback. Drives the hook through a fake WidgetHostApi,
// never a real worker or service - the wire contract itself is covered by
// nexus-service's tests.
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ContextProvider, createStore, type AppDataDoc, type AppDataPutResult, type WidgetContextInit, type WidgetHostApi } from '../../../sdk/runtime/context';
import { useAppData } from '../../../sdk/runtime/hooks';

function makeInit(api: Partial<WidgetHostApi>, overrides: Partial<WidgetContextInit> = {}): WidgetContextInit {
  return {
    instanceId: 'inst-1',
    widgetId: 'com.hellonexus.testapp',
    size: { width: 100, height: 100 },
    settings: {},
    local: {},
    api: { persistLocal: () => {}, dispatch: async () => null, ...api },
    ...overrides,
  };
}

function wrapperFor(init: WidgetContextInit) {
  const store = createStore(init);
  const Wrapper = ({ children }: { children: ReactNode }) =>
    createElement(ContextProvider, { store }, children);
  return { store, Wrapper };
}

describe('useAppData - bridged (appData capability granted)', () => {
  it('is not ready until the initial GET resolves, then reflects its document', async () => {
    const doc: AppDataDoc = { revision: 3, updatedAt: '2026-01-01T00:00:00Z', data: { coins: 7 } };
    const appDataGet = vi.fn().mockResolvedValue(doc);
    const { Wrapper } = wrapperFor(makeInit({ appDataGet, appDataPut: vi.fn() }));

    const { result } = renderHook(() => useAppData('save', { coins: 0 }), { wrapper: Wrapper });

    expect(result.current.ready).toBe(false);
    expect(result.current.value).toEqual({ coins: 0 });

    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.value).toEqual({ coins: 7 });
    expect(result.current.revision).toBe(3);
    expect(appDataGet).toHaveBeenCalledWith('save');
  });

  it('an absent doc (revision 0, data null) is ready but keeps the initial value', async () => {
    const appDataGet = vi.fn().mockResolvedValue({ revision: 0, updatedAt: '', data: null });
    const { Wrapper } = wrapperFor(makeInit({ appDataGet, appDataPut: vi.fn() }));

    const { result } = renderHook(() => useAppData('save', { coins: 0 }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.value).toEqual({ coins: 0 });
    expect(result.current.revision).toBe(0);
  });

  it('an absent doc with the data field omitted (the service drops nulls) keeps the initial value', async () => {
    const appDataGet = vi.fn().mockResolvedValue({ revision: 0, updatedAt: '' });
    const { Wrapper } = wrapperFor(makeInit({ appDataGet, appDataPut: vi.fn() }));

    const { result } = renderHook(() => useAppData('save', { coins: 0 }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));
    expect(result.current.value).toEqual({ coins: 0 });
    expect(result.current.revision).toBe(0);
  });

  it('update(fn) writes with the current revision as baseRevision and applies the result', async () => {
    const appDataGet = vi.fn().mockResolvedValue({ revision: 1, updatedAt: 't1', data: { coins: 1 } });
    const appDataPut = vi.fn().mockResolvedValue({ ok: true, revision: 2, updatedAt: 't2' } satisfies AppDataPutResult);
    const { result } = renderHook(() => useAppData('save', { coins: 0 }), {
      wrapper: wrapperFor(makeInit({ appDataGet, appDataPut })).Wrapper,
    });
    await waitFor(() => expect(result.current.ready).toBe(true));

    let ok = false;
    await act(async () => { ok = await result.current.update((c) => ({ coins: c.coins + 1 })); });

    expect(ok).toBe(true);
    expect(appDataPut).toHaveBeenCalledWith('save', 1, { coins: 2 });
    expect(result.current.value).toEqual({ coins: 2 });
    expect(result.current.revision).toBe(2);
  });

  it('adopts the 409 conflict document and retries fn against it', async () => {
    const appDataGet = vi.fn().mockResolvedValue({ revision: 1, updatedAt: 't1', data: { coins: 1 } });
    const appDataPut = vi.fn()
      .mockResolvedValueOnce({ ok: false, revision: 5, updatedAt: 't5', data: { coins: 5 } } satisfies AppDataPutResult)
      .mockResolvedValueOnce({ ok: true, revision: 6, updatedAt: 't6' } satisfies AppDataPutResult);
    const { result } = renderHook(() => useAppData('save', { coins: 0 }), {
      wrapper: wrapperFor(makeInit({ appDataGet, appDataPut })).Wrapper,
    });
    await waitFor(() => expect(result.current.ready).toBe(true));

    let ok = false;
    await act(async () => { ok = await result.current.update((c) => ({ coins: c.coins + 1 })); });

    expect(ok).toBe(true);
    expect(appDataPut).toHaveBeenCalledTimes(2);
    expect(appDataPut).toHaveBeenNthCalledWith(1, 'save', 1, { coins: 2 });
    // Second attempt re-applies fn to the adopted revision-5 document (coins: 5).
    expect(appDataPut).toHaveBeenNthCalledWith(2, 'save', 5, { coins: 6 });
    expect(result.current.value).toEqual({ coins: 6 });
    expect(result.current.revision).toBe(6);
  });

  it('gives up after repeated conflicts and returns false', async () => {
    const appDataGet = vi.fn().mockResolvedValue({ revision: 1, updatedAt: 't1', data: { coins: 1 } });
    const appDataPut = vi.fn().mockResolvedValue(
      { ok: false, revision: 2, updatedAt: 't2', data: { coins: 2 } } satisfies AppDataPutResult,
    );
    const { result } = renderHook(() => useAppData('save', { coins: 0 }), {
      wrapper: wrapperFor(makeInit({ appDataGet, appDataPut })).Wrapper,
    });
    await waitFor(() => expect(result.current.ready).toBe(true));

    let ok = true;
    await act(async () => { ok = await result.current.update((c) => ({ coins: c.coins + 1 })); });

    expect(ok).toBe(false);
    expect(appDataPut).toHaveBeenCalledTimes(5);
  });

  it('put() is a single CAS attempt: a stale base returns the conflict without retrying', async () => {
    const appDataGet = vi.fn().mockResolvedValue({ revision: 1, updatedAt: 't1', data: { coins: 1 } });
    const appDataPut = vi.fn().mockResolvedValue(
      { ok: false, revision: 4, updatedAt: 't4', data: { coins: 4 } } satisfies AppDataPutResult,
    );
    const { result } = renderHook(() => useAppData('save', { coins: 0 }), {
      wrapper: wrapperFor(makeInit({ appDataGet, appDataPut })).Wrapper,
    });
    await waitFor(() => expect(result.current.ready).toBe(true));

    let outcome;
    await act(async () => { outcome = await result.current.put(1, { coins: 99 }); });

    expect(appDataPut).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ ok: false, revision: 4, data: { coins: 4 } });
    // The conflict document is still applied to value/revision immediately.
    expect(result.current.value).toEqual({ coins: 4 });
    expect(result.current.revision).toBe(4);
  });

  it('put() applies an accepted write immediately', async () => {
    const appDataGet = vi.fn().mockResolvedValue({ revision: 1, updatedAt: 't1', data: { coins: 1 } });
    const appDataPut = vi.fn().mockResolvedValue({ ok: true, revision: 2, updatedAt: 't2' } satisfies AppDataPutResult);
    const { result } = renderHook(() => useAppData('save', { coins: 0 }), {
      wrapper: wrapperFor(makeInit({ appDataGet, appDataPut })).Wrapper,
    });
    await waitFor(() => expect(result.current.ready).toBe(true));

    let outcome;
    await act(async () => { outcome = await result.current.put(1, { coins: 42 }); });

    expect(outcome).toEqual({ ok: true, revision: 2 });
    expect(result.current.value).toEqual({ coins: 42 });
    expect(result.current.revision).toBe(2);
  });

  it('a live push from another instance updates value/revision without a local write', async () => {
    const appDataGet = vi.fn().mockResolvedValue({ revision: 1, updatedAt: 't1', data: { coins: 1 } });
    const { store, Wrapper } = wrapperFor(makeInit({ appDataGet, appDataPut: vi.fn() }));
    const { result } = renderHook(() => useAppData('save', { coins: 0 }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.ready).toBe(true));

    act(() => { store.applyAppData('save', { revision: 2, updatedAt: 't2', data: { coins: 9 } }); });
    expect(result.current.value).toEqual({ coins: 9 });
    expect(result.current.revision).toBe(2);

    // A stale push (revision <= current) is ignored.
    act(() => { store.applyAppData('save', { revision: 2, updatedAt: 'stale', data: { coins: -1 } }); });
    expect(result.current.value).toEqual({ coins: 9 });
    expect(result.current.revision).toBe(2);
  });

  it('a transient network failure during put() does not adopt a bogus document', async () => {
    const appDataGet = vi.fn().mockResolvedValue({ revision: 1, updatedAt: 't1', data: { coins: 1 } });
    const appDataPut = vi.fn().mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useAppData('save', { coins: 0 }), {
      wrapper: wrapperFor(makeInit({ appDataGet, appDataPut })).Wrapper,
    });
    await waitFor(() => expect(result.current.ready).toBe(true));

    let outcome;
    await act(async () => { outcome = await result.current.put(1, { coins: 5 }); });

    expect(outcome).toEqual({ ok: false, revision: 1, data: { coins: 1 } });
    expect(result.current.value).toEqual({ coins: 1 });
  });
});

describe('useAppData - initial GET retry with backoff', () => {
  it('retries a failing initial read with backoff and becomes ready once it lands', async () => {
    vi.useFakeTimers();
    try {
      const appDataGet = vi.fn()
        .mockRejectedValueOnce(new Error('offline'))
        .mockRejectedValueOnce(new Error('offline'))
        .mockResolvedValueOnce({ revision: 2, updatedAt: 't2', data: { coins: 2 } });
      const { result } = renderHook(() => useAppData('save', { coins: 0 }), {
        wrapper: wrapperFor(makeInit({ appDataGet, appDataPut: vi.fn() })).Wrapper,
      });

      // The first attempt fires on mount; flush its rejection.
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(appDataGet).toHaveBeenCalledTimes(1);
      expect(result.current.ready).toBe(false);

      await act(async () => { await vi.advanceTimersByTimeAsync(500); });
      expect(appDataGet).toHaveBeenCalledTimes(2);
      expect(result.current.ready).toBe(false);

      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
      expect(appDataGet).toHaveBeenCalledTimes(3);
      expect(result.current.ready).toBe(true);
      expect(result.current.value).toEqual({ coins: 2 });
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops retrying once the widget unmounts', async () => {
    vi.useFakeTimers();
    try {
      const appDataGet = vi.fn().mockRejectedValue(new Error('offline'));
      const { unmount } = renderHook(() => useAppData('save', { coins: 0 }), {
        wrapper: wrapperFor(makeInit({ appDataGet, appDataPut: vi.fn() })).Wrapper,
      });
      await act(async () => { await Promise.resolve(); });
      expect(appDataGet).toHaveBeenCalledTimes(1);

      unmount();
      await act(async () => { await vi.advanceTimersByTimeAsync(20000); });
      expect(appDataGet).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('useAppData - no bridge (preview or missing appData capability)', () => {
  it('is ready immediately and update()/put() apply in memory with no host calls', async () => {
    const { result } = renderHook(() => useAppData('save', { coins: 0 }), {
      wrapper: wrapperFor(makeInit({})).Wrapper,
    });

    expect(result.current.ready).toBe(true);
    expect(result.current.value).toEqual({ coins: 0 });

    let ok = false;
    await act(async () => { ok = await result.current.update((c) => ({ coins: c.coins + 1 })); });
    expect(ok).toBe(true);
    expect(result.current.value).toEqual({ coins: 1 });
    expect(result.current.revision).toBe(1);

    let outcome;
    await act(async () => { outcome = await result.current.put(1, { coins: 10 }); });
    expect(outcome).toEqual({ ok: true, revision: 2 });
    expect(result.current.value).toEqual({ coins: 10 });

    // A stale base is rejected the same as the bridged CAS path.
    let stale;
    await act(async () => { stale = await result.current.put(1, { coins: 999 }); });
    expect(stale).toEqual({ ok: false, revision: 2, data: { coins: 10 } });
  });
});
