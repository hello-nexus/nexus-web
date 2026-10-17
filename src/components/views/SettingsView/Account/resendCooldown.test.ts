import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { remainingSeconds, RESEND_COOLDOWN_SECONDS, useResendCooldown } from './resendCooldown';

describe('remainingSeconds', () => {
  it('rounds partial seconds up and never goes negative', () => {
    expect(remainingSeconds(10_000, 9_001)).toBe(1);
    expect(remainingSeconds(10_000, 10_000)).toBe(0);
    expect(remainingSeconds(10_000, 12_000)).toBe(0);
  });
});

describe('useResendCooldown', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('starts at the initial value, counts down, and restarts', () => {
    const { result } = renderHook(() => useResendCooldown(RESEND_COOLDOWN_SECONDS));
    expect(result.current.remaining).toBe(RESEND_COOLDOWN_SECONDS);

    act(() => { vi.advanceTimersByTime(RESEND_COOLDOWN_SECONDS * 1000); });
    expect(result.current.remaining).toBe(0);

    act(() => { result.current.start(); });
    expect(result.current.remaining).toBe(RESEND_COOLDOWN_SECONDS);

    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.remaining).toBe(RESEND_COOLDOWN_SECONDS - 5);
  });
});
