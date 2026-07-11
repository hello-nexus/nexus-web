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
  type DiagnosticsThresholds,
  type DiagnosticsNotificationPrefs,
  type DiagnosticsComponentPrefs,
} from '../api/profiles';
import type { UpdateChannel, UpdateMode } from '../api/update';
import {
  DEFAULT_TEMP_UNIT, DEFAULT_TIME_FORMAT, DEFAULT_NUMBER_FORMAT,
  type TempUnit, type TimeFormat, type NumberFormat,
} from '../lib/units';
import { useTopicCallback } from './useMultiplexSocket';
import { useTranslation } from '../lib/i18n';
import { sanitizePinnedTail, sanitizeRecents } from '../app/sidebarApps';

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

  // Profile-scoped (server is source of truth; localStorage mirrors)
  // Dashboard background style (glass / gradient / flat).
  backgroundMode: BackgroundMode;
  // Accent source: 'system' tracks the OS accent, 'custom' uses accentColor.
  accentSource: AccentSource;
  language: Language;
  themeMode: ThemeMode;
  accentColor: string;
  showConflictAlerts: boolean;
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
  // isPinnableAppKey in app/sidebarAppKeys.ts. Posted under ui.pinnedSidebarApps,
  // but nexus-service has no matching field yet - see UiPrefs.pinnedSidebarApps
  // in api/profiles.ts for the durability gap this leaves.
  pinnedSidebarApps: string[];
  // Recently opened unpinned apps, oldest first - the sidebar's below-separator
  // "recently opened" rows (macOS dock semantics). Posted under
  // ui.recentSidebarApps; same durability gap as pinnedSidebarApps above (see
  // UiPrefs.recentSidebarApps in api/profiles.ts).
  recentSidebarApps: string[];
  // One-time marker: the OEM bake-in app's dashboard widget + sidebar pin
  // have been reconciled onto this profile (see useOemAppSeed). Server-only,
  // like the update block below - not mirrored to localStorage.
  oemAppSeeded: boolean;
  // When true, lighting + cooling widgets show the rich UI (chart, chips,
  // mode buttons); default false (compact center-icon+arrows layout).
  // Per-widget config.advancedMode overrides this per instance.
  widgetAdvancedMode: boolean;
  // Display-unit choices, server-mirrored under the preferences `units` block.
  // monitoringTempUnit governs in-app hardware temps only (default 'c');
  // outdoor weather keeps its own per-widget unit. See lib/units.ts.
  monitoringTempUnit: TempUnit;
  timeFormat: TimeFormat;
  numberFormat: NumberFormat;
  // Server-only update prefs (not saved to localStorage).
  updateMode: UpdateMode;
  updateChannel: UpdateChannel;
  lastDismissedUpdateVersion: string;
  // Diagnostics Settings tab preferences (preferences.diagnostics), server-only
  // like the update block above. Flattened leaves of the wire contract in
  // plans/diagnostics-monitoring-search-improvements.md "#2 wire contract" -
  // see DIAGNOSTICS_SETTINGS_DEFAULTS below for the contract defaults.
  diagnosticsCpuTempC: number;
  diagnosticsGpuTempC: number;
  diagnosticsStorageTempC: number;
  diagnosticsRamTempC: number;
  diagnosticsWarningLingerMinutes: number;
  diagnosticsNotificationsEnabled: boolean;
  diagnosticsNotifyHighTemp: boolean;
  diagnosticsNotifyStorageHealth: boolean;
  diagnosticsNotifyCooling: boolean;
  diagnosticsNotifyMemoryTest: boolean;
  diagnosticsNotifySystemDevices: boolean;
  diagnosticsNotifyGpuThrottle: boolean;
  diagnosticsNotificationCooldownMinutes: number;
  diagnosticsComponentCpu: boolean;
  diagnosticsComponentGpu: boolean;
  diagnosticsComponentStorage: boolean;
  diagnosticsComponentRam: boolean;
  diagnosticsComponentCooling: boolean;
  diagnosticsComponentSystem: boolean;
}

/** preferences.diagnostics contract defaults - kept in sync with the service's
 *  DiagnosticsSettings defaults (TemperatureInsights.cs). Used for the
 *  pre-hydrate seed below and by the Settings tab's Reset action. */
