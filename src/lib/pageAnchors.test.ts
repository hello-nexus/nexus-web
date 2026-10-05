import { describe, it, expect } from 'vitest';
import {
  lianLiCoolingAnchors,
  lianLiLightingAnchors,
  lianLiWirelessCoolingAnchors,
  lianLiWirelessLightingAnchors,
} from './pageAnchors';

describe('pageAnchors', () => {
  it('wired lighting targets the hub group, then its first card', () => {
    expect(lianLiLightingAnchors()).toEqual(['lighting-group:mb:lianli', 'lighting-device:lianli:port0']);
    expect(lianLiLightingAnchors({ argbSync: false, argbSyncSource: 'openrgb-1' })[0]).toBe('lighting-group:mb:lianli');
  });

  it('wired lighting with sync on targets the source header, not the hub', () => {
    expect(lianLiLightingAnchors({ argbSync: true, argbSyncSource: 'openrgb-1' })).toEqual([
      'lighting-group:mb:openrgb-1',
      'lighting-device:openrgb-1:z0',
    ]);
  });

  it('sync on with no source saved falls back to the hub', () => {
    expect(lianLiLightingAnchors({ argbSync: true })[0]).toBe('lighting-group:mb:lianli');
  });

  it('wired cooling targets the hub group, then its channels', () => {
    const anchors = lianLiCoolingAnchors();
    expect(anchors[0]).toBe('cooling-group:lianli');
    expect(anchors).toContain('cooling-fan:lianli:port3');
  });

  it('wireless targets the hub group on lighting and each bound chain on cooling', () => {
    expect(lianLiWirelessLightingAnchors(['aa'])).toEqual(['lighting-group:mb:lianli-wireless', 'lighting-device:lianli-wireless:aa']);
    expect(lianLiWirelessCoolingAnchors(['aa', 'bb'])).toEqual(['cooling-group:lianli-wireless:aa', 'cooling-group:lianli-wireless:bb']);
  });
});
