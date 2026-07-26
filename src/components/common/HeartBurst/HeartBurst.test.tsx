import { render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { HeartBurst, useHeartBurstTrigger } from './HeartBurst';

describe('HeartBurst', () => {
  // The suite-wide matchMedia stub (setup.ts) answers `matches: true` for any
  // non-"light" query, so prefers-reduced-motion would suppress the burst.
  const stubbedMatchMedia = window.matchMedia;
  beforeEach(() => {
    window.matchMedia = (query: string) =>
      ({ ...stubbedMatchMedia(query), matches: false }) as MediaQueryList;
  });
  afterEach(() => {
    window.matchMedia = stubbedMatchMedia;
  });

  it('renders no hearts before a burst', () => {
    render(<HeartBurst burstKey={0} />);
    expect(document.body.querySelectorAll('svg')).toHaveLength(0);
  });

  it('portals hearts to document.body on a rising burstKey, outside the anchor wrapper', () => {
    const { container, rerender } = render(<HeartBurst burstKey={0} />);
    rerender(<HeartBurst burstKey={1} />);
    const hearts = document.body.querySelectorAll('svg');
    expect(hearts.length).toBeGreaterThan(0);
    // Hearts live in the body portal, not under the in-place anchor - an
    // in-place render is clipped by scrolling ancestors (settings .tabContent).
    expect(container.querySelectorAll('svg')).toHaveLength(0);
  });
});

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
