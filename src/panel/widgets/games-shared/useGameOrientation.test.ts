import { describe, it, expect, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useGameOrientation } from './useGameOrientation';

describe('useGameOrientation', () => {
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

  it('reads portrait from a tall immersive grid', () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useGameOrientation({ columns: 4, rows: 12 }));
    expect(result.current).toBe('portrait');
  });

  it('reads landscape from a wide immersive grid even when matchMedia disagrees', () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useGameOrientation({ columns: 8, rows: 4 }));
    expect(result.current).toBe('landscape');
  });

  it('reads landscape from matchMedia even when the grid is tall', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useGameOrientation({ columns: 4, rows: 12 }));
    expect(result.current).toBe('landscape');
  });

  it('defaults to portrait with no grid and a portrait viewport', () => {
    stubMatchMedia(false);
    const { result } = renderHook(() => useGameOrientation(undefined));
    expect(result.current).toBe('portrait');
  });

  it('updates when a matchMedia change event fires', () => {
    let changeHandler: (() => void) | undefined;
    let matches = false;
    window.matchMedia = ((query: string) => ({
      get matches() { return query.includes('landscape') ? matches : false; },
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: (_: string, handler: () => void) => { changeHandler = handler; },
      removeEventListener: () => {},
      dispatchEvent: () => false,
    })) as typeof window.matchMedia;

    const { result } = renderHook(() => useGameOrientation({ columns: 4, rows: 12 }));
    expect(result.current).toBe('portrait');

    matches = true;
    act(() => { changeHandler?.(); });
    expect(result.current).toBe('landscape');
  });
});
