import { fetchService, postService, putService, deleteService, resolveHttp } from './service';
import { getToken } from './auth';
import type { PanelLayout } from '../panel/types';
import type { OverlayWidgetDto } from './overlay';

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

export interface CoolingPrefs {
  fanChannelOrder?: string[];
  // Empty string / null = "auto" (let the UI pick the default temperature
  // sensor for that domain). Sent verbatim on save; server treats null as
  // "field omitted, keep current" and empty string as "reset to auto".
  preferredCpuTempSensorId?: string | null;
  preferredGpuTempSensorId?: string | null;
}

export interface UiPrefs {
  disableConflictAlerts: boolean;
  // Order of the user's pinnable sidebar apps after the locked Dashboard
  // row. Optional — older services return Preferences without this field;
  // the client falls back to DEFAULT_PINNED_TAIL in that case.
  pinnedSidebarApps?: string[];
}

// Nested preferences shape — same nesting on read (GET /preferences) and
// write (POST /preferences). Per-domain sub-patches are partial; omitted
// fields are unchanged.
export interface Preferences {
  theme: ThemeSettings;
  panel: PanelSettings;
  overlay: OverlaySettings;
  monitoring: MonitoringSettings;
  cooling: CoolingPrefs;
  ui: UiPrefs;
}

export interface PreferencesPatch {
  theme?: Partial<ThemeSettings>;
  panel?: Partial<PanelSettings>;
  overlay?: Partial<OverlaySettings>;
  monitoring?: Partial<MonitoringSettings>;
  cooling?: Partial<CoolingPrefs>;
  ui?: Partial<UiPrefs>;
}

interface GetProfilesResponse {
  profiles: ProfileEntry[];
  activeId: string;
}

interface ProfileResponse {
  profile: ProfileEntry;
}

interface SwitchProfileResponse {
  switched: string;
  prefs: Preferences;
}

export const fetchProfiles = () =>
  fetchService<GetProfilesResponse>('/profiles');

export const createProfile = (name: string) =>
  postService<ProfileResponse>('/profiles/create', { name });

export const switchProfile = (id: string) =>
  postService<SwitchProfileResponse>(`/profiles/${encodeURIComponent(id)}/switch`, {});

export const renameProfile = (id: string, name: string) =>
  postService<ProfileResponse>(`/profiles/${encodeURIComponent(id)}/rename`, { name });

export const deleteProfile = (id: string) =>
  deleteService(`/profiles/${encodeURIComponent(id)}`);

export const saveProfile = (id: string) =>
  postService(`/profiles/${encodeURIComponent(id)}/save`, {});

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
    const resp = await fetch(resolveHttp(`/profiles/${encodeURIComponent(id)}/export`), { headers });
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

export async function importProfileFile(file: File): Promise<ProfileResponse | null> {
  try {
    const text = await file.text();
    JSON.parse(text);
    const token = await getToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const resp = await fetch(resolveHttp('/profiles/import'), { method: 'POST', headers, body: text });
    if (!resp.ok) return null;
    return await resp.json();
  } catch { return null; }
}
