import { fetchService, postService, putService, deleteService, loopbackFetchInit, resolveHttp, authFetchWithStatus } from './service';
import { getToken } from './auth';
import type { PanelLayout } from '../panel/types';
import type { OverlayWidgetDto } from './overlay';
import type { UpdateChannel, UpdateMode } from './update';
import type { TempUnit, TimeFormat, NumberFormat } from '../lib/units';

export const PROFILE_CATEGORIES = ['lighting', 'cooling', 'theme', 'dashboard'] as const;
export type ProfileCategory = typeof PROFILE_CATEGORIES[number];

export interface ProfileEntry {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

// Shared between install-defaults and the live profile. Mirror of the C#
// POCOs in nexus-service/src/Persistence/SharedSettings.cs.

export interface ThemeSettings {
  language: string;
  themeMode: string;
  accentColor: string;
  // Desktop app's resolved theme ('dark'|'light'), republished on change so
  // synced remote panels follow the desktop OS instead of their own. Optional:
  // older services omit it; '' means not yet published (fall back to themeMode).
  resolvedThemeMode?: string;
  // Dashboard backdrop ('glass'|'gradient'|'flat') and accent policy
  // ('system'|'custom'). '' = unset by any client yet; the client keeps its
  // local default and seeds the server once (see useUiSettings migration).
  backgroundMode?: string;
  accentSource?: string;
}

export interface MonitoringSettings {
  showAverage: boolean;
  showMacStatusBarIcon: boolean;
  showWindowsTrayIcon: boolean;
  detailedCollapsed: string[];
}

export interface PanelSettings {
  autoLaunch: boolean;
  reserveMonitor: boolean;
  themeSyncWithDesktop: boolean;
  themeMode: string;
  accentSyncWithDesktop: boolean;
  accentColor?: string;
  backgroundColor?: string;
  backgroundColorLight?: string;
  backgroundMode: string;
  backgroundEffect: string;
  backgroundTemplate: number;
  backgroundOpacity: number;
  widgetOpacity: number;
  widgetLabels: boolean;
  // Profile-scoped desktop dashboard layout. Absent / null when the SPA's
  // built-in default seed applies on first load.
  dashboardLayout?: PanelLayout;
}

export interface OverlaySettings {
  enabled: boolean;
  alwaysOnTop: boolean;
  scale: number;
  opacity: number;
  monitor: number;
  layout: OverlayWidgetDto[];
}

// preferences.diagnostics - thresholds/notifications/component monitoring for
// the Diagnostics Settings tab. Mirrors nexus-service's DiagnosticsSettings
// POCOs verbatim (see plans/diagnostics-monitoring-search-improvements.md
// "#2 wire contract"). Optional on Preferences: an older service omits it,
// which the client treats as the contract defaults.
export interface DiagnosticsThresholds {
  cpuC: number;
  gpuC: number;
  storageC: number;
  ramC: number;
}

export interface DiagnosticsNotificationPrefs {
  enabled: boolean;
  highTemp: boolean;
  storageHealth: boolean;
  cooling: boolean;
  memoryTest: boolean;
  systemDevices: boolean;
  gpuThrottle: boolean;
  cooldownMinutes: number;
}

export interface DiagnosticsComponentPrefs {
  cpu: boolean;
  gpu: boolean;
  storage: boolean;
  ram: boolean;
  cooling: boolean;
  system: boolean;
}

export interface DiagnosticsPrefs {
  thresholds: DiagnosticsThresholds;
  warningLingerMinutes: number;
  notifications: DiagnosticsNotificationPrefs;
  components: DiagnosticsComponentPrefs;
}

export interface DiagnosticsPrefsPatch {
  thresholds?: Partial<DiagnosticsThresholds>;
  warningLingerMinutes?: number;
  notifications?: Partial<DiagnosticsNotificationPrefs>;
  components?: Partial<DiagnosticsComponentPrefs>;
}

export interface CoolingPrefs {
  fanChannelOrder?: string[];
  // Empty string / null = "auto" (let the UI pick the default temperature
  // sensor for that domain). Sent verbatim on save; server treats null as
  // "field omitted, keep current" and empty string as "reset to auto".
  preferredCpuTempSensorId?: string | null;
  preferredGpuTempSensorId?: string | null;
  // Primary GPU by model name. Same null/empty semantics as the temp sensors.
  preferredGpuId?: string | null;
}

export interface UiPrefs {
  showConflictAlerts: boolean;
  // Order of the user's pinnable sidebar apps after the locked Dashboard
  // row. Optional because nexus-service does not implement this field yet:
  // GET /preferences never returns it and POST /preferences silently drops
  // it (UiSettings/UiSettingsPatch on the service carry no matching
  // property), so today this array is durable only within the browser's own
  // local cache for the current profile/window context, not across it. The
  // client falls back to DEFAULT_PINNED_TAIL when absent.
  pinnedSidebarApps?: string[];
  // Recently opened unpinned apps, oldest first (macOS dock "recent items"
  // semantics). Same "service does not implement" durability gap as
  // pinnedSidebarApps above: GET /preferences never returns it and POST
  // /preferences silently drops it, so this is durable only within the
  // browser's own local cache for the current profile/window context.
  recentSidebarApps?: string[];
  // One-time marker: the OEM bake-in app's dashboard widget + sidebar pin
  // have been reconciled onto this profile. Optional - older services
  // return Preferences without this field, which the client treats as false.
  oemAppSeeded?: boolean;
}

export interface UpdatePrefs {
  updateMode: UpdateMode;
  updateChannel: UpdateChannel;
  lastDismissedUpdateVersion: string;
}

// Display-unit choices. The service stores/echoes the strings verbatim; the
// client owns their meaning (see lib/units.ts). Optional throughout - an older
// service returns Preferences without this block, which the client treats as
// the defaults.
export interface UnitsPrefs {
  monitoringTempUnit?: TempUnit;
  timeFormat?: TimeFormat;
  numberFormat?: NumberFormat;
}

// Nested preferences shape - same nesting on read (GET /preferences) and
// write (POST /preferences). Per-domain sub-patches are partial; omitted
// fields are unchanged.
export interface Preferences {
  theme: ThemeSettings;
  panel: PanelSettings;
  overlay: OverlaySettings;
  monitoring: MonitoringSettings;
  cooling: CoolingPrefs;
  ui: UiPrefs;
  update?: UpdatePrefs;
  units?: UnitsPrefs;
  diagnostics?: DiagnosticsPrefs;
}

export interface PreferencesPatch {
  theme?: Partial<ThemeSettings>;
  panel?: Partial<PanelSettings>;
  overlay?: Partial<OverlaySettings>;
  monitoring?: Partial<MonitoringSettings>;
  cooling?: Partial<CoolingPrefs>;
  ui?: Partial<UiPrefs>;
  update?: Partial<UpdatePrefs>;
  units?: Partial<UnitsPrefs>;
  diagnostics?: DiagnosticsPrefsPatch;
}

interface GetProfilesResponse {
  profiles: ProfileEntry[];
  activeId: string;
}

// error/msg mirror the service's ApiResponse envelope, present on every
// response (including success); profile is populated only on success.
export interface ProfileResponse {
  error?: boolean;
  msg?: string;
  profile?: ProfileEntry;
}

export interface ProfileFetchResult<T> {
  status: number;
  body: T | null;
}

interface SwitchProfileResponse {
  switched: string;
  prefs: Preferences;
}

export const fetchProfiles = () =>
  fetchService<GetProfilesResponse>('/profiles');

// Status-preserving fetch for the three profile mutations whose non-2xx body
// carries a machine error code (profile_name_taken) the caller must branch
// on. postService collapses any non-2xx to null, discarding that body -
// unusable here. Built on authFetchWithStatus (not a hand-rolled fetch) so
// these calls keep the same relay / LAN-sealed tunnel routing as every other
// local-service call - unlike cloud.ts's api.hellonexus.com calls, these hit
// the local service and MUST tunnel off-LAN.
async function profileFetch<T>(path: string, method: string, body?: unknown): Promise<ProfileFetchResult<T>> {
  const { response, status } = await authFetchWithStatus(path, { method, body });
  if (!response) return { status, body: null };
  let parsedBody: T | null = null;
  try { parsedBody = (await response.json()) as T; } catch { parsedBody = null; }
  return { status, body: parsedBody };
}

export const createProfile = (name: string) =>
  profileFetch<ProfileResponse>('/profiles/create', 'POST', { name });

export const switchProfile = (id: string) =>
  postService<SwitchProfileResponse>(`/profiles/${encodeURIComponent(id)}/switch`, {});

export const renameProfile = (id: string, name: string) =>
  profileFetch<ProfileResponse>(`/profiles/${encodeURIComponent(id)}/rename`, 'POST', { name });

export const deleteProfile = (id: string) =>
  deleteService(`/profiles/${encodeURIComponent(id)}`);

export const fetchPreferences = () =>
  fetchService<Preferences>('/preferences');

export const savePreferences = (patch: PreferencesPatch) =>
  postService('/preferences', patch);

export interface SharingConfig {
  primaryProfileId: string | null;
  sharedCategories: ProfileCategory[];
  allCategories: ProfileCategory[];
}

export const fetchSharing = () => fetchService<SharingConfig>('/profiles/sharing');

export const setPrimaryProfile = (profileId: string) =>
  putService('/profiles/sharing/primary', { profileId });

export const setCategoryShared = (category: ProfileCategory, shared: boolean) =>
  putService('/profiles/sharing/categories', { category, shared });

// Reset every per-profile (non-shared) category on the named profile.
// Shared categories are untouched. Does NOT cascade through Primary.
export const resetProfile = (profileId: string) =>
  postService(`/profiles/${encodeURIComponent(profileId)}/reset`, {});

// Reset one category. If the category is Shared the service redirects the
// reset to the Primary's data and the change applies to all profiles. If
// per-profile, only the named profile is touched.
export const resetProfileCategory = (profileId: string, category: ProfileCategory) =>
  postService(`/profiles/${encodeURIComponent(profileId)}/reset/${encodeURIComponent(category)}`, {});

export async function exportProfile(id: string, name: string): Promise<void> {
  try {
    const token = await getToken();
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const resp = await fetch(resolveHttp(`/profiles/${encodeURIComponent(id)}/export`), { ...loopbackFetchInit, headers });
    if (!resp.ok) return;
    const blob = await resp.blob();
    const safeName = name.replace(/[^a-zA-Z0-9_-]/g, '_');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nexus-${safeName}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch { /* ignore download errors */ }
}

export async function importProfileFile(file: File, replace = false): Promise<ProfileFetchResult<ProfileResponse>> {
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const path = replace ? '/profiles/import?replace=true' : '/profiles/import';
    return await profileFetch<ProfileResponse>(path, 'POST', parsed);
  } catch {
    return { status: 0, body: null };
  }
}
