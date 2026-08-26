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

describe('UiSettingsProvider - pinnedSidebarApps', () => {
  const flush = () => act(async () => { await Promise.resolve(); });
  // nexus-service has no PinnedSidebarApps field on UiSettings/UiSettingsPatch
  // (ProfileRoutes.cs never reads or writes it), so every real GET /preferences
  // response omits ui.pinnedSidebarApps. Mirrored here rather than including
  // the field, so these tests fail the moment that assumption stops holding.
  const serverPrefs = () => ({
    theme: { themeMode: 'dark', accentColor: '#2563eb', language: 'en' },
    ui: {},
  });

  it('pins an app by appending it to the tail and posts the full array', async () => {
    h.fetchPreferences.mockResolvedValue(serverPrefs());
    h.savePreferences.mockResolvedValue(undefined);
    await act(async () => {
      render(
        <UiSettingsProvider serviceOnline manageDom>
          <Consumer />
        </UiSettingsProvider>,
      );
    });
    await flush();

    // 'clock' is Page-capable (isPinnableAppKey true) but left out of
    // DEFAULT_PINNED_TAIL, so it is a realistic target for a fresh pin.
    const tail = captured.ctx!.settings.pinnedSidebarApps;
    await act(async () => { captured.ctx!.update({ pinnedSidebarApps: [...tail, 'clock'] }); });

    expect(captured.ctx!.settings.pinnedSidebarApps).toEqual([...tail, 'clock']);
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });
    expect(h.savePreferences).toHaveBeenCalledWith({ ui: { pinnedSidebarApps: [...tail, 'clock'] } });
  });

  it('unpins an app by removing it from the tail', async () => {
    h.fetchPreferences.mockResolvedValue(serverPrefs());
    h.savePreferences.mockResolvedValue(undefined);
    await act(async () => {
      render(
        <UiSettingsProvider serviceOnline manageDom>
          <Consumer />
        </UiSettingsProvider>,
      );
    });
    await flush();

    const tail = captured.ctx!.settings.pinnedSidebarApps;
    const next = tail.filter(k => k !== 'lighting');
    await act(async () => { captured.ctx!.update({ pinnedSidebarApps: next }); });

    expect(captured.ctx!.settings.pinnedSidebarApps).toEqual(next);
    expect(captured.ctx!.settings.pinnedSidebarApps).not.toContain('lighting');
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });
    expect(h.savePreferences).toHaveBeenCalledWith({ ui: { pinnedSidebarApps: next } });
  });

  it('reorders the tail and persists the new order', async () => {
    h.fetchPreferences.mockResolvedValue(serverPrefs());
    h.savePreferences.mockResolvedValue(undefined);
    await act(async () => {
      render(
        <UiSettingsProvider serviceOnline manageDom>
          <Consumer />
        </UiSettingsProvider>,
      );
    });
    await flush();

    const reordered = ['cooling', 'monitoring', 'lighting'];
    await act(async () => { captured.ctx!.update({ pinnedSidebarApps: reordered }); });
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });

    expect(captured.ctx!.settings.pinnedSidebarApps).toEqual(reordered);
    expect(h.savePreferences).toHaveBeenCalledWith({ ui: { pinnedSidebarApps: reordered } });
  });

  it('falls back to DEFAULT_PINNED_TAIL for a fresh profile (no local cache, no server value)', async () => {
    h.fetchPreferences.mockResolvedValue(serverPrefs());
    h.savePreferences.mockResolvedValue(undefined);
    await act(async () => {
      render(
        <UiSettingsProvider serviceOnline manageDom>
          <Consumer />
        </UiSettingsProvider>,
      );
    });
    await flush();

    expect(captured.ctx!.settings.pinnedSidebarApps).toEqual(['monitoring', 'lighting', 'cooling', 'diagnostics']);
  });

  // Boot-order race: nothing in reload() may reset pinnedSidebarApps to
  // DEFAULT_PINNED_TAIL just because the server's ui block omits the field -
  // that fallback-to-base branch in applyServerToLocal is the only thing
  // standing between a user's customization and getting clobbered on every
  // hydrate (mount, profile switch, prefs-topic echo), since the service
  // never echoes this field back at all.
  it('does not clobber a locally held pin+reorder when the server prefs omit the field', async () => {
    h.fetchPreferences.mockResolvedValue(serverPrefs());
    h.savePreferences.mockResolvedValue(undefined);
    await act(async () => {
      render(
        <UiSettingsProvider serviceOnline manageDom>
          <Consumer />
        </UiSettingsProvider>,
      );
    });
    await flush();

    const customTail = ['cooling', 'devices', 'lighting'];
    await act(async () => { captured.ctx!.update({ pinnedSidebarApps: customTail }); });
    expect(captured.ctx!.settings.pinnedSidebarApps).toEqual(customTail);
    // Let the debounced write settle so no timer leaks into the next test.
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });

    // A later hydrate (profile switch, prefs-topic echo) re-fetches while the
    // server still has no opinion on pinnedSidebarApps.
    h.fetchPreferences.mockResolvedValue(serverPrefs());
    await act(async () => { captured.ctx!.reload(); });
    await flush();

    expect(captured.ctx!.settings.pinnedSidebarApps).toEqual(customTail);
  });

  // The debounced server write is the ONLY channel that could ever make this
  // durable once nexus-service adds the field - so it must not be silently
  // discarded around a shutdown. Guards the fix in scheduleServerWrite/the
  // unmount cleanup: cancelling the timer alone used to drop this write.
  it('flushes a pending pinnedSidebarApps write instead of dropping it on unmount', async () => {
    h.fetchPreferences.mockResolvedValue(serverPrefs());
    h.savePreferences.mockResolvedValue(undefined);
    const view = render(
      <UiSettingsProvider serviceOnline manageDom>
        <Consumer />
      </UiSettingsProvider>,
    );
    await flush();

    const customTail = ['lighting', 'cooling', 'monitoring'];
    await act(async () => { captured.ctx!.update({ pinnedSidebarApps: customTail }); });
    // Unmount immediately - well inside the 250ms debounce window - the way
    // an app-close tears the React tree down mid-debounce.
    expect(h.savePreferences).not.toHaveBeenCalled();
    view.unmount();

    expect(h.savePreferences).toHaveBeenCalledWith({ ui: { pinnedSidebarApps: customTail } });
  });
});

