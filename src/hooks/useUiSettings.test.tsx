import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { UiSettingsProvider, useUiSettings, type UiSettingsContextValue } from './useUiSettings';
import { applyThemeMode } from '../lib/settings';

// Capture the 'prefs' topic callback and stub the network so the test can drive
// a server echo by hand. vi.hoisted keeps the holder reachable from the hoisted
// vi.mock factories.
const h = vi.hoisted(() => ({
  prefsCb: null as null | (() => void),
  fetchPreferences: vi.fn(),
  savePreferences: vi.fn(),
  // Stable identity: a fresh fn each render would change reload()'s deps and
  // spin the mount effect into an infinite re-render loop.
  setLanguage: vi.fn(),
}));

vi.mock('./useMultiplexSocket', () => ({
  useTopicCallback: (topic: string, enabled: boolean, cb: () => void) => {
    if (topic === 'prefs' && enabled) h.prefsCb = cb;
  },
}));
vi.mock('../api/profiles', async (orig) => ({
  ...(await orig<typeof import('../api/profiles')>()),
  fetchPreferences: h.fetchPreferences,
  savePreferences: h.savePreferences,
}));
vi.mock('../lib/settings', async (orig) => ({
  ...(await orig<typeof import('../lib/settings')>()),
  applyThemeMode: vi.fn(),
  applyAccentColor: vi.fn(),
  applyBackgroundMode: vi.fn(),
}));
vi.mock('../lib/i18n', () => ({
  useTranslation: () => ({ t: (k: string) => k, setLanguage: h.setLanguage }),
}));

const prefs = (themeMode: string) => ({
  theme: { themeMode, accentColor: '#7c5cff', language: 'en' },
});

const captured: { ctx: UiSettingsContextValue | null } = { ctx: null };
function Consumer() {
  captured.ctx = useUiSettings();
  return null;
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  h.prefsCb = null;
  captured.ctx = null;
  localStorage.clear();
});

describe('UiSettingsProvider - prefs-topic reload', () => {
  // Regression: toggling the theme in-app made two /preferences writes -
  // themeMode (debounced) and resolvedThemeMode (immediate, via
  // ResolvedThemeSync). The immediate write's 'prefs' echo re-hydrated before
  // the debounced themeMode write landed, re-applying the stale (pre-toggle)
  // theme: the visible flicker. reload() now skips the round-trip while a local
  // write is pending.
  // Real timers throughout: faking them deadlocks React's act() scheduler. The
  // debounce is short (250ms), so a real wait is cheap.
  const flush = () => act(async () => { await Promise.resolve(); });

  it('ignores a prefs echo while a local theme write is pending, resumes after it flushes', async () => {
    h.fetchPreferences.mockResolvedValue(prefs('dark'));
    h.savePreferences.mockResolvedValue(undefined);

    await act(async () => {
      render(
        <UiSettingsProvider serviceOnline manageDom>
          <Consumer />
        </UiSettingsProvider>,
      );
    });
    await flush();
    // Mount hydrate fetched once.
    expect(h.fetchPreferences).toHaveBeenCalledTimes(1);

    // User toggles to light: optimistic apply + a pending debounced server write.
    await act(async () => { captured.ctx!.update({ themeMode: 'light' }); });
    expect(vi.mocked(applyThemeMode)).toHaveBeenLastCalledWith('light');
    const fetchCalls = h.fetchPreferences.mock.calls.length;
    const applyCalls = vi.mocked(applyThemeMode).mock.calls.length;

    // A 'prefs' echo of our own write arrives while the server is still stale.
    h.fetchPreferences.mockResolvedValue(prefs('dark'));
    await act(async () => { h.prefsCb?.(); });
    await flush();

    // Guard held: no re-fetch and no theme re-apply (so no revert to dark).
    expect(h.fetchPreferences).toHaveBeenCalledTimes(fetchCalls);
    expect(vi.mocked(applyThemeMode)).toHaveBeenCalledTimes(applyCalls);

    // Debounce flushes → writeTimer clears → a later echo reloads normally.
    h.fetchPreferences.mockResolvedValue(prefs('light'));
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });
    await act(async () => { h.prefsCb?.(); });
    await flush();
    expect(h.fetchPreferences).toHaveBeenCalledTimes(fetchCalls + 1);
  });
});