export const DIAGNOSTICS_SETTINGS_DEFAULTS = {
  cpuTempC: 90,
  gpuTempC: 85,
  storageTempC: 70,
  ramTempC: 60,
  warningLingerMinutes: 0,
  // Master switch off by default; every category on, so turning notifications
  // on alerts for all of them without extra setup. Mirrors the service
  // DiagnosticsNotifications defaults.
  notificationsEnabled: false,
  notifyHighTemp: true,
  notifyStorageHealth: true,
  notifyCooling: true,
  notifyMemoryTest: true,
  notifySystemDevices: true,
  notifyGpuThrottle: true,
  notificationCooldownMinutes: 60,
  componentCpu: true,
  componentGpu: true,
  componentStorage: true,
  componentRam: true,
  componentCooling: true,
  componentSystem: true,
} as const;

type Patch = Partial<UiSettingsValue>;

interface UiSettingsContextValue {
  settings: UiSettingsValue;
  update: (patch: Patch) => void;
  /** Force a re-hydration from the server (e.g. after profile switch). */
  reload: () => void;
  /**
   * False until the first server hydrate lands. Consumers that would write a
   * device-derived value back to the shared server state (SystemAccentSync's
   * OS accent) must wait for this, or a fresh window's pre-hydrate default
   * (accentSource='system') makes them clobber the real accent.
   */
  hydrated: boolean;
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
    showConflictAlerts: src.general.showConflictAlerts,
    monitoringShowAverage: src.general.monitoringShowAverage,
    monitoringDetailedCollapsed: src.general.monitoringDetailedCollapsed,
    showMacStatusBarIcon: src.general.showMacStatusBarIcon,
    showWindowsTrayIcon: src.general.showWindowsTrayIcon,
    fanChannelOrder: [],
    preferredCpuTempSensorId: '',
    preferredGpuTempSensorId: '',
    preferredGpuId: '',
    pinnedSidebarApps: sanitizePinnedTail(src.general.pinnedSidebarApps),
    recentSidebarApps: sanitizeRecents(src.general.recentSidebarApps),
    oemAppSeeded: false,
    widgetAdvancedMode: src.general.widgetAdvancedMode,
    monitoringTempUnit: src.general.monitoringTempUnit,
    timeFormat: src.general.timeFormat,
    numberFormat: src.general.numberFormat,
    updateMode: 'always' as UpdateMode,
    updateChannel: 'production' as UpdateChannel,
    lastDismissedUpdateVersion: '',
    diagnosticsCpuTempC: DIAGNOSTICS_SETTINGS_DEFAULTS.cpuTempC,
    diagnosticsGpuTempC: DIAGNOSTICS_SETTINGS_DEFAULTS.gpuTempC,
    diagnosticsStorageTempC: DIAGNOSTICS_SETTINGS_DEFAULTS.storageTempC,
    diagnosticsRamTempC: DIAGNOSTICS_SETTINGS_DEFAULTS.ramTempC,
    diagnosticsWarningLingerMinutes: DIAGNOSTICS_SETTINGS_DEFAULTS.warningLingerMinutes,
    diagnosticsNotificationsEnabled: DIAGNOSTICS_SETTINGS_DEFAULTS.notificationsEnabled,
    diagnosticsNotifyHighTemp: DIAGNOSTICS_SETTINGS_DEFAULTS.notifyHighTemp,
    diagnosticsNotifyStorageHealth: DIAGNOSTICS_SETTINGS_DEFAULTS.notifyStorageHealth,
    diagnosticsNotifyCooling: DIAGNOSTICS_SETTINGS_DEFAULTS.notifyCooling,
    diagnosticsNotifyMemoryTest: DIAGNOSTICS_SETTINGS_DEFAULTS.notifyMemoryTest,
    diagnosticsNotifySystemDevices: DIAGNOSTICS_SETTINGS_DEFAULTS.notifySystemDevices,
    diagnosticsNotifyGpuThrottle: DIAGNOSTICS_SETTINGS_DEFAULTS.notifyGpuThrottle,
    diagnosticsNotificationCooldownMinutes: DIAGNOSTICS_SETTINGS_DEFAULTS.notificationCooldownMinutes,
    diagnosticsComponentCpu: DIAGNOSTICS_SETTINGS_DEFAULTS.componentCpu,
    diagnosticsComponentGpu: DIAGNOSTICS_SETTINGS_DEFAULTS.componentGpu,
    diagnosticsComponentStorage: DIAGNOSTICS_SETTINGS_DEFAULTS.componentStorage,
    diagnosticsComponentRam: DIAGNOSTICS_SETTINGS_DEFAULTS.componentRam,
    diagnosticsComponentCooling: DIAGNOSTICS_SETTINGS_DEFAULTS.componentCooling,
    diagnosticsComponentSystem: DIAGNOSTICS_SETTINGS_DEFAULTS.componentSystem,
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
      showConflictAlerts: src.showConflictAlerts,
      monitoringShowAverage: src.monitoringShowAverage,
      monitoringDetailedCollapsed: src.monitoringDetailedCollapsed,
      showMacStatusBarIcon: src.showMacStatusBarIcon,
      showWindowsTrayIcon: src.showWindowsTrayIcon,
      pinnedSidebarApps: src.pinnedSidebarApps,
      recentSidebarApps: src.recentSidebarApps,
      widgetAdvancedMode: src.widgetAdvancedMode,
      monitoringTempUnit: src.monitoringTempUnit,
      timeFormat: src.timeFormat,
      numberFormat: src.numberFormat,
    },
  };
}

