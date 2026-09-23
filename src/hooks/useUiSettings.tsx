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
  type DashboardMode,
} from '../lib/settings';
import {
  fetchPreferences, savePreferences,
  type Preferences as ServerPreferences,
  type PreferencesPatch,
  type DiagnosticsThresholds,
  type DiagnosticsNotificationPrefs,
  type DiagnosticsComponentPrefs,
  type FeaturesPrefs,
} from '../api/profiles';
import type { UpdateChannel, UpdateMode } from '../api/update';
import {
  DEFAULT_TEMP_UNIT, DEFAULT_TIME_FORMAT, DEFAULT_NUMBER_FORMAT,
  type TempUnit, type TimeFormat, type NumberFormat,
} from '../lib/units';
import { useTopicCallback } from './useMultiplexSocket';
import { useTranslation } from '../lib/i18n';
import { sanitizeAppOrder, sanitizePinnedTail } from '../app/sidebarApps';

/**
 * Unified user-settings hook.
 *
 * Rules enforced here:
 *   - `clientScoped` fields (startOnLogin, rememberLastPage, widgetAdvancedMode)
 *     live in localStorage only.
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
  // Reopen the window on the page it was last closed on (see useLastRoute).
  rememberLastPage: boolean;

  // Profile-scoped (server is source of truth; localStorage mirrors)
  // Dashboard background style (glass / gradient / flat).
  backgroundMode: BackgroundMode;
  // Accent source: 'system' tracks the OS accent, 'custom' uses accentColor.
  accentSource: AccentSource;
  language: Language;
  themeMode: ThemeMode;
  accentColor: string;
  // Last colour picked from the accent palette's custom slot; '' = never used.
  // Held apart from accentColor so the slot survives picking a preset.
  customAccentColor: string;
  showConflictAlerts: boolean;
  autoKillConflictsAtStartup: boolean;
  /** Catalog ids excluded from the startup shutdown; every other known app is included. */
  conflictAutoKillExclusions: string[];
  monitoringDetailedCollapsed: string[];
  monitoringEventsEnabled: boolean;
  monitoringFpsOverlayEnabled: boolean;
  /** Seconds between SMART reads per drive, keyed by LHM identifier. 0 = never. */
  smartPollSeconds: Record<string, number>;
  smartPollDefaultSeconds: number;
  smartPollPerDrive: boolean;
  monitoringEventKindsHidden: string[];
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
  // User-dragged order of the unpinned sidebar apps below the separator;
  // empty = sorted by name. Posted under ui.sidebarAppOrder.
  sidebarAppOrder: string[];
  // One-time marker: the OEM bake-in app's dashboard widget + sidebar pin
  // have been reconciled onto this profile (see useOemAppSeed). Server-only,
  // like the update block below - not mirrored to localStorage.
  oemAppSeeded: boolean;
  // When true, lighting + cooling widgets show the rich UI (chart, chips,
  // mode buttons); default false (compact center-icon+arrows layout).
  // Per-widget config.advancedMode overrides this per instance.
  widgetAdvancedMode: boolean;
  // Per-page density of the dashboard lighting/cooling pages. Server-mirrored
  // under ui.lightingDashboardMode / ui.coolingDashboardMode; the service
  // seeds pre-existing installs to 'advanced'.
  lightingDashboardMode: DashboardMode;
  coolingDashboardMode: DashboardMode;
  // False hides Nexus-Control-off devices from that page's rail; the two
  // pages keep separate answers.
  showUncontrolledLightingDevices: boolean;
  showUncontrolledCoolingDevices: boolean;
  // Display-unit choices, server-mirrored under the preferences `units` block.
  // monitoringTempUnit governs in-app hardware temps only (default 'c');
  // outdoor weather keeps its own per-widget unit. See lib/units.ts.
  monitoringTempUnit: TempUnit;
  timeFormat: TimeFormat;
  numberFormat: NumberFormat;
  // Windows-only: seconds to wait before starting Nexus at system startup.
  // Server-mirrored under the preferences top-level startupDelaySeconds field.
  startupDelaySeconds: number;
  // Global feature switches (default on), server-mirrored under the
  // preferences `features` block. See {@link useFeatureFlags} for the
  // read-only accessor gated surfaces should use instead of this hook.
  featureLightingEnabled: boolean;
  featureCoolingEnabled: boolean;
  featureMonitoringEnabled: boolean;
  featureDiagnosticsEnabled: boolean;
  // Server-only update prefs (not saved to localStorage).
  updateMode: UpdateMode;
  updateChannel: UpdateChannel;
  lastDismissedUpdateVersion: string;
  // Diagnostics Settings tab preferences (preferences.diagnostics), server-only
  // like the update block above. Flattened leaves of the wire contract -
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
  diagnosticsIgnoredComponents: string[];
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
  ignoredComponents: [] as string[],
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
    customAccentColor: src.general.customAccentColor,
    showConflictAlerts: src.general.showConflictAlerts,
    autoKillConflictsAtStartup: src.general.autoKillConflictsAtStartup,
    conflictAutoKillExclusions: src.general.conflictAutoKillExclusions,
    monitoringDetailedCollapsed: src.general.monitoringDetailedCollapsed,
    monitoringEventsEnabled: src.general.monitoringEventsEnabled,
    monitoringFpsOverlayEnabled: src.general.monitoringFpsOverlayEnabled,
    smartPollSeconds: src.general.smartPollSeconds,
    smartPollDefaultSeconds: src.general.smartPollDefaultSeconds,
    smartPollPerDrive: src.general.smartPollPerDrive,
    monitoringEventKindsHidden: src.general.monitoringEventKindsHidden,
    showMacStatusBarIcon: src.general.showMacStatusBarIcon,
    showWindowsTrayIcon: src.general.showWindowsTrayIcon,
    rememberLastPage: src.general.rememberLastPage,
    fanChannelOrder: [],
    preferredCpuTempSensorId: '',
    preferredGpuTempSensorId: '',
    preferredGpuId: '',
    pinnedSidebarApps: sanitizePinnedTail(src.general.pinnedSidebarApps),
    sidebarAppOrder: sanitizeAppOrder(src.general.sidebarAppOrder),
    oemAppSeeded: false,
    widgetAdvancedMode: src.general.widgetAdvancedMode,
    lightingDashboardMode: src.general.lightingDashboardMode,
    coolingDashboardMode: src.general.coolingDashboardMode,
    showUncontrolledLightingDevices: src.general.showUncontrolledLightingDevices,
    showUncontrolledCoolingDevices: src.general.showUncontrolledCoolingDevices,
    monitoringTempUnit: src.general.monitoringTempUnit,
    timeFormat: src.general.timeFormat,
    numberFormat: src.general.numberFormat,
    startupDelaySeconds: src.general.startupDelaySeconds,
    featureLightingEnabled: src.general.featureLightingEnabled,
    featureCoolingEnabled: src.general.featureCoolingEnabled,
    featureMonitoringEnabled: src.general.featureMonitoringEnabled,
    featureDiagnosticsEnabled: src.general.featureDiagnosticsEnabled,
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
    diagnosticsIgnoredComponents: DIAGNOSTICS_SETTINGS_DEFAULTS.ignoredComponents,
  };
}

