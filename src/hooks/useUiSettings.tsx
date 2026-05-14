import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import {
  loadSettings, saveSettings, cachePreferencesLocally,
  applyThemeMode, applyAccentColor,
  type QosSettings, type ThemeMode, type Language,
} from '../lib/settings';
import { fetchPreferences, savePreferences, type UiSettings as ServerUiSettings } from '../api/profiles';
import { useTopicCallback } from './useMultiplexSocket';
import { useTranslation } from '../lib/i18n';

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
    },
  };
}

/** Extract the fields that should round-trip to the server. */
function toServerPatch(patch: Patch): Partial<ServerUiSettings> {
  const server: Partial<ServerUiSettings> = {};
  if (patch.language !== undefined) server.language = patch.language;
  if (patch.themeMode !== undefined) server.themeMode = patch.themeMode;
  if (patch.accentColor !== undefined) server.accentColor = patch.accentColor;
  if (patch.disableConflictAlerts !== undefined) server.disableConflictAlerts = patch.disableConflictAlerts;
  if (patch.monitoringShowAverage !== undefined) server.monitoringShowAverage = patch.monitoringShowAverage;
  if (patch.monitoringDetailedCollapsed !== undefined) server.monitoringDetailedCollapsed = patch.monitoringDetailedCollapsed;
  if (patch.showMacStatusBarIcon !== undefined) server.showMacStatusBarIcon = patch.showMacStatusBarIcon;
  if (patch.showWindowsTrayIcon !== undefined) server.showWindowsTrayIcon = patch.showWindowsTrayIcon;
  if (patch.fanChannelOrder !== undefined) server.fanChannelOrder = patch.fanChannelOrder;
  return server;
}

function applyServerToLocal(server: ServerUiSettings, base: UiSettingsValue): UiSettingsValue {
  return {
    ...base,
    language: (server.language as Language) ?? base.language,
    themeMode: (server.themeMode as ThemeMode) ?? base.themeMode,
    accentColor: server.accentColor ?? base.accentColor,
    disableConflictAlerts: server.disableConflictAlerts ?? base.disableConflictAlerts,
    monitoringShowAverage: server.monitoringShowAverage ?? base.monitoringShowAverage,
    monitoringDetailedCollapsed: server.monitoringDetailedCollapsed ?? base.monitoringDetailedCollapsed,
    showMacStatusBarIcon: server.showMacStatusBarIcon ?? base.showMacStatusBarIcon,
    showWindowsTrayIcon: server.showWindowsTrayIcon ?? base.showWindowsTrayIcon,
    fanChannelOrder: server.fanChannelOrder ?? base.fanChannelOrder,
  };
}

interface UiSettingsProviderProps {
  children: ReactNode;
  /** Whether the backend service is reachable (controls fetch/save behaviour). */
  serviceOnline: boolean;
  /** Active profile id (for re-fetching on profile switch). */
  activeProfileId?: string;
}

export function UiSettingsProvider({
  children, serviceOnline, activeProfileId,
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
    if (Object.keys(serverPatch).length === 0) return;
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
      // calling applyThemeMode / applyAccentColor inconsistently).
      if (patch.themeMode !== undefined) applyThemeMode(patch.themeMode);
      if (patch.accentColor !== undefined) applyAccentColor(patch.accentColor);
      if (patch.language !== undefined) setLanguage(patch.language);

      return next;
    });
    scheduleServerWrite(patch);
  }, [persistLocal, scheduleServerWrite, setLanguage]);

  const reload = useCallback(() => {
    if (!serviceOnline) return;
    fetchPreferences().then(prefs => {
      if (!prefs) return;
      setSettings(prev => {
        const next = applyServerToLocal(prefs, prev);
        persistLocal(next);
        // Re-apply theme/accent when server state differs -- this is the
        // profile-switch path (settings really changed) so hydration should
        // also touch the DOM.
        if (next.themeMode !== prev.themeMode) applyThemeMode(next.themeMode);
        if (next.accentColor !== prev.accentColor) applyAccentColor(next.accentColor);
        if (next.language !== prev.language) setLanguage(next.language);
        return next;
      });
      // Also call the legacy cache helper so any non-migrated code paths that
      // still read via loadSettings() see the refreshed values until their
      // migration lands. Safe to remove once every view goes through the hook.
      cachePreferencesLocally(prefs);
    }).catch(() => { /* best-effort */ });
  }, [serviceOnline, persistLocal, setLanguage]);

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
