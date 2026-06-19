// useUiSettings and useTempSensorPrefs are bound to the UiSettingsContext
// defined in this file.
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import {
  loadSettings, saveSettings, cachePreferencesLocally,
  applyThemeMode, applyAccentColor, applyBackgroundMode,
  type NexusSettings, type ThemeMode, type Language, type BackgroundMode, type AccentSource,
} from '../lib/settings';
import {
  fetchPreferences, savePreferences,
  type Preferences as ServerPreferences,
  type PreferencesPatch,
} from '../api/profiles';
import type { UpdateChannel } from '../api/update';
import { useTopicCallback } from './useMultiplexSocket';
import { useTranslation } from '../lib/i18n';
import { sanitizePinnedTail } from '../app/sidebarApps';

/**
 * Unified user-settings hook.
 *
 * Rules enforced here:
 *   - `clientScoped` fields (startOnLogin) live in localStorage only.
 *   - `profileScoped` fields (language, theme, accent, monitoring,
 *     fanChannelOrder, etc.) live on the server per-profile; localStorage is
 *     a boot-time cache so the first render is not blank, and every write
 *     path also pushes to the server.
 *   - Profile switch re-fetches server state and re-applies theme/accent;
 *     views re-render on `settings` change.
 *
 * One server fetch on mount and one per profile switch, no polling.
 * `update()` debounces server writes by 250ms but mirrors to local state +
 * localStorage synchronously.
 */

export interface UiSettingsValue {
  // Client-scoped (local only, never synced to server)
  startOnLogin: boolean;
  // Dashboard background style (glass / gradient / flat).
  backgroundMode: BackgroundMode;
  // Accent source: 'system' tracks the OS accent, 'custom' uses accentColor.
  accentSource: AccentSource;

  // Profile-scoped (server is source of truth; localStorage mirrors)
  language: Language;
  themeMode: ThemeMode;
  accentColor: string;
  disableConflictAlerts: boolean;
  monitoringShowAverage: boolean;
  monitoringDetailedCollapsed: string[];
  showMacStatusBarIcon: boolean;
  showWindowsTrayIcon: boolean;
  fanChannelOrder: string[];
  // Empty string === "auto" (each view falls back to its built-in default).
  // Kept on the server under cooling.preferredCpu/GpuTempSensorId so the
  // choice survives profile switches and is shared via the Dashboard category.
  preferredCpuTempSensorId: string;
  preferredGpuTempSensorId: string;
  // The "primary" GPU (by model name) shown across the Monitoring widget,
  // sensors view, and GPU temp display. Empty string === "auto" (the client
  // defaults to the first discrete GPU). Server-mirrored under
  // cooling.preferredGpuId, shared via the Dashboard category.
  preferredGpuId: string;
  // Order of pinnable sidebar apps after the locked Dashboard row. See
  // isPinnableAppKey in app/sidebarAppKeys.ts. Server-mirrored under
  // ui.pinnedSidebarApps.
  pinnedSidebarApps: string[];
  // When true, lighting + cooling widgets show the rich UI (chart, chips,
  // mode buttons); default false (compact center-icon+arrows layout).
  // Per-widget config.advancedMode overrides this per instance.
  widgetAdvancedMode: boolean;
  // Server-only update prefs (not saved to localStorage).
  autoUpdateDisabled: boolean;
  updateChannel: UpdateChannel;
  lastDismissedUpdateVersion: string;
}

type Patch = Partial<UiSettingsValue>;

interface UiSettingsContextValue {
  settings: UiSettingsValue;
  update: (patch: Patch) => void;
  /** Force a re-hydration from the server (e.g. after profile switch). */
  reload: () => void;
}

const UiSettingsContext = createContext<UiSettingsContextValue | null>(null);

function fromNexusSettings(src: NexusSettings): UiSettingsValue {
  return {
    startOnLogin: src.general.startOnLogin,
    backgroundMode: src.general.backgroundMode,
    accentSource: src.general.accentSource,
    language: src.general.language,
    themeMode: src.general.themeMode,
    accentColor: src.general.accentColor,
    disableConflictAlerts: src.general.disableConflictAlerts,
    monitoringShowAverage: src.general.monitoringShowAverage,
    monitoringDetailedCollapsed: src.general.monitoringDetailedCollapsed,
    showMacStatusBarIcon: src.general.showMacStatusBarIcon,
    showWindowsTrayIcon: src.general.showWindowsTrayIcon,
    fanChannelOrder: [],
    preferredCpuTempSensorId: '',
    preferredGpuTempSensorId: '',
    preferredGpuId: '',
    pinnedSidebarApps: sanitizePinnedTail(src.general.pinnedSidebarApps),
    widgetAdvancedMode: src.general.widgetAdvancedMode,
    autoUpdateDisabled: false,
    updateChannel: 'production' as UpdateChannel,
    lastDismissedUpdateVersion: '',
  };
}