describe('UiSettingsProvider - debounced write merge', () => {
  const flush = () => act(async () => { await Promise.resolve(); });

  // Regression: switching accent back to 'system' flipped the button to
  // 'custom'. Selecting 'system' writes accentSource, then SystemAccentSync
  // re-asserts accentColor in the same debounce window. scheduleServerWrite
  // used to replace the pending patch, so only accentColor reached the server;
  // accentSource stayed 'custom' there and its 'prefs' echo reverted the UI.
  // Both fields must be merged into one POST.
  it('merges two update() calls in the debounce window into a single write', async () => {
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

    await act(async () => { captured.ctx!.update({ accentSource: 'system' }); });
    await act(async () => { captured.ctx!.update({ accentColor: '#0078d4' }); });
    // Let the debounce flush.
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });

    expect(h.savePreferences).toHaveBeenCalledTimes(1);
    expect(h.savePreferences).toHaveBeenCalledWith({
      theme: { accentSource: 'system', accentColor: '#0078d4' },
    });
  });

  // A nested diagnostics sub-block written across two calls must not lose the
  // first sub-object - the merge recurses one level past the domain block.
  it('deep-merges nested domain sub-blocks written across two calls', async () => {
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

    await act(async () => { captured.ctx!.update({ diagnosticsCpuTempC: 80 }); });
    await act(async () => { captured.ctx!.update({ diagnosticsGpuTempC: 75 }); });
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });

    expect(h.savePreferences).toHaveBeenCalledTimes(1);
    expect(h.savePreferences).toHaveBeenCalledWith({
      diagnostics: { thresholds: { cpuC: 80, gpuC: 75 } },
    });
  });
});

describe('UiSettingsProvider - per-page dashboard modes', () => {
  const flush = () => act(async () => { await Promise.resolve(); });
  const serverPrefs = (ui: Record<string, unknown> = {}) => ({
    theme: { themeMode: 'dark', accentColor: '#2563eb', language: 'en' },
    ui,
  });

  it('defaults both pages to simple and posts a flip for only the touched page', async () => {
    h.fetchPreferences.mockResolvedValue(serverPrefs());
    h.savePreferences.mockResolvedValue(undefined);
    await act(async () => {
      render(
        <UiSettingsProvider serviceOnline manageDom>
          <Consumer />
        </UiSettingsProvider>,
      );
    });
    await flush();

    expect(captured.ctx!.settings.lightingDashboardMode).toBe('simple');
    expect(captured.ctx!.settings.coolingDashboardMode).toBe('simple');

    await act(async () => { captured.ctx!.update({ lightingDashboardMode: 'advanced' }); });
    expect(captured.ctx!.settings.lightingDashboardMode).toBe('advanced');
    // The other page's mode is untouched by the flip.
    expect(captured.ctx!.settings.coolingDashboardMode).toBe('simple');
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });
    expect(h.savePreferences).toHaveBeenCalledWith({ ui: { lightingDashboardMode: 'advanced' } });
  });

  it('hydrates each page from the server and ignores an unknown value', async () => {
    h.fetchPreferences.mockResolvedValue(serverPrefs({ lightingDashboardMode: 'advanced', coolingDashboardMode: 'simple' }));
    await act(async () => {
      render(
        <UiSettingsProvider serviceOnline manageDom>
          <Consumer />
        </UiSettingsProvider>,
      );
    });
    await flush();
    expect(captured.ctx!.settings.lightingDashboardMode).toBe('advanced');
    expect(captured.ctx!.settings.coolingDashboardMode).toBe('simple');

    // An unknown wire value (future schema, corruption) keeps the local value.
    h.fetchPreferences.mockResolvedValue(serverPrefs({ lightingDashboardMode: 'bogus' }));
    await act(async () => { h.prefsCb?.(); });
    await flush();
    expect(captured.ctx!.settings.lightingDashboardMode).toBe('advanced');
  });
});