function toNexusSettings(src: UiSettingsValue): NexusSettings {
  return {
    general: {
      language: src.language,
      themeMode: src.themeMode,
      accentColor: src.accentColor,
      customAccentColor: src.customAccentColor,
      backgroundMode: src.backgroundMode,
      accentSource: src.accentSource,
      startOnLogin: src.startOnLogin,
      showConflictAlerts: src.showConflictAlerts,
      autoKillConflictsAtStartup: src.autoKillConflictsAtStartup,
      conflictAutoKillExclusions: src.conflictAutoKillExclusions,
      monitoringDetailedCollapsed: src.monitoringDetailedCollapsed,
      monitoringEventsEnabled: src.monitoringEventsEnabled,
      monitoringFpsOverlayEnabled: src.monitoringFpsOverlayEnabled,
      smartPollSeconds: src.smartPollSeconds,
      smartPollDefaultSeconds: src.smartPollDefaultSeconds,
      smartPollPerDrive: src.smartPollPerDrive,
      monitoringEventKindsHidden: src.monitoringEventKindsHidden,
      showMacStatusBarIcon: src.showMacStatusBarIcon,
      showWindowsTrayIcon: src.showWindowsTrayIcon,
      rememberLastPage: src.rememberLastPage,
      pinnedSidebarApps: src.pinnedSidebarApps,
      sidebarAppOrder: src.sidebarAppOrder,
      widgetAdvancedMode: src.widgetAdvancedMode,
      lightingDashboardMode: src.lightingDashboardMode,
      coolingDashboardMode: src.coolingDashboardMode,
      showUncontrolledLightingDevices: src.showUncontrolledLightingDevices,
      showUncontrolledCoolingDevices: src.showUncontrolledCoolingDevices,
      monitoringTempUnit: src.monitoringTempUnit,
      timeFormat: src.timeFormat,
      numberFormat: src.numberFormat,
      startupDelaySeconds: src.startupDelaySeconds,
      featureLightingEnabled: src.featureLightingEnabled,
      featureCoolingEnabled: src.featureCoolingEnabled,
      featureMonitoringEnabled: src.featureMonitoringEnabled,
      featureDiagnosticsEnabled: src.featureDiagnosticsEnabled,
    },
  };
}