function toNexusSettings(src: UiSettingsValue): NexusSettings {
  return {
    general: {
      language: src.language,
      themeMode: src.themeMode,
      accentColor: src.accentColor,
      backgroundMode: src.backgroundMode,
      accentSource: src.accentSource,
      startOnLogin: src.startOnLogin,
      disableConflictAlerts: src.disableConflictAlerts,
      monitoringShowAverage: src.monitoringShowAverage,
      monitoringDetailedCollapsed: src.monitoringDetailedCollapsed,
      showMacStatusBarIcon: src.showMacStatusBarIcon,
      showWindowsTrayIcon: src.showWindowsTrayIcon,
      pinnedSidebarApps: src.pinnedSidebarApps,
      widgetAdvancedMode: src.widgetAdvancedMode,
    },
  };
}

/** Translate the hook's flat field patch into the nested PreferencesPatch the server expects. */
function toServerPatch(patch: Patch): PreferencesPatch {
  const out: PreferencesPatch = {};
  // theme block
  const theme: Partial<{ language: Language; themeMode: ThemeMode; accentColor: string }> = {};
  if (patch.language !== undefined) theme.language = patch.language;
  if (patch.themeMode !== undefined) theme.themeMode = patch.themeMode;
  if (patch.accentColor !== undefined) theme.accentColor = patch.accentColor;
  if (Object.keys(theme).length > 0) out.theme = theme;
  // monitoring block
  const monitoring: Partial<{ showAverage: boolean; showMacStatusBarIcon: boolean; showWindowsTrayIcon: boolean; detailedCollapsed: string[] }> = {};
  if (patch.monitoringShowAverage !== undefined) monitoring.showAverage = patch.monitoringShowAverage;
  if (patch.monitoringDetailedCollapsed !== undefined) monitoring.detailedCollapsed = patch.monitoringDetailedCollapsed;
  if (patch.showMacStatusBarIcon !== undefined) monitoring.showMacStatusBarIcon = patch.showMacStatusBarIcon;
  if (patch.showWindowsTrayIcon !== undefined) monitoring.showWindowsTrayIcon = patch.showWindowsTrayIcon;
  if (Object.keys(monitoring).length > 0) out.monitoring = monitoring;
  // cooling block
  const cooling: Partial<{ fanChannelOrder: string[]; preferredCpuTempSensorId: string | null; preferredGpuTempSensorId: string | null; preferredGpuId: string | null }> = {};
  if (patch.fanChannelOrder !== undefined) cooling.fanChannelOrder = patch.fanChannelOrder;
  if (patch.preferredCpuTempSensorId !== undefined) cooling.preferredCpuTempSensorId = patch.preferredCpuTempSensorId;
  if (patch.preferredGpuTempSensorId !== undefined) cooling.preferredGpuTempSensorId = patch.preferredGpuTempSensorId;
  if (patch.preferredGpuId !== undefined) cooling.preferredGpuId = patch.preferredGpuId;
  if (Object.keys(cooling).length > 0) out.cooling = cooling;
  // ui block
  const ui: Partial<{ disableConflictAlerts: boolean; pinnedSidebarApps: string[] }> = {};
  if (patch.disableConflictAlerts !== undefined) ui.disableConflictAlerts = patch.disableConflictAlerts;
  if (patch.pinnedSidebarApps !== undefined) ui.pinnedSidebarApps = patch.pinnedSidebarApps;
  if (Object.keys(ui).length > 0) out.ui = ui;
  // update block
  const update: Partial<{ autoUpdateDisabled: boolean; updateChannel: UpdateChannel; lastDismissedUpdateVersion: string }> = {};
  if (patch.autoUpdateDisabled !== undefined) update.autoUpdateDisabled = patch.autoUpdateDisabled;
  if (patch.updateChannel !== undefined) update.updateChannel = patch.updateChannel;
  if (patch.lastDismissedUpdateVersion !== undefined) update.lastDismissedUpdateVersion = patch.lastDismissedUpdateVersion;
  if (Object.keys(update).length > 0) out.update = update;
  return out;
}

