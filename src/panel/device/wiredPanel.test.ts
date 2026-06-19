import { describe, it, expect, beforeEach } from 'vitest';
import { isWiredPanel, wiredPanelClass } from './wiredPanel';

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
