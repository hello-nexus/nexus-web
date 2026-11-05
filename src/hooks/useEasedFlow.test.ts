import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FLOW_EASE_STEP_MS } from '../lib/cooling/fanSpeed';
import { useEasedFlow } from './useEasedFlow';

const DIRECT = ['#vent'];

describe('useEasedFlow', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('eases a fan toward a new flow and takes the case-wide keys at once', () => {
    const start = { a: 30, '#vent': 1 };
    const { result, rerender } = renderHook(({ t }) => useEasedFlow(t, DIRECT), { initialProps: { t: start as Record<string, number> } });
    act(() => { vi.advanceTimersByTime(0); });
    const stop = { a: 0, '#vent': 9 };
    rerender({ t: stop });
    expect(result.current!['#vent']).toBe(9);
    act(() => { vi.advanceTimersByTime(FLOW_EASE_STEP_MS); });
    expect(result.current!.a).toBeGreaterThan(0);
    expect(result.current!.a).toBeLessThan(30);
    for (let i = 0; i < 10; i++) act(() => { vi.advanceTimersByTime(FLOW_EASE_STEP_MS); });
    expect(result.current!.a).toBe(0);
  });

  it('keeps stepping while the target keeps changing', () => {
    const { result, rerender } = renderHook(({ t }) => useEasedFlow(t, DIRECT), { initialProps: { t: { a: 30, '#vent': 0 } as Record<string, number> } });
    act(() => { vi.advanceTimersByTime(0); });
    let last = 30;
    for (let i = 0; i < 4; i++) {
      rerender({ t: { a: 0, '#vent': i } });
      act(() => { vi.advanceTimersByTime(FLOW_EASE_STEP_MS); });
      expect(result.current!.a).toBeLessThan(last);
      last = result.current!.a;
    }
  });
});
