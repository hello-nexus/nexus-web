import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import {
  loadSettings, saveSettings, cachePreferencesLocally,
  applyThemeMode, applyAccentColor,
  type QosSettings, type ThemeMode, type Language,
} from '../lib/settings';
import {
  fetchPreferences, savePreferences,
  type Preferences as ServerPreferences,
  type PreferencesPatch,
} from '../api/profiles';
import { useTopicCallback } from './useMultiplexSocket';
import { useTranslation } from '../lib/i18n';
import { sanitizePinnedTail } from '../app/sidebarApps';

/**
 * Unified user-settings hook. Replaces the previous pattern where views called
 * `loadSettings()` / `saveSettings()` (localStorage) AND
 * `fetchPreferences()` / `savePreferences()` (server per-profile) independently,
 * which let them drift out of sync across profile switches.
 *
 * Rules enforced here:
 *   - `clientScoped` fields (startOnLogin) live in localStorage only.
 *   - `profileScoped` fields (language, theme, accent, monitoring,
 *     fanChannelOrder, etc.) live on the server per-profile. localStorage is
 *     strictly a boot-time cache so the first render is not blank; every
 *     write path pushes to the server too.
 *   - Profile switch re-fetches server state and re-applies the theme/accent
 *     immediately; views only need to re-render on `settings` change.
 *
 * No extra polling or WebSocket subscriptions: one server fetch on mount and
 * one on each profile switch. `update()` debounces server writes by 250ms to
 * avoid thrashing when a slider drags, but mirrors to local state + localStorage
 * synchronously so the UI feels instant.
 */

export interface UiSettingsValue {
  // Client-scoped (local only, never synced to server)
  startOnLogin: boolean;

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
  // Order of pinnable sidebar apps after the locked Dashboard row. See
  // PINNABLE_APP_KEYS in app/sidebarApps.tsx. Server-mirrored under
  // ui.pinnedSidebarApps.
  pinnedSidebarApps: string[];
}

type Patch = Partial<UiSettingsValue>;

interface UiSettingsContextValue {
  settings: UiSettingsValue;
  update: (patch: Patch) => void;
  /** Force a re-hydration from the server (e.g. after profile switch). */
  reload: () => void;
}

const UiSettingsContext = createContext<UiSettingsContextValue | null>(null);

function fromQosSettings(src: QosSettings): UiSettingsValue {
  return {
    startOnLogin: src.general.startOnLogin,
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
    pinnedSidebarApps: sanitizePinnedTail(src.general.pinnedSidebarApps),
  };
}

