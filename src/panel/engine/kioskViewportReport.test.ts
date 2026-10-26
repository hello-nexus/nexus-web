import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isHostKiosk, kioskViewportReporter } from './kioskViewportReport';

function fakeWindow(search: string, size = { w: 1920, h: 1152 }) {
  const listeners = new Map<string, () => void>();
  const win = {
    location: { search },
    innerWidth: size.w,
    innerHeight: size.h,
    devicePixelRatio: 1,
    addEventListener: (name: string, cb: () => void) => { listeners.set(name, cb); },
    removeEventListener: (name: string) => { listeners.delete(name); },
  } as unknown as Window;
  Object.assign(win, { top: win, self: win });
  return { win, listeners };
}

describe('kiosk viewport report', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('only a host-launched top-level window reports', () => {
    expect(isHostKiosk(fakeWindow('?originX=0&originY=0').win)).toBe(true);
    expect(isHostKiosk(fakeWindow('').win)).toBe(false);
    expect(isHostKiosk(fakeWindow('?originX=0&simulator=1').win)).toBe(false);
    const framed = fakeWindow('?originX=0').win;
    Object.assign(framed, { top: {} });
    expect(isHostKiosk(framed)).toBe(false);
  });

  it('reports the measured size once after the debounce and skips an unchanged value', () => {
    const { win } = fakeWindow('?originX=0');
    const report = vi.fn();
    const stop = kioskViewportReporter(win, 'r1', () => null, report);
    vi.advanceTimersByTime(499);
    expect(report).not.toHaveBeenCalled();
    vi.advanceTimersByTime(2);
    expect(report).toHaveBeenCalledWith('r1', { cssWidth: 1920, cssHeight: 1152, dpr: 1 });
    stop();
    const quiet = vi.fn();
    kioskViewportReporter(win, 'r1', () => ({ cssWidth: 1920, cssHeight: 1152, dpr: 1 }), quiet);
    vi.advanceTimersByTime(1000);
    expect(quiet).not.toHaveBeenCalled();
  });

  it('a resize burst reports once', () => {
    const { win, listeners } = fakeWindow('?originX=0');
    const report = vi.fn();
    kioskViewportReporter(win, 'r1', () => ({ cssWidth: 1920, cssHeight: 1152, dpr: 1 }), report);
    vi.advanceTimersByTime(600);
    Object.assign(win, { innerHeight: 1100 });
    listeners.get('resize')!(); vi.advanceTimersByTime(200); listeners.get('resize')!();
    vi.advanceTimersByTime(600);
    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith('r1', { cssWidth: 1920, cssHeight: 1100, dpr: 1 });
  });
});
