import { describe, it, expect } from 'vitest';
import { normalizePanelBackgroundFrost, resolvePanelBackgroundEnabled } from './panelBackground';

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
  it('defaults an untouched record to light', () => {
    expect(normalizePanelBackgroundFrost(undefined)).toBe('light');
    expect(normalizePanelBackgroundFrost(null)).toBe('light');
  });

  it('keeps an explicit none distinct from an untouched record', () => {
    expect(normalizePanelBackgroundFrost('none')).toBe('none');
  });

  it('passes explicit light/heavy through unchanged', () => {
    expect(normalizePanelBackgroundFrost('light')).toBe('light');
    expect(normalizePanelBackgroundFrost('heavy')).toBe('heavy');
  });

  it('falls back to the default for an unrecognised value', () => {
    expect(normalizePanelBackgroundFrost('bogus')).toBe('light');
  });
});