function toQosSettings(src: UiSettingsValue): QosSettings {
  return {
    general: {
      language: src.language,
      themeMode: src.themeMode,
      accentColor: src.accentColor,
      startOnLogin: src.startOnLogin,
      disableConflictAlerts: src.disableConflictAlerts,
      monitoringShowAverage: src.monitoringShowAverage,
      monitoringDetailedCollapsed: src.monitoringDetailedCollapsed,
      showMacStatusBarIcon: src.showMacStatusBarIcon,
      showWindowsTrayIcon: src.showWindowsTrayIcon,
      pinnedSidebarApps: src.pinnedSidebarApps,
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
  const cooling: Partial<{ fanChannelOrder: string[]; preferredCpuTempSensorId: string | null; preferredGpuTempSensorId: string | null }> = {};
  if (patch.fanChannelOrder !== undefined) cooling.fanChannelOrder = patch.fanChannelOrder;
  if (patch.preferredCpuTempSensorId !== undefined) cooling.preferredCpuTempSensorId = patch.preferredCpuTempSensorId;
  if (patch.preferredGpuTempSensorId !== undefined) cooling.preferredGpuTempSensorId = patch.preferredGpuTempSensorId;
  if (Object.keys(cooling).length > 0) out.cooling = cooling;
  // ui block
  const ui: Partial<{ disableConflictAlerts: boolean; pinnedSidebarApps: string[] }> = {};
  if (patch.disableConflictAlerts !== undefined) ui.disableConflictAlerts = patch.disableConflictAlerts;
  if (patch.pinnedSidebarApps !== undefined) ui.pinnedSidebarApps = patch.pinnedSidebarApps;
  if (Object.keys(ui).length > 0) out.ui = ui;
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
    pinnedSidebarApps: server.ui?.pinnedSidebarApps !== undefined
      ? sanitizePinnedTail(server.ui.pinnedSidebarApps)
      : base.pinnedSidebarApps,
  };
}

interface UiSettingsProviderProps {
  children: ReactNode;
  /** Whether the backend service is reachable (controls fetch/save behaviour). */
  serviceOnline: boolean;
  /** Active profile id (for re-fetching on profile switch). */
  activeProfileId?: string;
  /**
   * Whether server-driven theme / accent / language changes should be
   * applied to `document.documentElement` and the global i18n state.
   * `true` (default) is what the desktop dashboard wants. `false` for
   * the kiosk panel, the overlay process, and the simulator iframe —
   * those surfaces own their own theme/language pipelines (usePanelTheme,
   * the overlay's standalone theme manager, the parent modal's postMessage
   * theme feed) and would fight a second writer.
   */
  manageDom?: boolean;
}

export function UiSettingsProvider({
  children, serviceOnline, activeProfileId, manageDom = true,
}: UiSettingsProviderProps) {
  // Language now lives in I18nProvider (see lib/i18n.tsx). Calling setLanguage
  // from this hook keeps the provider in sync whenever settings.general.language
  // changes via any path (manual pick in SettingsView, profile reload, etc.).
  const { setLanguage } = useTranslation();
  // Synchronous seed from localStorage keeps the first render flash-free.
  const [settings, setSettings] = useState<UiSettingsValue>(() =>
    fromQosSettings(loadSettings()),
  );

  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persistLocal = useCallback((next: UiSettingsValue) => {
    saveSettings(toQosSettings(next));
  }, []);

  const scheduleServerWrite = useCallback((patch: Patch) => {
    if (!serviceOnline) return;
    const serverPatch = toServerPatch(patch);
    // toServerPatch produces an empty object when the patch only touches
    // client-scoped fields — short-circuit to skip a pointless POST.
    const anyBlock = serverPatch.theme || serverPatch.panel || serverPatch.overlay
      || serverPatch.monitoring || serverPatch.cooling || serverPatch.ui;
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

      // Apply side effects for fields the whole UI cares about. Done here so
      // the caller never forgets (the old pattern had view-level handlers
      // calling applyThemeMode / applyAccentColor inconsistently). Guarded
      // by `manageDom` so non-desktop surfaces don't trample their own
      // theme/language managers.
      if (manageDom) {
        if (patch.themeMode !== undefined) applyThemeMode(patch.themeMode);
        if (patch.accentColor !== undefined) applyAccentColor(patch.accentColor);
        if (patch.language !== undefined) setLanguage(patch.language);
      }

      return next;
    });
    scheduleServerWrite(patch);
  }, [persistLocal, scheduleServerWrite, setLanguage, manageDom]);

  const reload = useCallback(() => {
    if (!serviceOnline) return;
    fetchPreferences().then(prefs => {
      if (!prefs) return;
      setSettings(prev => {
        const next = applyServerToLocal(prefs, prev);
        persistLocal(next);
        // Re-apply theme/accent when server state differs -- this is the
        // profile-switch path (settings really changed) so hydration should
        // also touch the DOM. Same `manageDom` guard as in update() so
        // non-desktop surfaces aren't surprised by a server-driven repaint.
        if (manageDom) {
          if (next.themeMode !== prev.themeMode) applyThemeMode(next.themeMode);
          if (next.accentColor !== prev.accentColor) applyAccentColor(next.accentColor);
          if (next.language !== prev.language) setLanguage(next.language);
        }
        return next;
      });
      // Also call the legacy cache helper so any non-migrated code paths that
      // still read via loadSettings() see the refreshed values until their
      // migration lands. Safe to remove once every view goes through the hook.
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
  // switched profiles to force a reload.
  useTopicCallback('prefs', !!serviceOnline, reload);

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
 * Safe read-only accessor for the preferred CPU/GPU temperature sensor ids.
 * Returns empty strings (auto-mode) when called outside a UiSettingsProvider —
 * the resolver then naturally falls back to the per-domain default sensor.
 * Acts as a fail-safe for any future surface that mounts a temp-aware widget
 * without first wrapping with the provider; in normal use today the desktop
 * dashboard, panel, simulator, and overlay all provide one.
 */
export function useTempSensorPrefs(): { cpuId: string; gpuId: string } {
  const ctx = useContext(UiSettingsContext);
  if (!ctx) return { cpuId: '', gpuId: '' };
  return {
    cpuId: ctx.settings.preferredCpuTempSensorId,
    gpuId: ctx.settings.preferredGpuTempSensorId,
  };
}
