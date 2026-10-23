import { describe, expect, it } from 'vitest';
import { PANEL_SURFACES, type PanelSurface } from '../types';
import { isLoopbackHost, panelAudioReactiveAllowed } from './panelAudio';

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
