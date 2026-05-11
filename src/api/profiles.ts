import { fetchService, postService, putService, deleteService, resolveHttp } from './service';
import { getToken } from './auth';
import type { PanelLayout } from '../panel/types';

export const PROFILE_CATEGORIES = ['lighting', 'cooling', 'theme', 'dashboard'] as const;
export type ProfileCategory = typeof PROFILE_CATEGORIES[number];

export interface ProfileEntry {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface UiSettings {
  language: string;
  themeMode: string;
  accentColor: string;
  disableConflictAlerts: boolean;
  monitoringShowAverage: boolean;
  monitoringDetailedCollapsed?: string[];
  showMacStatusBarIcon: boolean;
  showWindowsTrayIcon: boolean;
  // Any consumer that posts partial preferences can omit this; the service's
  // merge rule preserves the existing saved order in that case.
  fanChannelOrder?: string[];
  // Auto-launch the panel kiosk when a recognized device display is connected.
  panelAutoLaunch?: boolean;
  // Panel-specific theme defaults. Per-device records override these.
  panelThemeSyncWithDesktop?: boolean;
  panelThemeMode?: string;
  panelAccentSyncWithDesktop?: boolean;
  panelAccentColor?: string;
  panelBackgroundColor?: string;
  panelBackgroundColorLight?: string;
  panelBackgroundMode?: string;
  panelBackgroundEffect?: string;
  panelBackgroundTemplate?: number;
  panelBackgroundOpacity?: number;
  panelWidgetOpacity?: number;
  panelWidgetLabels?: boolean;
  dashboardLayout?: PanelLayout;
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
  ui: UiSettings;
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
  fetchService<UiSettings>('/preferences');

export const savePreferences = (prefs: Partial<UiSettings>) =>
  postService('/preferences', prefs);

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
    a.download = `qos-${safeName}.json`;
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