/** Translate the hook's flat field patch into the nested PreferencesPatch the server expects. */
function toServerPatch(patch: Patch): PreferencesPatch {
  const out: PreferencesPatch = {};
  // theme block
  const theme: Partial<{ language: Language; themeMode: ThemeMode; accentColor: string; customAccentColor: string; backgroundMode: BackgroundMode; accentSource: AccentSource }> = {};
  if (patch.language !== undefined) theme.language = patch.language;
  if (patch.themeMode !== undefined) theme.themeMode = patch.themeMode;
  if (patch.accentColor !== undefined) theme.accentColor = patch.accentColor;
  if (patch.customAccentColor !== undefined) theme.customAccentColor = patch.customAccentColor;
  if (patch.backgroundMode !== undefined) theme.backgroundMode = patch.backgroundMode;
  if (patch.accentSource !== undefined) theme.accentSource = patch.accentSource;
  if (Object.keys(theme).length > 0) out.theme = theme;
  // monitoring block
  const monitoring: Partial<{ showMacStatusBarIcon: boolean; showWindowsTrayIcon: boolean; detailedCollapsed: string[]; eventsEnabled: boolean; fpsOverlayEnabled: boolean; eventKindsHidden: string[]; smartPollSeconds: Record<string, number>; smartPollDefaultSeconds: number; smartPollPerDrive: boolean }> = {};
  if (patch.monitoringDetailedCollapsed !== undefined) monitoring.detailedCollapsed = patch.monitoringDetailedCollapsed;
  if (patch.monitoringEventsEnabled !== undefined) monitoring.eventsEnabled = patch.monitoringEventsEnabled;
  if (patch.monitoringFpsOverlayEnabled !== undefined) monitoring.fpsOverlayEnabled = patch.monitoringFpsOverlayEnabled;
  if (patch.smartPollSeconds !== undefined) monitoring.smartPollSeconds = patch.smartPollSeconds;
  if (patch.smartPollDefaultSeconds !== undefined) monitoring.smartPollDefaultSeconds = patch.smartPollDefaultSeconds;
  if (patch.smartPollPerDrive !== undefined) monitoring.smartPollPerDrive = patch.smartPollPerDrive;
  if (patch.monitoringEventKindsHidden !== undefined) monitoring.eventKindsHidden = patch.monitoringEventKindsHidden;
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
  const ui: Partial<{ showConflictAlerts: boolean; autoKillConflictsAtStartup: boolean; conflictAutoKillExclusions: string[]; pinnedSidebarApps: string[]; sidebarAppOrder: string[]; oemAppSeeded: boolean; lightingDashboardMode: DashboardMode; coolingDashboardMode: DashboardMode; showUncontrolledLightingDevices: boolean; showUncontrolledCoolingDevices: boolean }> = {};
  if (patch.showConflictAlerts !== undefined) ui.showConflictAlerts = patch.showConflictAlerts;
  if (patch.autoKillConflictsAtStartup !== undefined) ui.autoKillConflictsAtStartup = patch.autoKillConflictsAtStartup;
  if (patch.conflictAutoKillExclusions !== undefined) ui.conflictAutoKillExclusions = patch.conflictAutoKillExclusions;
  if (patch.pinnedSidebarApps !== undefined) ui.pinnedSidebarApps = patch.pinnedSidebarApps;
  if (patch.sidebarAppOrder !== undefined) ui.sidebarAppOrder = patch.sidebarAppOrder;
  if (patch.oemAppSeeded !== undefined) ui.oemAppSeeded = patch.oemAppSeeded;
  if (patch.lightingDashboardMode !== undefined) ui.lightingDashboardMode = patch.lightingDashboardMode;
  if (patch.coolingDashboardMode !== undefined) ui.coolingDashboardMode = patch.coolingDashboardMode;
  if (patch.showUncontrolledLightingDevices !== undefined) ui.showUncontrolledLightingDevices = patch.showUncontrolledLightingDevices;
  if (patch.showUncontrolledCoolingDevices !== undefined) ui.showUncontrolledCoolingDevices = patch.showUncontrolledCoolingDevices;
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
  // Top-level field (not nested under a domain block), per the wire contract.
  if (patch.startupDelaySeconds !== undefined) out.startupDelaySeconds = patch.startupDelaySeconds;
  // features block
  const features: FeaturesPrefs = {};
  if (patch.featureLightingEnabled !== undefined) features.lighting = patch.featureLightingEnabled;
  if (patch.featureCoolingEnabled !== undefined) features.cooling = patch.featureCoolingEnabled;
  if (patch.featureMonitoringEnabled !== undefined) features.monitoring = patch.featureMonitoringEnabled;
  if (patch.featureDiagnosticsEnabled !== undefined) features.diagnostics = patch.featureDiagnosticsEnabled;
  if (Object.keys(features).length > 0) out.features = features;
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
  if (patch.diagnosticsIgnoredComponents !== undefined) diagnostics.ignoredComponents = patch.diagnosticsIgnoredComponents;
  if (Object.keys(diagnostics).length > 0) out.diagnostics = diagnostics;
  return out;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Deep-merge a newer server patch onto a still-pending one. Nested domain
// blocks (theme, diagnostics.thresholds, ...) merge field-by-field; arrays and
// scalars replace. Two update() calls inside the debounce window must both
// reach the server - dropping a field lets its stale server value echo back
// over the 'prefs' topic and revert the UI (e.g. flipping accentSource to
// 'system' while SystemAccentSync re-asserts accentColor in the same window).
function mergeServerPatch(
  base: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    const prev = out[key];
    out[key] = isPlainObject(prev) && isPlainObject(value) ? mergeServerPatch(prev, value) : value;
  }
  return out;
}

