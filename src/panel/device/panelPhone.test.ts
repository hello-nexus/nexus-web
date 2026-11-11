import { describe, it, expect, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { isWideAspect, useIsLandscape, useIsWideLcd } from './panelPhone';

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

  it('honours matchMedia for the rotatable y70 surface', () => {
    stubMatchMedia(true);
    const { result } = renderHook(() => useIsLandscape('y70'));
    expect(result.current).toBe(true);
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

describe('useIsWideLcd', () => {
  const realWidth = window.innerWidth;
  const realHeight = window.innerHeight;

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: realWidth });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: realHeight });
  });

  function stubViewport(width: number, height: number) {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
  }

  it('is wide on the first render for a wide lcd display', () => {
    stubViewport(1280, 440);
    expect(renderHook(() => useIsWideLcd('lcd-wide')).result.current).toBe(true);
    stubViewport(1120, 540);
    expect(renderHook(() => useIsWideLcd('lcd-wide')).result.current).toBe(true);
  });

  it('keeps square, round and portrait lcd display stacked', () => {
    stubViewport(480, 480);
    expect(renderHook(() => useIsWideLcd('lcd-square')).result.current).toBe(false);
    expect(renderHook(() => useIsWideLcd('lcd-round')).result.current).toBe(false);
    stubViewport(440, 1280);
    expect(renderHook(() => useIsWideLcd('lcd-wide')).result.current).toBe(false);
  });

  it('never applies to non-lcd surfaces', () => {
    stubViewport(1920, 1080);
    expect(renderHook(() => useIsWideLcd('monitor')).result.current).toBe(false);
    expect(renderHook(() => useIsWideLcd('q60')).result.current).toBe(false);
  });

  it('isWideAspect needs a clearly wider-than-tall display', () => {
    expect(isWideAspect(1280, 440)).toBe(true);
    expect(isWideAspect(1500, 1000)).toBe(true);
    expect(isWideAspect(1200, 1000)).toBe(false);
    expect(isWideAspect(100, 0)).toBe(false);
  });
});