/** Translate the hook's flat field patch into the nested PreferencesPatch the server expects. */
function toServerPatch(patch: Patch): PreferencesPatch {
  const out: PreferencesPatch = {};
  // theme block
  const theme: Partial<{ language: Language; themeMode: ThemeMode; accentColor: string; backgroundMode: BackgroundMode; accentSource: AccentSource }> = {};
  if (patch.language !== undefined) theme.language = patch.language;
  if (patch.themeMode !== undefined) theme.themeMode = patch.themeMode;
  if (patch.accentColor !== undefined) theme.accentColor = patch.accentColor;
  if (patch.backgroundMode !== undefined) theme.backgroundMode = patch.backgroundMode;
  if (patch.accentSource !== undefined) theme.accentSource = patch.accentSource;
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
  const ui: Partial<{ showConflictAlerts: boolean; pinnedSidebarApps: string[]; recentSidebarApps: string[]; oemAppSeeded: boolean }> = {};
  if (patch.showConflictAlerts !== undefined) ui.showConflictAlerts = patch.showConflictAlerts;
  if (patch.pinnedSidebarApps !== undefined) ui.pinnedSidebarApps = patch.pinnedSidebarApps;
  if (patch.recentSidebarApps !== undefined) ui.recentSidebarApps = patch.recentSidebarApps;
  if (patch.oemAppSeeded !== undefined) ui.oemAppSeeded = patch.oemAppSeeded;
  if (Object.keys(ui).length > 0) out.ui = ui;
  // update block
  const update: Partial<{ updateMode: UpdateMode; updateChannel: UpdateChannel; lastDismissedUpdateVersion: string }> = {};
  if (patch.updateMode !== undefined) update.updateMode = patch.updateMode;
  if (patch.updateChannel !== undefined) update.updateChannel = patch.updateChannel;
  if (patch.lastDismissedUpdateVersion !== undefined) update.lastDismissedUpdateVersion = patch.lastDismissedUpdateVersion;
  if (Object.keys(update).length > 0) out.update = update;
  // units block
  const units: Partial<{ monitoringTempUnit: TempUnit; timeFormat: TimeFormat; numberFormat: NumberFormat }> = {};
  if (patch.monitoringTempUnit !== undefined) units.monitoringTempUnit = patch.monitoringTempUnit;
  if (patch.timeFormat !== undefined) units.timeFormat = patch.timeFormat;
  if (patch.numberFormat !== undefined) units.numberFormat = patch.numberFormat;
  if (Object.keys(units).length > 0) out.units = units;
  // diagnostics block
  const thresholds: Partial<DiagnosticsThresholds> = {};
  if (patch.diagnosticsCpuTempC !== undefined) thresholds.cpuC = patch.diagnosticsCpuTempC;
  if (patch.diagnosticsGpuTempC !== undefined) thresholds.gpuC = patch.diagnosticsGpuTempC;
  if (patch.diagnosticsStorageTempC !== undefined) thresholds.storageC = patch.diagnosticsStorageTempC;
  if (patch.diagnosticsRamTempC !== undefined) thresholds.ramC = patch.diagnosticsRamTempC;
  const notifications: Partial<DiagnosticsNotificationPrefs> = {};
  if (patch.diagnosticsNotificationsEnabled !== undefined) notifications.enabled = patch.diagnosticsNotificationsEnabled;
  if (patch.diagnosticsNotifyHighTemp !== undefined) notifications.highTemp = patch.diagnosticsNotifyHighTemp;
  if (patch.diagnosticsNotifyStorageHealth !== undefined) notifications.storageHealth = patch.diagnosticsNotifyStorageHealth;
  if (patch.diagnosticsNotifyCooling !== undefined) notifications.cooling = patch.diagnosticsNotifyCooling;
  if (patch.diagnosticsNotifyMemoryTest !== undefined) notifications.memoryTest = patch.diagnosticsNotifyMemoryTest;
  if (patch.diagnosticsNotifySystemDevices !== undefined) notifications.systemDevices = patch.diagnosticsNotifySystemDevices;
  if (patch.diagnosticsNotifyGpuThrottle !== undefined) notifications.gpuThrottle = patch.diagnosticsNotifyGpuThrottle;
  if (patch.diagnosticsNotificationCooldownMinutes !== undefined) notifications.cooldownMinutes = patch.diagnosticsNotificationCooldownMinutes;
  const components: Partial<DiagnosticsComponentPrefs> = {};
  if (patch.diagnosticsComponentCpu !== undefined) components.cpu = patch.diagnosticsComponentCpu;
  if (patch.diagnosticsComponentGpu !== undefined) components.gpu = patch.diagnosticsComponentGpu;
  if (patch.diagnosticsComponentStorage !== undefined) components.storage = patch.diagnosticsComponentStorage;
  if (patch.diagnosticsComponentRam !== undefined) components.ram = patch.diagnosticsComponentRam;
  if (patch.diagnosticsComponentCooling !== undefined) components.cooling = patch.diagnosticsComponentCooling;
  if (patch.diagnosticsComponentSystem !== undefined) components.system = patch.diagnosticsComponentSystem;
  const diagnostics: PreferencesPatch['diagnostics'] = {};
  if (Object.keys(thresholds).length > 0) diagnostics.thresholds = thresholds;
  if (patch.diagnosticsWarningLingerMinutes !== undefined) diagnostics.warningLingerMinutes = patch.diagnosticsWarningLingerMinutes;
  if (Object.keys(notifications).length > 0) diagnostics.notifications = notifications;
  if (Object.keys(components).length > 0) diagnostics.components = components;
  if (Object.keys(diagnostics).length > 0) out.diagnostics = diagnostics;
  return out;
}