function applyServerToLocal(server: ServerPreferences, base: UiSettingsValue): UiSettingsValue {
  return {
    ...base,
    language: (server.theme?.language as Language) ?? base.language,
    themeMode: (server.theme?.themeMode as ThemeMode) ?? base.themeMode,
    accentColor: server.theme?.accentColor ?? base.accentColor,
    customAccentColor: server.theme?.customAccentColor ?? base.customAccentColor,
    // Empty (never written) falls back to the local value, so an upgraded
    // client keeps its choice until it seeds the server (see reload migration).
    backgroundMode: (server.theme?.backgroundMode as BackgroundMode) || base.backgroundMode,
    accentSource: (server.theme?.accentSource as AccentSource) || base.accentSource,
    showConflictAlerts: server.ui?.showConflictAlerts ?? base.showConflictAlerts,
    autoKillConflictsAtStartup: server.ui?.autoKillConflictsAtStartup ?? base.autoKillConflictsAtStartup,
    conflictAutoKillExclusions: server.ui?.conflictAutoKillExclusions ?? base.conflictAutoKillExclusions,
    // Unknown/absent values keep the local value (older services omit them).
    lightingDashboardMode: server.ui?.lightingDashboardMode === 'simple' || server.ui?.lightingDashboardMode === 'advanced'
      ? server.ui.lightingDashboardMode
      : base.lightingDashboardMode,
    coolingDashboardMode: server.ui?.coolingDashboardMode === 'simple' || server.ui?.coolingDashboardMode === 'advanced'
      ? server.ui.coolingDashboardMode
      : base.coolingDashboardMode,
    // Each page falls back to the single pre-split flag, so an install that
    // had them hidden keeps them hidden on both until the user splits them.
    showUncontrolledLightingDevices: server.ui?.showUncontrolledLightingDevices
      ?? server.ui?.showUncontrolledDevices ?? base.showUncontrolledLightingDevices,
    showUncontrolledCoolingDevices: server.ui?.showUncontrolledCoolingDevices
      ?? server.ui?.showUncontrolledDevices ?? base.showUncontrolledCoolingDevices,
    monitoringDetailedCollapsed: server.monitoring?.detailedCollapsed ?? base.monitoringDetailedCollapsed,
    monitoringEventsEnabled: server.monitoring?.eventsEnabled ?? base.monitoringEventsEnabled,
    monitoringFpsOverlayEnabled: server.monitoring?.fpsOverlayEnabled ?? base.monitoringFpsOverlayEnabled,
    smartPollSeconds: server.monitoring?.smartPollSeconds ?? base.smartPollSeconds,
    smartPollDefaultSeconds: server.monitoring?.smartPollDefaultSeconds ?? base.smartPollDefaultSeconds,
    smartPollPerDrive: server.monitoring?.smartPollPerDrive ?? base.smartPollPerDrive,
    monitoringEventKindsHidden: server.monitoring?.eventKindsHidden ?? base.monitoringEventKindsHidden,
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
    sidebarAppOrder: server.ui?.sidebarAppOrder != null
      ? sanitizeAppOrder(server.ui.sidebarAppOrder)
      : base.sidebarAppOrder,
    oemAppSeeded: server.ui?.oemAppSeeded ?? base.oemAppSeeded,
    updateMode: (server.update?.updateMode as UpdateMode) ?? base.updateMode,
    updateChannel: (server.update?.updateChannel as UpdateChannel) ?? base.updateChannel,
    lastDismissedUpdateVersion: server.update?.lastDismissedUpdateVersion ?? base.lastDismissedUpdateVersion,
    monitoringTempUnit: (server.units?.monitoringTempUnit as TempUnit) ?? base.monitoringTempUnit,
    timeFormat: (server.units?.timeFormat as TimeFormat) ?? base.timeFormat,
    numberFormat: (server.units?.numberFormat as NumberFormat) ?? base.numberFormat,
    startupDelaySeconds: server.startupDelaySeconds ?? base.startupDelaySeconds,
    featureLightingEnabled: server.features?.lighting ?? base.featureLightingEnabled,
    featureCoolingEnabled: server.features?.cooling ?? base.featureCoolingEnabled,
    featureMonitoringEnabled: server.features?.monitoring ?? base.featureMonitoringEnabled,
    featureDiagnosticsEnabled: server.features?.diagnostics ?? base.featureDiagnosticsEnabled,
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
    diagnosticsIgnoredComponents: server.diagnostics?.ignoredComponents ?? base.diagnosticsIgnoredComponents,
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
    // startupDelaySeconds is a top-level number (0 is a valid value), so it is
    // checked for definedness rather than truthiness like the domain blocks.
    const anyBlock = serverPatch.theme || serverPatch.panel || serverPatch.overlay
      || serverPatch.monitoring || serverPatch.cooling || serverPatch.ui || serverPatch.update
      || serverPatch.units || serverPatch.diagnostics || serverPatch.features
      || serverPatch.startupDelaySeconds !== undefined;
    if (!anyBlock) return;
    if (writeTimer.current) clearTimeout(writeTimer.current);
    // Merge into (not replace) the still-pending patch so fields from separate
    // update() calls inside the debounce window all survive into one POST.
    // Also tracked so the unmount cleanup below can send this exact write
    // instead of only cancelling the timer - otherwise a patch made just before
    // the app closes never reaches the server.
    pendingWriteRef.current = pendingWriteRef.current
      ? mergeServerPatch(pendingWriteRef.current as Record<string, unknown>, serverPatch as Record<string, unknown>) as PreferencesPatch
      : serverPatch;
    // 250ms debounce collapses rapid slider-style updates into one POST.
    writeTimer.current = setTimeout(() => {
      writeTimer.current = null;
      const toSend = pendingWriteRef.current;
      pendingWriteRef.current = null;
      if (toSend) savePreferences(toSend).catch(() => { /* best-effort */ });
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
        customAccentColor: prefs.theme?.customAccentColor,
        showConflictAlerts: prefs.ui?.showConflictAlerts,
        monitoringDetailedCollapsed: prefs.monitoring?.detailedCollapsed,
        showMacStatusBarIcon: prefs.monitoring?.showMacStatusBarIcon,
        showWindowsTrayIcon: prefs.monitoring?.showWindowsTrayIcon,
        pinnedSidebarApps: prefs.ui?.pinnedSidebarApps,
        sidebarAppOrder: prefs.ui?.sidebarAppOrder,
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
 * Update accessor that no-ops outside a provider, for the onboarding gates:
 * they render inside the app tree at runtime but are mounted bare in tests and
 * must not throw there.
 */
export function useUiSettingsUpdateSafe(): (patch: Patch) => void {
  const ctx = useContext(UiSettingsContext);
  return ctx ? ctx.update : NO_OP_UPDATE;
}

const NO_OP_UPDATE = () => {};

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

const NO_IGNORED_COMPONENTS: string[] = [];

/**
 * Per-device diagnostics ignore list (preferences.diagnostics.ignoredComponents),
 * keyed by the health component ids the service emits ("storage:<serial>",
 * "cooling:<deviceId>", "gpu:<n>"). Providerless: nothing ignored, toggle is
 * a no-op - same pattern as {@link useUnitPrefs}.
 */
export function useIgnoredComponents(): { isIgnored: (id: string) => boolean; toggle: (id: string) => void } {
  const ctx = useContext(UiSettingsContext);
  const ignored = ctx ? ctx.settings.diagnosticsIgnoredComponents : NO_IGNORED_COMPONENTS;
  const update = ctx?.update;
  const isIgnored = useCallback((id: string) => ignored.includes(id), [ignored]);
  const toggle = useCallback((id: string) => {
    update?.({
      diagnosticsIgnoredComponents: ignored.includes(id)
        ? ignored.filter(x => x !== id)
        : [...ignored, id],
    });
  }, [ignored, update]);
  return { isIgnored, toggle };
}

/** One of the four global feature switches (Lighting, Cooling, Monitoring, Diagnostics). */
export type FeatureKey = 'lighting' | 'cooling' | 'monitoring' | 'diagnostics';

export type FeatureFlags = Record<FeatureKey, boolean>;

const ALL_FEATURES_ON: FeatureFlags = { lighting: true, cooling: true, monitoring: true, diagnostics: true };

/**
 * Read-only accessor for the four global feature switches. Returns all-true
 * outside a UiSettingsProvider (preview catalog, tests, widgets mounted
 * providerless) so a gated surface defaults to enabled instead of crashing -
 * same pattern as {@link useUnitPrefs}.
 */
export function useFeatureFlags(): FeatureFlags {
  const ctx = useContext(UiSettingsContext);
  if (!ctx) return ALL_FEATURES_ON;
  return {
    lighting: ctx.settings.featureLightingEnabled,
    cooling: ctx.settings.featureCoolingEnabled,
    monitoring: ctx.settings.featureMonitoringEnabled,
    diagnostics: ctx.settings.featureDiagnosticsEnabled,
  };
}
