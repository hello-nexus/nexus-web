import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PANEL_SURFACES, type PanelSurface } from '../types';
import { isQSeriesViewport } from '../device/inferSurface';
import { isLoopbackHost, panelAudioReactiveAllowed, usePanelAudioReactive } from './panelAudio';

const ALLOWED: PanelSurface[] = ['kraken', 'lcd-round', 'lcd-square', 'lcd-wide', 'monitor', 'y70'];

describe('panelAudioReactiveAllowed', () => {
  it.each(ALLOWED)('allows %s on a local client', surface => {
    expect(panelAudioReactiveAllowed(surface, true)).toBe(true);
  });

  it.each(['q60', 'phone', 'desktop'] as PanelSurface[])('denies %s even on a local client', surface => {
    expect(panelAudioReactiveAllowed(surface, true)).toBe(false);
  });

  it.each(PANEL_SURFACES)('denies %s when the client is not on this PC', surface => {
    expect(panelAudioReactiveAllowed(surface, false)).toBe(false);
  });

  it('denies an unknown or missing surface', () => {
    expect(panelAudioReactiveAllowed(undefined, true)).toBe(false);
    expect(panelAudioReactiveAllowed(null, true)).toBe(false);
    expect(panelAudioReactiveAllowed('tablet' as PanelSurface, true)).toBe(false);
  });
});

describe('isLoopbackHost', () => {
  it('accepts loopback names only', () => {
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('192.168.1.20')).toBe(false);
    expect(isLoopbackHost('hellonexus.com')).toBe(false);
    expect(isLoopbackHost('')).toBe(false);
  });
});

describe('isQSeriesViewport', () => {
  it('matches the Q-series native portrait size only', () => {
    expect(isQSeriesViewport(720, 1280)).toBe(true);
    expect(isQSeriesViewport(682, 2560)).toBe(false);
    expect(isQSeriesViewport(1280, 720)).toBe(false);
  });
});

describe('usePanelAudioReactive', () => {
  const size = { w: window.innerWidth, h: window.innerHeight };
  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: size.w });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: size.h });
  });

  it('allows a local y70 and denies a q60 even over loopback', () => {
    expect(renderHook(() => usePanelAudioReactive('y70')).result.current).toBe(true);
    expect(renderHook(() => usePanelAudioReactive('q60')).result.current).toBe(false);
  });

  it('denies a page sized like the Q-series glass whatever surface it claims', () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 720 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 1280 });
    expect(renderHook(() => usePanelAudioReactive('y70')).result.current).toBe(false);
  });
});
