import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useStateChangePulse } from './useStateChangePulse';

function setup(value: unknown, suppress: boolean) {
  return renderHook(
    (props: { value: unknown; suppress: boolean }) => useStateChangePulse(props.value, props.suppress),
    { initialProps: { value, suppress } },
  );
}

describe('useStateChangePulse', () => {
  it('does not pulse on mount', () => {
    const { result } = setup('a', false);
    expect(result.current).toBe(0);
  });

  it('does not pulse when the hydration change and the suppress flip land in one render', () => {
    const { result, rerender } = setup('custom', true);
    rerender({ value: 'balanced', suppress: false });
    expect(result.current).toBe(0);
  });

  it('pulses on each change after hydration', () => {
    const { result, rerender } = setup('custom', true);
    rerender({ value: 'balanced', suppress: false });
    rerender({ value: 'turbo', suppress: false });
    expect(result.current).toBe(1);
    rerender({ value: 'silent', suppress: false });
    expect(result.current).toBe(2);
  });

  it('pulses after a hydration that did not change the value', () => {
    const { result, rerender } = setup('custom', true);
    rerender({ value: 'custom', suppress: false });
    expect(result.current).toBe(0);
    rerender({ value: 'turbo', suppress: false });
    expect(result.current).toBe(1);
  });

  it('never pulses while suppressed', () => {
    const { result, rerender } = setup('a', true);
    rerender({ value: 'b', suppress: true });
    rerender({ value: 'c', suppress: true });
    expect(result.current).toBe(0);
  });
});
