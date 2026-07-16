import { describe, it, expect } from 'vitest';
import { normalizePanelBackgroundEnabled } from './panelBackground';

describe('normalizePanelBackgroundEnabled', () => {
  it('defaults absent record values to enabled', () => {
    expect(normalizePanelBackgroundEnabled(undefined)).toBe(true);
    expect(normalizePanelBackgroundEnabled(null)).toBe(true);
  });

  it('passes explicit values through', () => {
    expect(normalizePanelBackgroundEnabled(true)).toBe(true);
    expect(normalizePanelBackgroundEnabled(false)).toBe(false);
  });
});
