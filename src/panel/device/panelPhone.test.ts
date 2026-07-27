import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useIsLandscape } from './panelPhone';

describe('useIsLandscape', () => {
  const realMatchMedia = window.matchMedia;

  afterEach(() => {
    window.matchMedia = realMatchMedia;
  });

  function stubMatchMedia(matchesLandscape: boolean) {
    window.matchMedia = ((query: string) => ({
      matches: query.includes('landscape') ? matchesLandscape : false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;
  }

  it('honours matchMedia for phone', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useIsLandscape('phone'));
    expect(result.current).toBe(true);
  });

  it('honours matchMedia for a promoted monitor', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useIsLandscape('monitor'));
    expect(result.current).toBe(true);
  });

  it('stays portrait on a monitor in portrait orientation', () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useIsLandscape('monitor'));
    expect(result.current).toBe(false);
  });

  it('ignores matchMedia on the fixed-orientation y70 surface', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useIsLandscape('y70'));
    expect(result.current).toBe(false);
  });

  it('ignores matchMedia on the fixed-orientation q60 surface', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useIsLandscape('q60'));
    expect(result.current).toBe(false);
  });

  it('ignores matchMedia on desktop', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useIsLandscape('desktop'));
    expect(result.current).toBe(false);
  });
});
