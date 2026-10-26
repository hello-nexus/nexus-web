import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LEASE_RENEW_MS, usePanelFrost, usePanelHitTest, usePanelRaise } from './usePanelHostSync';

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

  it('keeps the renewal cadence across signature changes', async () => {
    const { rerender } = renderHook(({ sig }) => usePanelHitTest(true, true, true, rootRef, sig), { initialProps: { sig: 'a' } });
    await flush();
    sent.length = 0;
    await act(async () => { await vi.advanceTimersByTimeAsync(LEASE_RENEW_MS - 500); });
    rerender({ sig: 'b' });
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    // The tick lands at the original cadence, not LEASE_RENEW_MS after the rerender.
    expect(sent.filter(m => m.lease === true).length).toBeGreaterThanOrEqual(1);
  });

  it('sends the steady report and raise false on unmount', async () => {
    const hit = renderHook(() => usePanelHitTest(true, true, true, rootRef, 'a'));
    const raise = renderHook(() => usePanelRaise(true, true));
    await flush();
    sent.length = 0;
    hit.unmount();
    raise.unmount();
    expect(sent.some(m => m.type === 'nexus.panel.hitTest' && m.mode === 'region' && m.lease === undefined)).toBe(true);
    expect(sent.some(m => m.type === 'nexus.panel.raise' && m.value === false)).toBe(true);
  });
});

describe('usePanelFrost', () => {
  const frosts = () => sent.filter(m => m.type === 'nexus.panel.frost');

  function mountCard() {
    const cell = document.createElement('div');
    cell.setAttribute('data-panel-widget-id', 'w1');
    const card = document.createElement('div');
    card.className = 'panel-card';
    card.getBoundingClientRect = () => ({ left: 10, top: 20, right: 110, bottom: 90 }) as DOMRect;
    cell.appendChild(card);
    document.body.appendChild(cell);
    return cell;
  }

  it('reports the card rects on a see-through panel and dedupes an unchanged state', async () => {
    const cell = mountCard();
    const { rerender } = renderHook(({ sig }) => usePanelFrost(true, 70, true, false, rootRef, sig), { initialProps: { sig: 'a' } });
    await flush();
    expect(frosts()).toHaveLength(1);
    expect(frosts()[0]).toMatchObject({ level: 'heavy', percent: 70, rects: [{ x: 10, y: 20, w: 100, h: 70 }] });
    rerender({ sig: 'b' });
    await flush();
    expect(frosts()).toHaveLength(1);
    cell.remove();
  });

  it('sends none when the panel is not see-through, and again on a host request', async () => {
    const cell = mountCard();
    renderHook(() => usePanelFrost(true, 70, false, false, rootRef, 'a'));
    await flush();
    expect(frosts()[0]).toMatchObject({ level: 'none', rects: [] });
    (window as unknown as { __nexusPanelHost: { requestHitTest(): void } }).__nexusPanelHost.requestHitTest();
    expect(frosts()).toHaveLength(2);
    cell.remove();
  });

  it('follows a moving card every frame while dragging', async () => {
    const cell = mountCard();
    const card = cell.firstElementChild as HTMLElement;
    renderHook(() => usePanelFrost(true, 40, true, true, rootRef, 'a'));
    await flush();
    const before = frosts().length;
    card.getBoundingClientRect = () => ({ left: 50, top: 60, right: 150, bottom: 130 }) as DOMRect;
    await flush();
    expect(frosts().length).toBe(before + 1);
    expect(frosts().at(-1)).toMatchObject({ rects: [{ x: 50, y: 60, w: 100, h: 70 }] });
    cell.remove();
  });

  it('stays silent when inactive', async () => {
    renderHook(() => usePanelFrost(false, 70, true, false, rootRef, 'a'));
    await flush();
    expect(frosts()).toHaveLength(0);
  });
});
