import { describe, it, expect } from 'vitest';
import { resolvePanelBackgroundEnabled } from './panelBackground';

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
