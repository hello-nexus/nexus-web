import { beforeEach, describe, expect, it } from 'vitest';
import { consumeLightingRestart, markLightingRestart } from './postRestartRoute';

beforeEach(() => localStorage.clear());

describe('postRestartRoute', () => {
  it('consumes a fresh mark exactly once', () => {
    markLightingRestart(1000);
    expect(consumeLightingRestart(2000)).toBe(true);
    expect(consumeLightingRestart(2000)).toBe(false);
  });

  it('drops a stale mark', () => {
    markLightingRestart(1000);
    expect(consumeLightingRestart(1000 + 10 * 60_000)).toBe(false);
  });

  it('is false with no mark', () => {
    expect(consumeLightingRestart()).toBe(false);
  });
});
