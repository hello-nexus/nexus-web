import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PANEL_BACKGROUND_FROST,
  normalizePanelBackgroundFrost,
  panelBackgroundFrostScale,
  resolvePanelBackgroundEnabled,
} from './panelBackground';

describe('resolvePanelBackgroundEnabled', () => {
  it('defaults wallpaper-capable panels to see-through (background off)', () => {
    expect(resolvePanelBackgroundEnabled(undefined, true)).toBe(false);
    expect(resolvePanelBackgroundEnabled(null, true)).toBe(false);
  });

  it('defaults non-wallpaper panels to the theme backdrop (background on)', () => {
    expect(resolvePanelBackgroundEnabled(undefined, false)).toBe(true);
    expect(resolvePanelBackgroundEnabled(null, false)).toBe(true);
  });

  it('passes explicit values through regardless of capability', () => {
    expect(resolvePanelBackgroundEnabled(true, true)).toBe(true);
    expect(resolvePanelBackgroundEnabled(false, true)).toBe(false);
    expect(resolvePanelBackgroundEnabled(true, false)).toBe(true);
    expect(resolvePanelBackgroundEnabled(false, false)).toBe(false);
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
