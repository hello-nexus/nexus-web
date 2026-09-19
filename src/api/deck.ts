// Client for the host-wide deck routes (nexus-service's src/Routes/DeckRoutes.cs).
// Every route here is .LocalhostOnly() except preset GET/POST/PUT, instance
// GET/PUT, and recent-apps GET/activate, which are AllowPanel (a paired panel
// reads/edits its own instance; DeckLayoutPolicy still gates privileged key
// authoring on a preset write). Preset DELETE and /apps stay LocalhostOnly.
import { fetchService, postService, putService, deleteService, authFetchWithStatus } from './service';
import type { DeckConfig } from '../panel/widgets/deck/types';

export type DeckInstanceMode = 'fixed' | 'recentApps' | 'appAware';

/** Same shape as lighting's PresetApp (api/lighting.ts) - an app bound to auto-activate this preset. */
export interface PresetApp {
  id: string;
  name: string;
  processName?: string;
}

export interface DeckPresetSummary {
  id: string;
  name: string;
  cols: number;
  rows: number;
  apps?: PresetApp[];
  templateId?: string;
  pageCount: number;
}

export interface DeckPresetFull extends DeckPresetSummary {
  deck: DeckConfig;
}

export interface DeckInstance {
  mode: DeckInstanceMode;
  activePresetId: string;
}

interface DeckPresetsListResponse {
  presets: DeckPresetSummary[];
}

interface DeckPresetResponse {
  preset: DeckPresetFull;
}

interface DeckInstanceResponse {
  instance: DeckInstance;
}

export async function getDeckPresets(): Promise<DeckPresetSummary[]> {
  const res = await fetchService<DeckPresetsListResponse>('/deck/presets');
  return res?.presets ?? [];
}

export async function getDeckPreset(id: string): Promise<DeckPresetFull | null> {
  const res = await fetchService<DeckPresetResponse>(`/deck/presets/${encodeURIComponent(id)}`);
  return res?.preset ?? null;
}

export interface CreateDeckPresetBody {
  name: string;
  cols: number;
  rows: number;
  deck?: DeckConfig;
  templateId?: string;
  copyOfPresetId?: string;
}

/** Null covers both a transport failure and a refused write (duplicate name, cap reached) - the route's 409/4xx body is not distinguishable through fetchService's fail-closed contract (see api/lighting.ts's createLayoutPreset for the same tradeoff). */
export async function createDeckPreset(body: CreateDeckPresetBody): Promise<DeckPresetFull | null> {
  const res = await postService<DeckPresetResponse>('/deck/presets', body);
  return res?.preset ?? null;
}

export interface UpdateDeckPresetBody {
  name?: string;
  deck?: DeckConfig;
  cols?: number;
  rows?: number;
}

export async function updateDeckPreset(id: string, patch: UpdateDeckPresetBody): Promise<DeckPresetFull | null> {
  const res = await putService<DeckPresetResponse>(`/deck/presets/${encodeURIComponent(id)}`, patch);
  return res?.preset ?? null;
}

export async function deleteDeckPreset(id: string): Promise<boolean> {
  const res = await deleteService<{ error?: boolean }>(`/deck/presets/${encodeURIComponent(id)}`);
  return res !== null && res.error !== true;
}

/** `grid` sizes a widget instance's first-time preset (no-op once one exists). */
export async function getDeckInstance(id: string, grid?: { cols: number; rows: number }): Promise<DeckInstance | null> {
  const qs = grid ? `?cols=${grid.cols}&rows=${grid.rows}` : '';
  const res = await fetchService<DeckInstanceResponse>(`/deck/instances/${encodeURIComponent(id)}${qs}`);
  return res?.instance ?? null;
}

export interface UpdateDeckInstanceBody {
  mode?: DeckInstanceMode;
  activePresetId?: string;
}

export async function updateDeckInstance(id: string, patch: UpdateDeckInstanceBody): Promise<DeckInstance | null> {
  const res = await putService<DeckInstanceResponse>(`/deck/instances/${encodeURIComponent(id)}`, patch);
  return res?.instance ?? null;
}

// --- App Aware: preset app bindings ---

/** 409 body when an app in the request already triggers another preset - same shape as lighting's PresetAppConflict. */
export interface DeckPresetAppConflict {
  error: boolean;
  msg: string;
  appName: string;
  presetName: string;
}

/** A refused save is not the same as an unreachable service; see api/lighting.ts's SetPresetAppsResult for the same tradeoff. */
export type SetDeckPresetAppsResult =
  | { kind: 'ok'; preset: DeckPresetSummary }
  | { kind: 'conflict'; conflict: DeckPresetAppConflict }
  | { kind: 'failed' };

export async function setDeckPresetApps(presetId: string, apps: PresetApp[]): Promise<SetDeckPresetAppsResult> {
  const { response, status } = await authFetchWithStatus(
    `/deck/presets/${encodeURIComponent(presetId)}/apps`,
    { method: 'PUT', body: { apps } },
  );
  if (status === 200 && response) {
    try {
      const body = (await response.json()) as DeckPresetResponse | { preset: DeckPresetSummary };
      return { kind: 'ok', preset: body.preset };
    } catch {
      return { kind: 'failed' };
    }
  }
  if (status === 409 && response) {
    try {
      return { kind: 'conflict', conflict: (await response.json()) as DeckPresetAppConflict };
    } catch {
      return { kind: 'failed' };
    }
  }
  return { kind: 'failed' };
}

// --- Templates (bundled per-app preset seeds) ---

export interface DeckTemplateMatch {
  processNames: string[];
  displayNames: string[];
}

export interface DeckTemplate {
  id: string;
  name: string;
  description: string;
  cols: number;
  rows: number;
  match: DeckTemplateMatch;
  /** Resolved server-side against the installed shortcut/process list; absent when nothing installed matches. */
  installedAppId?: string;
  installedAppName?: string;
  processName?: string;
}

interface DeckTemplatesResponse {
  templates: DeckTemplate[];
}

export async function getDeckTemplates(): Promise<DeckTemplate[]> {
  const res = await fetchService<DeckTemplatesResponse>('/deck/templates');
  return res?.templates ?? [];
}

// --- Recent Apps ---

export interface RecentApp {
  processKey: string;
  name: string;
  pid?: number;
  exePath?: string;
  /** GET /shortcuts id, resolved server-side by process name. */
  shortcutId?: string;
  lastFocusedUtcMs: number;
}

export interface RecentAppsResponse {
  apps: RecentApp[];
  excluded: string[];
  focusedProcessKey?: string;
}

export async function getRecentApps(): Promise<RecentAppsResponse> {
  const res = await fetchService<RecentAppsResponse>('/deck/recent-apps');
  return res ?? { apps: [], excluded: [] };
}

/** Whole-list replace, same discipline as saveLightingGroups. */
export const setRecentAppsExcluded = (processKeys: string[]) =>
  putService('/deck/recent-apps/excluded', { processKeys });

export const clearRecentApps = () =>
  deleteService('/deck/recent-apps');

/** Switches to the app if it has a live window, launches it otherwise. */
export const activateRecentApp = (processKey: string) =>
  postService('/deck/recent-apps/activate', { processKey });
