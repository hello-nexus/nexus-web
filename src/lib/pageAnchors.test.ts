import { describe, it, expect } from 'vitest';
import {
  lianLiCoolingAnchors,
  lianLiLightingAnchors,
  lianLiWirelessCoolingAnchors,
  lianLiWirelessLightingAnchors,
} from './pageAnchors';

describe('pageAnchors', () => {
  it('wired lighting with sync off targets the hub group, whatever source is stored', () => {
    expect(lianLiLightingAnchors()).toEqual(['lighting-group:mb:lianli']);
    expect(lianLiLightingAnchors({ argbSync: false, argbSyncSource: 'openrgb-s-9876543210-1' })).toEqual(['lighting-group:mb:lianli']);
  });

  it('sync on targets the source group, its card, the board group, then the hub', () => {
    expect(lianLiLightingAnchors({ argbSync: true, argbSyncSource: 'openrgb-s-9876543210-1' })).toEqual([
      'lighting-group:mb:openrgb-s-9876543210-1',
      'lighting-device:openrgb-s-9876543210-1:z0',
      'lighting-device:openrgb-s-9876543210-1',
      'lighting-group:mb:openrgb-s-9876543210',
      'lighting-group:mb:lianli',
    ]);
  });

  it('sync on with a source that is not an OpenRGB port skips the board entry', () => {
    expect(lianLiLightingAnchors({ argbSync: true, argbSyncSource: 'smarthub:1:port4' })).toEqual([
      'lighting-group:mb:smarthub:1:port4',
      'lighting-device:smarthub:1:port4:z0',
      'lighting-device:smarthub:1:port4',
      'lighting-group:mb:lianli',
    ]);
  });

  it('sync on with no source saved falls back to the hub', () => {
    expect(lianLiLightingAnchors({ argbSync: true })).toEqual(['lighting-group:mb:lianli']);
    expect(lianLiLightingAnchors({ argbSync: true, argbSyncSource: null })).toEqual(['lighting-group:mb:lianli']);
  });

  it('wired cooling targets the hub group', () => {
    expect(lianLiCoolingAnchors()).toEqual(['cooling-group:lianli']);
  });

  it('a second wired hub targets its own groups', () => {
    expect(lianLiCoolingAnchors('lianli2')).toEqual(['cooling-group:lianli2']);
    expect(lianLiLightingAnchors(undefined, 'lianli2')).toEqual(['lighting-group:mb:lianli2']);
    expect(lianLiLightingAnchors({ argbSync: true, argbSyncSource: 'smarthub:1:port4' }, 'lianli2').at(-1)).toBe('lighting-group:mb:lianli2');
  });

  it('wireless targets the hub group on lighting and each bound chain on cooling', () => {
    expect(lianLiWirelessLightingAnchors()).toEqual(['lighting-group:mb:lianli-wireless']);
    expect(lianLiWirelessCoolingAnchors(['998D1DE566E1', 'AABBCCDDEEFF'])).toEqual([
      'cooling-group:lianli-wireless:998D1DE566E1',
      'cooling-group:lianli-wireless:AABBCCDDEEFF',
    ]);
  });
});
