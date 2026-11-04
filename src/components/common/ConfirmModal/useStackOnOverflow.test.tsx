import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/react';
import { measureStack, useStackOnOverflow } from './useStackOnOverflow';

function footer(scrollWidth: number, clientWidth: number) {
  const el = document.createElement('div');
  Object.defineProperty(el, 'scrollWidth', { value: scrollWidth, configurable: true });
  Object.defineProperty(el, 'clientWidth', { value: clientWidth, configurable: true });
  return el;
}

describe('measureStack', () => {
  it('stacks when the row overflows', () => {
    const el = footer(120, 100);
    measureStack(el, 'stacked');
    expect(el.classList.contains('stacked')).toBe(true);
  });

  it('does not stack at equal width or one pixel of rounding', () => {
    for (const sw of [100, 101]) {
      const el = footer(sw, 100);
      measureStack(el, 'stacked');
      expect(el.classList.contains('stacked')).toBe(false);
    }
  });

  it('drops a stale stacked class when the row fits again', () => {
    const el = footer(100, 100);
    el.classList.add('stacked');
    measureStack(el, 'stacked');
    expect(el.classList.contains('stacked')).toBe(false);
  });
});

describe('useStackOnOverflow', () => {
  let observeCb: (() => void) | null = null;
  const disconnect = vi.fn();
  let frames: Array<() => void> = [];
  const cancel = vi.fn();
  const fontsTarget = new EventTarget();

  beforeEach(() => {
    observeCb = null;
    frames = [];
    disconnect.mockClear();
    cancel.mockClear();
    class FakeRO {
      constructor(cb: () => void) { observeCb = cb; }
      observe() {}
      disconnect = disconnect;
    }
    vi.stubGlobal('ResizeObserver', FakeRO);
    vi.stubGlobal('requestAnimationFrame', (cb: () => void) => { frames.push(cb); return frames.length; });
    vi.stubGlobal('cancelAnimationFrame', cancel);
    Object.defineProperty(document, 'fonts', { value: fontsTarget, configurable: true });
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  function mount(active = true) {
    const el = footer(100, 100);
    const ref = { current: el };
    const view = renderHook(({ a }) => useStackOnOverflow(ref, 'stacked', a), { initialProps: { a: active } });
    return { el, view };
  }

  function flush() { const run = frames; frames = []; run.forEach(f => f()); }

  it('measures on an observer callback and on a window resize', () => {
    const { el } = mount();
    const widen = (sw: number) => Object.defineProperty(el, 'scrollWidth', { value: sw, configurable: true });
    widen(150);
    observeCb?.();
    flush();
    expect(el.classList.contains('stacked')).toBe(true);
    widen(100);
    window.dispatchEvent(new Event('resize'));
    flush();
    expect(el.classList.contains('stacked')).toBe(false);
  });

  it('disconnects, cancels the pending frame and stops measuring after unmount', () => {
    const { el, view } = mount();
    Object.defineProperty(el, 'scrollWidth', { value: 150, configurable: true });
    observeCb?.();
    const pending = frames.length;
    view.unmount();
    expect(disconnect).toHaveBeenCalled();
    expect(cancel).toHaveBeenLastCalledWith(pending);
    frames = [];
    window.dispatchEvent(new Event('resize'));
    fontsTarget.dispatchEvent(new Event('loadingdone'));
    expect(frames).toHaveLength(0);
  });

  it('schedules a measure on loadingdone while active', () => {
    const { el } = mount();
    Object.defineProperty(el, 'scrollWidth', { value: 150, configurable: true });
    fontsTarget.dispatchEvent(new Event('loadingdone'));
    flush();
    expect(el.classList.contains('stacked')).toBe(true);
  });

  it('schedules nothing after going inactive', () => {
    const { view } = mount();
    view.rerender({ a: false });
    frames = [];
    window.dispatchEvent(new Event('resize'));
    fontsTarget.dispatchEvent(new Event('loadingdone'));
    expect(frames).toHaveLength(0);
  });

  it('attaches nothing while inactive', () => {
    mount(false);
    expect(observeCb).toBeNull();
  });

  it('still reacts to resize when ResizeObserver is undefined', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const { el } = mount();
    Object.defineProperty(el, 'scrollWidth', { value: 150, configurable: true });
    window.dispatchEvent(new Event('resize'));
    flush();
    expect(el.classList.contains('stacked')).toBe(true);
  });
});
