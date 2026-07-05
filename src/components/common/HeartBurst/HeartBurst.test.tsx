import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useHeartBurstTrigger } from './HeartBurst';

describe('useHeartBurstTrigger', () => {
  it('stays at 0 while never active', () => {
    const { result, rerender } = renderHook(({ active }) => useHeartBurstTrigger(active), {
      initialProps: { active: false },
    });
    expect(result.current).toBe(0);
    rerender({ active: false });
    expect(result.current).toBe(0);
  });

  it('does not fire on mount even if already active', () => {
    const { result } = renderHook(({ active }) => useHeartBurstTrigger(active), {
      initialProps: { active: true },
    });
    expect(result.current).toBe(0);
  });

  it('increments only on a false-to-true edge', () => {
    const { result, rerender } = renderHook(({ active }) => useHeartBurstTrigger(active), {
      initialProps: { active: false },
    });
    rerender({ active: true });
    expect(result.current).toBe(1);
    // Staying true does not re-fire.
    rerender({ active: true });
    expect(result.current).toBe(1);
  });

  it('fires again on a second off-to-on flip', () => {
    const { result, rerender } = renderHook(({ active }) => useHeartBurstTrigger(active), {
      initialProps: { active: false },
    });
    rerender({ active: true });
    rerender({ active: false });
    rerender({ active: true });
    expect(result.current).toBe(2);
  });

  it('does not increment on an on-to-off flip', () => {
    const { result, rerender } = renderHook(({ active }) => useHeartBurstTrigger(active), {
      initialProps: { active: true },
    });
    rerender({ active: false });
    expect(result.current).toBe(0);
  });

  it('treats a null-to-true hydration (server load, not a click) as the baseline, not a burst', () => {
    const { result, rerender } = renderHook(({ active }: { active: boolean | null }) => useHeartBurstTrigger(active), {
      initialProps: { active: null },
    });
    rerender({ active: true });
    expect(result.current).toBe(0);
    // A genuine toggle after hydration still fires normally.
    rerender({ active: false });
    rerender({ active: true });
    expect(result.current).toBe(1);
  });
});
