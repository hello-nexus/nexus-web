// Client for the host-wide deck routes (nexus-service's src/Routes/DeckRoutes.cs).
// Every route here is .LocalhostOnly() except the instance routes, which are
// AllowPanel (a paired panel presses/reads its own instance; DeckLayoutPolicy
// still gates privileged key authoring).
import { fetchService, postService, putService, deleteService } from './service';
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

export async function getDeckInstance(id: string): Promise<DeckInstance | null> {
  const res = await fetchService<DeckInstanceResponse>(`/deck/instances/${encodeURIComponent(id)}`);
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
