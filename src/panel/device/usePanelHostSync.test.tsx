import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEASE_RENEW_MS, usePanelHitTest } from './usePanelHostSync';

const sent: Array<Record<string, unknown>> = [];
const rootRef = { current: null };

beforeEach(() => {
  vi.useFakeTimers();
  sent.length = 0;
  (window as unknown as Record<string, unknown>).chrome = { webview: { postMessage: (m: Record<string, unknown>) => sent.push(m) } };
});
afterEach(() => {
  vi.useRealTimers();
  delete (window as unknown as Record<string, unknown>).chrome;
});

const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(20); }); };

describe('usePanelHitTest', () => {
  it('reports a region while click-through, a steady full when it is off', async () => {
    const { rerender } = renderHook(({ ct }) => usePanelHitTest(true, ct, false, rootRef, 'a'), { initialProps: { ct: true } });
    await flush();
    expect(sent.at(-1)).toMatchObject({ mode: 'region' });
    rerender({ ct: false });
    await flush();
    expect(sent.at(-1)).toMatchObject({ mode: 'full', rects: [] });
    expect(sent.at(-1)).not.toHaveProperty('lease');
  });

  it('leases a transient full, renews it, and returns to the region when it ends', async () => {
    const { rerender } = renderHook(({ full }) => usePanelHitTest(true, true, full, rootRef, 'a'), { initialProps: { full: true } });
    await flush();
    expect(sent.at(-1)).toMatchObject({ mode: 'full', lease: true });
    const before = sent.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(LEASE_RENEW_MS * 2); });
    expect(sent.length).toBe(before + 2);
    rerender({ full: false });
    await flush();
    expect(sent.at(-1)).toMatchObject({ mode: 'region' });
    const after = sent.length;
    await act(async () => { await vi.advanceTimersByTimeAsync(LEASE_RENEW_MS * 2); });
    expect(sent.length).toBe(after);
  });

  it('re-sends on a host request and stays silent when inactive', async () => {
    renderHook(() => usePanelHitTest(true, true, false, rootRef, 'a'));
    await flush();
    const before = sent.length;
    (window as unknown as { __nexusPanelHost: { requestHitTest(): void } }).__nexusPanelHost.requestHitTest();
    expect(sent.length).toBe(before + 1);
    sent.length = 0;
    renderHook(() => usePanelHitTest(false, true, false, rootRef, 'a'));
    await flush();
    expect(sent).toHaveLength(0);
  });
});