function applyServerToLocal(server: ServerPreferences, base: UiSettingsValue): UiSettingsValue {
  return {
    ...base,
    language: (server.theme?.language as Language) ?? base.language,
    themeMode: (server.theme?.themeMode as ThemeMode) ?? base.themeMode,
    accentColor: server.theme?.accentColor ?? base.accentColor,
    disableConflictAlerts: server.ui?.disableConflictAlerts ?? base.disableConflictAlerts,
    monitoringShowAverage: server.monitoring?.showAverage ?? base.monitoringShowAverage,
    monitoringDetailedCollapsed: server.monitoring?.detailedCollapsed ?? base.monitoringDetailedCollapsed,
    showMacStatusBarIcon: server.monitoring?.showMacStatusBarIcon ?? base.showMacStatusBarIcon,
    showWindowsTrayIcon: server.monitoring?.showWindowsTrayIcon ?? base.showWindowsTrayIcon,
    fanChannelOrder: server.cooling?.fanChannelOrder ?? base.fanChannelOrder,
    preferredCpuTempSensorId: server.cooling?.preferredCpuTempSensorId ?? '',
    preferredGpuTempSensorId: server.cooling?.preferredGpuTempSensorId ?? '',
    preferredGpuId: server.cooling?.preferredGpuId ?? '',
    pinnedSidebarApps: server.ui?.pinnedSidebarApps !== undefined
      ? sanitizePinnedTail(server.ui.pinnedSidebarApps)
      : base.pinnedSidebarApps,
    autoUpdateDisabled: server.update?.autoUpdateDisabled ?? base.autoUpdateDisabled,
    updateChannel: (server.update?.updateChannel as UpdateChannel) ?? base.updateChannel,
    lastDismissedUpdateVersion: server.update?.lastDismissedUpdateVersion ?? base.lastDismissedUpdateVersion,
  };
}

interface UiSettingsProviderProps {
  children: ReactNode;
  /** Whether the backend service is reachable (controls fetch/save behaviour). */
  serviceOnline: boolean;
  /** Active profile id (for re-fetching on profile switch). */
  activeProfileId?: string;
  /**
   * Whether server-driven theme / accent / language changes apply to
   * `document.documentElement` and global i18n state. `true` (default) for
   * the desktop dashboard. `false` for the kiosk panel, overlay process,
   * and simulator iframe: those own their own theme/language pipelines
   * (usePanelTheme, the overlay's theme manager, the parent modal's
   * postMessage feed) and would fight a second writer.
   */
  manageDom?: boolean;
}

