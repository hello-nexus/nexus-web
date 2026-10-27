import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveTheme, setHostThemeMode, syncedAppThemeMode, applyThemeMode } from './settings';

function mockPrefersLight(light: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: light }));
}

afterEach(() => {
  setHostThemeMode('');
  vi.unstubAllGlobals();
});

describe('resolveTheme with a host OS theme', () => {
  it('system follows an explicit host theme over the local media query', () => {
    mockPrefersLight(false);
    expect(resolveTheme('system', 'light')).toBe('light');
  });

  it('an unsynced panel (no explicit host) ignores the page-global host theme', () => {
    mockPrefersLight(false);
    setHostThemeMode('light');
    expect(resolveTheme('system')).toBe('dark');
  });

  it('applyThemeMode (dashboard) follows the recorded host theme', () => {
    mockPrefersLight(false);
    setHostThemeMode('light');
    applyThemeMode('system');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('system falls back to the media query when the host theme is absent', () => {
    mockPrefersLight(true);
    expect(resolveTheme('system')).toBe('light');
    expect(resolveTheme('system', '')).toBe('light');
  });

  it('manual Light/Dark ignore the host theme', () => {
    mockPrefersLight(true);
    expect(resolveTheme('dark', 'light')).toBe('dark');
  });

  it('reports whether the host theme changed', () => {
    expect(setHostThemeMode('dark')).toBe(true);
    expect(setHostThemeMode('dark')).toBe(false);
    expect(setHostThemeMode('bogus')).toBe(true);
  });
});

describe('syncedAppThemeMode', () => {
  it('keeps a manual desktop Light/Dark and ignores the host resolved theme', () => {
    expect(syncedAppThemeMode('light', 'dark')).toBe('light');
    expect(syncedAppThemeMode('dark', 'light')).toBe('dark');
  });

  it('follows the host resolved theme when the desktop is on system', () => {
    expect(syncedAppThemeMode('system', 'light')).toBe('light');
    expect(syncedAppThemeMode('system', 'dark')).toBe('dark');
  });

  it('stays system when the host theme is unpublished', () => {
    expect(syncedAppThemeMode('system', '')).toBe('system');
  });
});