function applyServerToLocal(server: ServerPreferences, base: UiSettingsValue): UiSettingsValue {
  return {
    ...base,
    language: (server.theme?.language as Language) ?? base.language,
    themeMode: (server.theme?.themeMode as ThemeMode) ?? base.themeMode,
    accentColor: server.theme?.accentColor ?? base.accentColor,
    // Empty (never written) falls back to the local value, so an upgraded
    // client keeps its choice until it seeds the server (see reload migration).
    backgroundMode: (server.theme?.backgroundMode as BackgroundMode) || base.backgroundMode,
    accentSource: (server.theme?.accentSource as AccentSource) || base.accentSource,
    showConflictAlerts: server.ui?.showConflictAlerts ?? base.showConflictAlerts,
    monitoringShowAverage: server.monitoring?.showAverage ?? base.monitoringShowAverage,
    monitoringDetailedCollapsed: server.monitoring?.detailedCollapsed ?? base.monitoringDetailedCollapsed,
    showMacStatusBarIcon: server.monitoring?.showMacStatusBarIcon ?? base.showMacStatusBarIcon,
    showWindowsTrayIcon: server.monitoring?.showWindowsTrayIcon ?? base.showWindowsTrayIcon,
    fanChannelOrder: server.cooling?.fanChannelOrder ?? base.fanChannelOrder,
    preferredCpuTempSensorId: server.cooling?.preferredCpuTempSensorId ?? '',
    preferredGpuTempSensorId: server.cooling?.preferredGpuTempSensorId ?? '',
    preferredGpuId: server.cooling?.preferredGpuId ?? '',
    // server.ui.pinnedSidebarApps is always undefined today (no service
    // support - see the field comment above), so this always keeps `base`.
    // That fallback is load-bearing: it is the only reason a reload doesn't
    // reset the tail to DEFAULT_PINNED_TAIL on every hydrate.
    pinnedSidebarApps: server.ui?.pinnedSidebarApps !== undefined
      ? sanitizePinnedTail(server.ui.pinnedSidebarApps)
      : base.pinnedSidebarApps,
    // server.ui.recentSidebarApps is always undefined today (no service
    // support - see the field comment above), so this always keeps `base`,
    // same load-bearing fallback as pinnedSidebarApps.
    recentSidebarApps: server.ui?.recentSidebarApps !== undefined
      ? sanitizeRecents(server.ui.recentSidebarApps)
      : base.recentSidebarApps,
    oemAppSeeded: server.ui?.oemAppSeeded ?? base.oemAppSeeded,
    updateMode: (server.update?.updateMode as UpdateMode) ?? base.updateMode,
    updateChannel: (server.update?.updateChannel as UpdateChannel) ?? base.updateChannel,
    lastDismissedUpdateVersion: server.update?.lastDismissedUpdateVersion ?? base.lastDismissedUpdateVersion,
    monitoringTempUnit: (server.units?.monitoringTempUnit as TempUnit) ?? base.monitoringTempUnit,
    timeFormat: (server.units?.timeFormat as TimeFormat) ?? base.timeFormat,
    numberFormat: (server.units?.numberFormat as NumberFormat) ?? base.numberFormat,
    diagnosticsCpuTempC: server.diagnostics?.thresholds?.cpuC ?? base.diagnosticsCpuTempC,
    diagnosticsGpuTempC: server.diagnostics?.thresholds?.gpuC ?? base.diagnosticsGpuTempC,
    diagnosticsStorageTempC: server.diagnostics?.thresholds?.storageC ?? base.diagnosticsStorageTempC,
    diagnosticsRamTempC: server.diagnostics?.thresholds?.ramC ?? base.diagnosticsRamTempC,
    diagnosticsWarningLingerMinutes: server.diagnostics?.warningLingerMinutes ?? base.diagnosticsWarningLingerMinutes,
    diagnosticsNotificationsEnabled: server.diagnostics?.notifications?.enabled ?? base.diagnosticsNotificationsEnabled,
    diagnosticsNotifyHighTemp: server.diagnostics?.notifications?.highTemp ?? base.diagnosticsNotifyHighTemp,
    diagnosticsNotifyStorageHealth: server.diagnostics?.notifications?.storageHealth ?? base.diagnosticsNotifyStorageHealth,
    diagnosticsNotifyCooling: server.diagnostics?.notifications?.cooling ?? base.diagnosticsNotifyCooling,
    diagnosticsNotifyMemoryTest: server.diagnostics?.notifications?.memoryTest ?? base.diagnosticsNotifyMemoryTest,
    diagnosticsNotifySystemDevices: server.diagnostics?.notifications?.systemDevices ?? base.diagnosticsNotifySystemDevices,
    diagnosticsNotifyGpuThrottle: server.diagnostics?.notifications?.gpuThrottle ?? base.diagnosticsNotifyGpuThrottle,
    diagnosticsNotificationCooldownMinutes: server.diagnostics?.notifications?.cooldownMinutes ?? base.diagnosticsNotificationCooldownMinutes,
    diagnosticsComponentCpu: server.diagnostics?.components?.cpu ?? base.diagnosticsComponentCpu,
    diagnosticsComponentGpu: server.diagnostics?.components?.gpu ?? base.diagnosticsComponentGpu,
    diagnosticsComponentStorage: server.diagnostics?.components?.storage ?? base.diagnosticsComponentStorage,
    diagnosticsComponentRam: server.diagnostics?.components?.ram ?? base.diagnosticsComponentRam,
    diagnosticsComponentCooling: server.diagnostics?.components?.cooling ?? base.diagnosticsComponentCooling,
    diagnosticsComponentSystem: server.diagnostics?.components?.system ?? base.diagnosticsComponentSystem,
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
  const [hydrated, setHydrated] = useState(false);

  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWriteRef = useRef<PreferencesPatch | null>(null);
  // backgroundMode/accentSource moved from localStorage-only to the server
  // Theme block. A window that already had saved settings before this change
  // seeds the server once so an upgrade keeps the user's choice; a fresh window
  // (no stored settings, e.g. a --app temp profile) has only defaults and must
  // NOT seed, or it would overwrite the real window's values with defaults.
  const hadStoredSettings = useRef(
    typeof localStorage !== 'undefined' && localStorage.getItem('nexus_settings') !== null,
  );
  const migratedThemeScope = useRef(false);

  const persistLocal = useCallback((next: UiSettingsValue) => {
    saveSettings(toNexusSettings(next));
  }, []);

  const scheduleServerWrite = useCallback((patch: Patch) => {
    if (!serviceOnline) return;
    const serverPatch = toServerPatch(patch);
    // toServerPatch produces an empty object when the patch only touches
    // client-scoped fields - short-circuit to skip a pointless POST.
    const anyBlock = serverPatch.theme || serverPatch.panel || serverPatch.overlay
      || serverPatch.monitoring || serverPatch.cooling || serverPatch.ui || serverPatch.update
      || serverPatch.units || serverPatch.diagnostics;
    if (!anyBlock) return;
    if (writeTimer.current) clearTimeout(writeTimer.current);
    // Tracked so the unmount cleanup below can send this exact write instead
    // of only cancelling the timer - otherwise a patch made just before the
    // app closes never reaches the server.
    pendingWriteRef.current = serverPatch;
    // 250ms debounce collapses rapid slider-style updates into one POST.
    writeTimer.current = setTimeout(() => {
      writeTimer.current = null;
      pendingWriteRef.current = null;
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
    // it - the visible flicker: new theme → snaps back to old → tweens to new
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
      // One-time migration: if the server has never stored backgroundMode /
      // accentSource (empty = pre-upgrade), seed it from this window's saved
      // values so every window/context converges on the server copy. Gated on
      // hadStoredSettings so a fresh --app window (defaults only) can't seed.
      if (hadStoredSettings.current && !migratedThemeScope.current) {
        const local = fromNexusSettings(loadSettings());
        const seed: Patch = {};
        if (!prefs.theme?.backgroundMode) seed.backgroundMode = local.backgroundMode;
        if (!prefs.theme?.accentSource) seed.accentSource = local.accentSource;
        if (Object.keys(seed).length > 0) {
          migratedThemeScope.current = true;
          scheduleServerWrite(seed);
        }
      }
      setHydrated(true);
      // Mirror to the legacy cache so code paths still reading via
      // loadSettings() see refreshed values. Removable once every view
      // goes through this hook.
      cachePreferencesLocally({
        language: prefs.theme?.language,
        themeMode: prefs.theme?.themeMode,
        accentColor: prefs.theme?.accentColor,
        showConflictAlerts: prefs.ui?.showConflictAlerts,
        monitoringShowAverage: prefs.monitoring?.showAverage,
        monitoringDetailedCollapsed: prefs.monitoring?.detailedCollapsed,
        showMacStatusBarIcon: prefs.monitoring?.showMacStatusBarIcon,
        showWindowsTrayIcon: prefs.monitoring?.showWindowsTrayIcon,
        pinnedSidebarApps: prefs.ui?.pinnedSidebarApps,
        recentSidebarApps: prefs.ui?.recentSidebarApps,
      });
    }).catch(() => { /* best-effort */ });
  }, [serviceOnline, persistLocal, setLanguage, manageDom, scheduleServerWrite]);

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

  // Flush any pending write if the app is unmounting. Cancelling the timer
  // alone would silently drop a patch made just before close (e.g. a pin
  // right before the user quits) - send it immediately instead.
  useEffect(() => () => {
    if (writeTimer.current) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
      if (pendingWriteRef.current) {
        savePreferences(pendingWriteRef.current).catch(() => { /* best-effort */ });
        pendingWriteRef.current = null;
      }
    }
  }, []);

  const value = useMemo<UiSettingsContextValue>(() => ({
    settings, update, reload, hydrated,
  }), [settings, update, reload, hydrated]);

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

/**
 * Read-only accessor for the display-unit preferences. Returns the defaults
 * outside a UiSettingsProvider (preview catalog, tests, any surface without the
 * provider) so unit-formatting callers degrade to Celsius / system / system
 * instead of crashing - same pattern as {@link useTempSensorPrefs}.
 */
export function useUnitPrefs(): {
  monitoringTempUnit: TempUnit; timeFormat: TimeFormat; numberFormat: NumberFormat;
} {
  const ctx = useContext(UiSettingsContext);
  if (!ctx) {
    return {
      monitoringTempUnit: DEFAULT_TEMP_UNIT,
      timeFormat: DEFAULT_TIME_FORMAT,
      numberFormat: DEFAULT_NUMBER_FORMAT,
    };
  }
  return {
    monitoringTempUnit: ctx.settings.monitoringTempUnit,
    timeFormat: ctx.settings.timeFormat,
    numberFormat: ctx.settings.numberFormat,
  };
}

/**
 * Read-only accessor for how long a temperature warning lingers after the
 * episode ends (minutes; 0 = clears immediately). Returns the contract default
 * outside a UiSettingsProvider (tests, harness) so callers degrade instead of
 * crashing - same pattern as {@link useUnitPrefs}.
 */
export function useDiagnosticsWarningLingerMinutes(): number {
  const ctx = useContext(UiSettingsContext);
  return ctx ? ctx.settings.diagnosticsWarningLingerMinutes : DIAGNOSTICS_SETTINGS_DEFAULTS.warningLingerMinutes;
}
