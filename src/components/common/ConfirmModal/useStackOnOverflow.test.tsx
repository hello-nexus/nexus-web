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
    Object.defineProperty(el, 'scrollWidth', { value: 100, configurable: true });
    widen(150);
    observeCb?.();
    flush();
    expect(el.classList.contains('stacked')).toBe(true);
    widen(100);
    window.dispatchEvent(new Event('resize'));
    flush();
    expect(el.classList.contains('stacked')).toBe(false);
  });

  it('disconnects and cancels the pending frame on unmount', () => {
    const { view } = mount();
    observeCb?.();
    view.unmount();
    expect(disconnect).toHaveBeenCalled();
    expect(cancel).toHaveBeenCalled();
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
