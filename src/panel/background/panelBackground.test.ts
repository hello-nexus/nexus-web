import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PANEL_BACKGROUND_FROST,
  normalizePanelBackdrop,
  normalizePanelBackgroundFrost,
  panelBackgroundFrostScale,
  resolvePanelBackdrop,
} from './panelBackground';

describe('resolvePanelBackdrop', () => {
  it('defaults wallpaper-capable panels to the redrawn wallpaper', () => {
    expect(resolvePanelBackdrop(undefined, true)).toBe('wallpaper');
    expect(resolvePanelBackdrop(null, true)).toBe('wallpaper');
  });

  it('defaults non-wallpaper panels to the theme backdrop', () => {
    expect(resolvePanelBackdrop(undefined, false)).toBe('theme');
    expect(resolvePanelBackdrop(null, false)).toBe('theme');
  });

  it('passes a stored mode through for a wallpaper-capable panel', () => {
    expect(resolvePanelBackdrop('theme', true)).toBe('theme');
    expect(resolvePanelBackdrop('wallpaper', true)).toBe('wallpaper');
    expect(resolvePanelBackdrop('desktop', true)).toBe('desktop');
  });

  // A surface with no desktop behind it cannot honour wallpaper or
  // see-through: a stored value from another surface must not blank it.
  it('clamps a stored desktop mode on a surface that cannot render it', () => {
    expect(resolvePanelBackdrop('desktop', false)).toBe('theme');
    expect(resolvePanelBackdrop('wallpaper', false)).toBe('theme');
  });

  it('falls back to the default for an unknown stored value', () => {
    expect(resolvePanelBackdrop('nonsense', true)).toBe('wallpaper');
    expect(normalizePanelBackdrop('nonsense')).toBeNull();
    expect(normalizePanelBackdrop('desktop')).toBe('desktop');
  });
});

describe('normalizePanelBackgroundFrost', () => {
  it('defaults an unset value to the mid-strength default', () => {
    expect(normalizePanelBackgroundFrost(undefined)).toBe(DEFAULT_PANEL_BACKGROUND_FROST);
    expect(normalizePanelBackgroundFrost(null)).toBe(DEFAULT_PANEL_BACKGROUND_FROST);
    expect(normalizePanelBackgroundFrost(Number.NaN)).toBe(DEFAULT_PANEL_BACKGROUND_FROST);
  });

  it('keeps an explicit zero (frost off) distinct from unset', () => {
    expect(normalizePanelBackgroundFrost(0)).toBe(0);
  });

  it('clamps to 0-100 and snaps to the slider step', () => {
    expect(normalizePanelBackgroundFrost(-20)).toBe(0);
    expect(normalizePanelBackgroundFrost(140)).toBe(100);
    expect(normalizePanelBackgroundFrost(37.4)).toBe(40);
    // A record written on a finer step still reads as a value the slider can show.
    expect(normalizePanelBackgroundFrost(45)).toBe(50);
  });
});

describe('panelBackgroundFrostScale', () => {
  it('maps the unit percent to one blur token and 100% to twice it', () => {
    expect(panelBackgroundFrostScale(50)).toBe(1);
    expect(panelBackgroundFrostScale(100)).toBe(2);
    expect(panelBackgroundFrostScale(0)).toBe(0);
  });
});