export function UiSettingsProvider({
  children, serviceOnline, activeProfileId, manageDom = true,
}: UiSettingsProviderProps) {
  // Language lives in I18nProvider (lib/i18n.tsx); calling setLanguage keeps
  // the provider in sync whenever settings.general.language changes via any
  // path (SettingsView pick, profile reload, etc.).
  const { setLanguage } = useTranslation();
  // Synchronous seed from localStorage keeps the first render flash-free.
  const [settings, setSettings] = useState<UiSettingsValue>(() =>
    fromNexusSettings(loadSettings()),
  );

  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistLocal = useCallback((next: UiSettingsValue) => {
    saveSettings(toNexusSettings(next));
  }, []);

  const scheduleServerWrite = useCallback((patch: Patch) => {
    if (!serviceOnline) return;
    const serverPatch = toServerPatch(patch);
    // toServerPatch produces an empty object when the patch only touches
    // client-scoped fields — short-circuit to skip a pointless POST.
    const anyBlock = serverPatch.theme || serverPatch.panel || serverPatch.overlay
      || serverPatch.monitoring || serverPatch.cooling || serverPatch.ui || serverPatch.update;
    if (!anyBlock) return;
    if (writeTimer.current) clearTimeout(writeTimer.current);
    // 250ms debounce collapses rapid slider-style updates into one POST.
    writeTimer.current = setTimeout(() => {
      writeTimer.current = null;
      savePreferences(serverPatch).catch(() => { /* best-effort */ });
    }, 250);
  }, [serviceOnline]);

  const update = useCallback((patch: Patch) => {
    setSettings(prev => {
      const next = { ...prev, ...patch };
      persistLocal(next);

      // Apply DOM/i18n side effects for whole-UI fields here so every caller
      // gets them. Guarded by `manageDom` so non-desktop surfaces don't
      // trample their own theme/language managers.
      if (manageDom) {
        if (patch.themeMode !== undefined) applyThemeMode(patch.themeMode);
        if (patch.accentColor !== undefined) applyAccentColor(patch.accentColor);
        if (patch.backgroundMode !== undefined) applyBackgroundMode(patch.backgroundMode);
        if (patch.language !== undefined) setLanguage(patch.language);
      }

      return next;
    });
    scheduleServerWrite(patch);
  }, [persistLocal, scheduleServerWrite, setLanguage, manageDom]);

  const reload = useCallback((coalesceWithPendingWrite = false) => {
    if (!serviceOnline) return;
    // The 'prefs' topic echoes our OWN writes back. A theme toggle makes two
    // /preferences writes: themeMode (debounced 250ms via scheduleServerWrite)
    // and, through ResolvedThemeSync, resolvedThemeMode (immediate). The
    // immediate write's echo arrives before the debounced themeMode write
    // lands, so re-hydrating now reads the pre-toggle themeMode and re-applies
    // it — the visible flicker: new theme → snaps back to old → tweens to new
    // once the real write settles. Skip the round-trip while our own write is
    // still pending; that write's echo reloads once it flushes, when the
    // server is consistent. (Mount / profile-switch reloads pass false.)
    if (coalesceWithPendingWrite && writeTimer.current) return;
    fetchPreferences().then(prefs => {
      if (!prefs) return;
      setSettings(prev => {
        const next = applyServerToLocal(prefs, prev);
        persistLocal(next);
        // Re-apply theme/accent when server state differs (profile-switch
        // path). Same `manageDom` guard as update().
        if (manageDom) {
          if (next.themeMode !== prev.themeMode) applyThemeMode(next.themeMode);
          if (next.accentColor !== prev.accentColor) applyAccentColor(next.accentColor);
          if (next.language !== prev.language) setLanguage(next.language);
        }
        return next;
      });
      // Mirror to the legacy cache so code paths still reading via
      // loadSettings() see refreshed values. Removable once every view
      // goes through this hook.
      cachePreferencesLocally({
        language: prefs.theme?.language,
        themeMode: prefs.theme?.themeMode,
        accentColor: prefs.theme?.accentColor,
        disableConflictAlerts: prefs.ui?.disableConflictAlerts,
        monitoringShowAverage: prefs.monitoring?.showAverage,
        monitoringDetailedCollapsed: prefs.monitoring?.detailedCollapsed,
        showMacStatusBarIcon: prefs.monitoring?.showMacStatusBarIcon,
        showWindowsTrayIcon: prefs.monitoring?.showWindowsTrayIcon,
        pinnedSidebarApps: prefs.ui?.pinnedSidebarApps,
      });
    }).catch(() => { /* best-effort */ });
  }, [serviceOnline, persistLocal, setLanguage, manageDom]);

  // Hydrate from server when online or when the profile changes.
  useEffect(() => {
    reload();
  }, [reload, activeProfileId]);

  // The 'prefs' topic publishes after every /preferences mutation AND after a
  // sharing toggle that changes Theme or Dashboard. Without this subscription
  // the desktop UI would not pick up the new theme until the user manually
  // switched profiles to force a reload. Pass coalesceWithPendingWrite so an
  // echo of our own in-flight write doesn't re-apply stale theme (see reload).
  const reloadFromPrefsTopic = useCallback(() => reload(true), [reload]);
  useTopicCallback('prefs', !!serviceOnline, reloadFromPrefsTopic);

  // Flush any pending write if the app is unmounting.
  useEffect(() => () => {
    if (writeTimer.current) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
    }
  }, []);

  const value = useMemo<UiSettingsContextValue>(() => ({
    settings, update, reload,
  }), [settings, update, reload]);

  return (
    <UiSettingsContext.Provider value={value}>
      {children}
    </UiSettingsContext.Provider>
  );
}

/** Read + write the user's unified settings. Throws if called outside provider. */
export function useUiSettings(): UiSettingsContextValue {
  const ctx = useContext(UiSettingsContext);
  if (!ctx) {
    throw new Error('useUiSettings must be used inside <UiSettingsProvider>');
  }
  return ctx;
}

/**
 * Read-only accessor for the preferred CPU/GPU temperature sensor ids.
 * Returns empty strings (auto-mode) when called outside a UiSettingsProvider,
 * so the resolver falls back to the per-domain default sensor.
 */
export function useTempSensorPrefs(): { cpuId: string; gpuId: string } {
  const ctx = useContext(UiSettingsContext);
  if (!ctx) return { cpuId: '', gpuId: '' };
  return {
    cpuId: ctx.settings.preferredCpuTempSensorId,
    gpuId: ctx.settings.preferredGpuTempSensorId,
  };
}

/**
 * Read-only accessor for the preferred primary-GPU model name ("" = auto).
 * Returns "" outside a UiSettingsProvider so callers fall back to the
 * discrete-first default in {@link resolvePrimaryGpu}.
 */
export function usePreferredGpuId(): string {
  const ctx = useContext(UiSettingsContext);
  return ctx ? ctx.settings.preferredGpuId : '';
}
