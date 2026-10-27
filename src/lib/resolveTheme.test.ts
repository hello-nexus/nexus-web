import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveTheme, setHostThemeMode } from './settings';

function mockPrefersLight(light: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: light }));
}

afterEach(() => {
  setHostThemeMode('');
  vi.unstubAllGlobals();
});

describe('resolveTheme with a host OS theme', () => {
  it('system follows the host theme over the local media query', () => {
    mockPrefersLight(false);
    setHostThemeMode('light');
    expect(resolveTheme('system')).toBe('light');
  });

  it('system falls back to the media query when the host theme is absent', () => {
    mockPrefersLight(true);
    expect(resolveTheme('system')).toBe('light');
    setHostThemeMode('dark');
    setHostThemeMode(undefined);
    expect(resolveTheme('system')).toBe('light');
  });

  it('manual Light/Dark ignore the host theme', () => {
    mockPrefersLight(true);
    setHostThemeMode('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('reports whether the host theme changed', () => {
    expect(setHostThemeMode('dark')).toBe(true);
    expect(setHostThemeMode('dark')).toBe(false);
    expect(setHostThemeMode('bogus')).toBe(true);
  });
});
