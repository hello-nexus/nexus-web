import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResolvedThemeSync } from './ResolvedThemeSync';
import { setHostThemeMode } from '../lib/settings';

const h = vi.hoisted(() => ({
  settings: { themeMode: 'system', hostThemeMode: 'light' } as { themeMode: string; hostThemeMode: string },
  savePreferences: vi.fn(),
  postResolvedTheme: vi.fn(),
}));

vi.mock('../hooks/useUiSettings', () => ({ useUiSettings: () => ({ settings: h.settings }) }));
vi.mock('../api/profiles', () => ({ savePreferences: h.savePreferences }));
vi.mock('./windowActions', () => ({ postResolvedTheme: h.postResolvedTheme }));

beforeEach(() => {
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  }));
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  setHostThemeMode('');
});

describe('ResolvedThemeSync', () => {
  it('never writes preferences, and posts the host theme to the native shell in system mode', () => {
    setHostThemeMode('light');
    h.settings = { themeMode: 'system', hostThemeMode: 'light' };
    render(<ResolvedThemeSync />);
    expect(h.savePreferences).not.toHaveBeenCalled();
    expect(h.postResolvedTheme).toHaveBeenCalledWith(false);
  });

  it('posts the manual theme as is', () => {
    setHostThemeMode('light');
    h.settings = { themeMode: 'dark', hostThemeMode: 'light' };
    render(<ResolvedThemeSync />);
    expect(h.postResolvedTheme).toHaveBeenCalledWith(true);
    expect(h.savePreferences).not.toHaveBeenCalled();
  });
});
