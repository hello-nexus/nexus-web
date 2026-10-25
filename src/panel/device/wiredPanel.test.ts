import { describe, it, expect, beforeEach } from 'vitest';
import { usesTouchPanelChrome, isWiredPanel, supportsDesktopWallpaper, wiredPanelClass, panelOfflineGrace } from './wiredPanel';
import { HOST_DISPLAY_OFFLINE_GRACE_MS, PHONE_OFFLINE_GRACE_MS } from '../../lib/serviceLiveness';

describe('isWiredPanel', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns true for y70', () => {
    expect(isWiredPanel('y70')).toBe(true);
  });

  it('returns true for monitor', () => {
    expect(isWiredPanel('monitor')).toBe(true);
  });

  it('returns true for q60', () => {
    expect(isWiredPanel('q60')).toBe(true);
  });

  it('returns false for phone without usb link', () => {
    expect(isWiredPanel('phone')).toBe(false);
  });

  it('returns true for phone with nexus_link=usb', () => {
    localStorage.setItem('nexus_link', 'usb');
    expect(isWiredPanel('phone')).toBe(true);
  });

  it('returns false for desktop', () => {
    expect(isWiredPanel('desktop')).toBe(false);
  });
});

describe('wiredPanelClass', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns host-display for y70', () => {
    expect(wiredPanelClass('y70')).toBe('host-display');
  });

  it('returns host-display for monitor', () => {
    expect(wiredPanelClass('monitor')).toBe('host-display');
  });

  it('returns cabled for q60', () => {
    expect(wiredPanelClass('q60')).toBe('cabled');
  });

  it('returns null for phone without usb link', () => {
    expect(wiredPanelClass('phone')).toBeNull();
  });

  it('returns cabled for phone with nexus_link=usb', () => {
    localStorage.setItem('nexus_link', 'usb');
    expect(wiredPanelClass('phone')).toBe('cabled');
  });

  it('returns null for desktop', () => {
    expect(wiredPanelClass('desktop')).toBeNull();
  });
});

describe('supportsDesktopWallpaper', () => {
  it('allows y70 regardless of display binding', () => {
    expect(supportsDesktopWallpaper('y70', false)).toBe(true);
    expect(supportsDesktopWallpaper('y70', true)).toBe(true);
  });

  it('allows monitor only when display-bound (excludes streamed monitor-surface panels)', () => {
    expect(supportsDesktopWallpaper('monitor', true)).toBe(true);
    expect(supportsDesktopWallpaper('monitor', false)).toBe(false);
  });

  it('never allows q60, phone, or desktop', () => {
    expect(supportsDesktopWallpaper('q60', true)).toBe(false);
    expect(supportsDesktopWallpaper('phone', true)).toBe(false);
    expect(supportsDesktopWallpaper('desktop', true)).toBe(false);
  });
});

describe('usesTouchPanelChrome', () => {
  it('allows y70 regardless of binding or touch', () => {
    expect(usesTouchPanelChrome('y70', false, undefined)).toBe(true);
  });

  it('allows a display-bound touch monitor (Xeneon Edge)', () => {
    expect(usesTouchPanelChrome('monitor', true, true)).toBe(true);
  });

  it('excludes a promoted desk monitor without touch', () => {
    expect(usesTouchPanelChrome('monitor', true, false)).toBe(false);
    expect(usesTouchPanelChrome('monitor', true, undefined)).toBe(false);
  });

  it('excludes streamed monitor-surface panels (not display-bound)', () => {
    expect(usesTouchPanelChrome('monitor', false, true)).toBe(false);
  });

  it('never matches q60, phone, or desktop', () => {
    expect(usesTouchPanelChrome('q60', true, true)).toBe(false);
    expect(usesTouchPanelChrome('phone', true, true)).toBe(false);
    expect(usesTouchPanelChrome('desktop', true, true)).toBe(false);
  });
});

describe('panelOfflineGrace', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('holds a WiFi phone on the plain LAN transport while the service shows signs of life', () => {
    expect(panelOfflineGrace('phone', 'lan')).toEqual({ graceMs: PHONE_OFFLINE_GRACE_MS, hold: 'while-live' });
  });

  it('gives a phone on a tunneled or closed transport no hold', () => {
    expect(panelOfflineGrace('phone', 'relay').hold).toBe('never');
    expect(panelOfflineGrace('phone', 'lan-sealed').hold).toBe('never');
    expect(panelOfflineGrace('phone', 'direct').hold).toBe('never');
    expect(panelOfflineGrace('phone', null).hold).toBe('never');
  });

  it('gives a USB phone no grace', () => {
    localStorage.setItem('nexus_link', 'usb');
    expect(panelOfflineGrace('phone', 'lan')).toEqual({ graceMs: 0, hold: 'never' });
  });

  it('holds host displays unconditionally, whatever the transport', () => {
    for (const transport of ['lan', 'relay', null] as const) {
      expect(panelOfflineGrace('y70', transport)).toEqual({ graceMs: HOST_DISPLAY_OFFLINE_GRACE_MS, hold: 'always' });
      expect(panelOfflineGrace('monitor', transport)).toEqual({ graceMs: HOST_DISPLAY_OFFLINE_GRACE_MS, hold: 'always' });
    }
  });

  it('gives the q60 and non-phone surfaces no grace', () => {
    expect(panelOfflineGrace('q60', 'lan').graceMs).toBe(0);
    expect(panelOfflineGrace('desktop', 'lan').graceMs).toBe(0);
    expect(panelOfflineGrace('lcd-round', 'lan').graceMs).toBe(0);
  });
});
