// Custom (Shader Studio) effects stored by the service and run as `custom:<id>` effect keys.

import { useEffect, useSyncExternalStore } from 'react';
import { authFetchWithStatus, deleteService, fetchService } from './service';
import type { EffectDef } from '../types/lighting';

export const CUSTOM_EFFECT_PREFIX = 'custom:';

export const isCustomEffectKey = (key: string | null | undefined): key is `custom:${string}` =>
  !!key && key.startsWith(CUSTOM_EFFECT_PREFIX);

export const customEffectKey = (id: string) => `${CUSTOM_EFFECT_PREFIX}${id}`;

export const customEffectId = (key: string) => key.slice(CUSTOM_EFFECT_PREFIX.length);

export interface CustomEffectEntry {
  id: string;
  name: string;
  /** The studio recipe as JSON; opaque to the service. */
  recipe: string;
  /** Unix ms; also the thumbnail cache version. */
  updatedAt: number;
  audio: boolean;
  /** The Marketplace listing this effect was downloaded from or published as. */
  marketId?: string | null;
  /** That listing's author; equal to the signed-in username when this account published it. */
  marketAuthor?: string | null;
  /** True when installed from the Marketplace; null on effects saved before the service recorded it. */
  downloaded?: boolean | null;
}

let snapshot: CustomEffectEntry[] = [];
let loaded = false;
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function publish(next: CustomEffectEntry[]): void {
  snapshot = next;
  loaded = true;
  listeners.forEach(l => l());
}

export function getCustomEffects(): CustomEffectEntry[] {
  return snapshot;
}

export function customEffectsLoaded(): boolean {
  return loaded;
}

export function refreshCustomEffects(): Promise<void> {
  // An older service answers the unknown route with the SPA page, which fails to parse.
  inflight ??= fetchService<CustomEffectEntry[]>('/lighting/custom-effects')
    .then(list => { if (Array.isArray(list)) publish(list); })
    .catch(() => {})
    .finally(() => { inflight = null; });
  return inflight;
}

/** Saves (creates or replaces) an effect; the service compile-checks `frag` and returns its error text on a reject. */
export async function putCustomEffect(
  id: string,
  // Omitted market fields keep the stored link.
  body: { name: string; recipe: string; frag: string; marketId?: string; marketAuthor?: string; downloaded?: boolean },
): Promise<{ entry: CustomEffectEntry } | { error: string }> {
  const { response, status } = await authFetchWithStatus(`/lighting/custom-effects/${encodeURIComponent(id)}`, { method: 'PUT', body });
  if (!response) return { error: `HTTP ${status || 'unreachable'}` };
  // Rejections use the ApiResponse envelope: `error: true` with the reason in `msg`.
  const json = await response.json().catch(() => null) as (CustomEffectEntry & { error?: unknown; msg?: string }) | null;
  if (!response.ok || !json || json.error) {
    return { error: json?.msg ?? (typeof json?.error === 'string' ? json.error : `HTTP ${status}`) };
  }
  const i = snapshot.findIndex(e => e.id === id);
  publish(i < 0 ? [...snapshot, json] : snapshot.map(e => (e.id === id ? json : e)));
  return { entry: json };
}

/** False when the service did not confirm the delete; the entry then stays listed. */
export async function deleteCustomEffect(id: string): Promise<boolean> {
  const ok = await deleteService(`/lighting/custom-effects/${encodeURIComponent(id)}`).catch(() => null);
  if (!ok) return false;
  publish(snapshot.filter(e => e.id !== id));
  return true;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The service's custom effects, fetched on first use while `enabled`. */
export function useCustomEffects(enabled = true): CustomEffectEntry[] {
  const list = useSyncExternalStore(subscribe, getCustomEffects);
  useEffect(() => { if (enabled && !loaded) void refreshCustomEffects(); }, [enabled]);
  return list;
}

/** The wheel a wheel-colored custom effect opens on (its recipe's hue and range), or null for any other effect. */
export function customEffectWheel(entry: CustomEffectEntry): { hue: number; colorize: number } | null {
  try {
    const r = JSON.parse(entry.recipe) as RecipeShape & { hue?: unknown; colorize?: unknown };
    if (!(r.blocks ?? []).some(b => b.type === 'wheelcolor')) return null;
    const unit = (n: unknown) => (typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0);
    return { hue: unit(r.hue), colorize: unit(r.colorize) };
  } catch {
    return null;
  }
}

interface RecipeShape {
  blocks?: { uid?: unknown; type?: unknown; mods?: Record<string, { source?: unknown }> }[];
  knobs?: { uid?: unknown; key?: unknown }[];
}

/** Block uids the studio compiler names uniforms after (`u_<uid>_<key>`); shared so pins and uniforms agree. */
export const STUDIO_UID_RE = /^[a-z0-9]{1,24}$/;
const KEY_RE = /^[a-z0-9]+$/i;

/**
 * Effect-controls definition for a custom effect: its pinned knobs as params,
 * labeled "<block> - <param>" from the studio's strings. Uniform names follow
 * the studio compiler's `u_<uid>_<key>`.
 */
export function customEffectDef(entry: CustomEffectEntry, t: (key: string) => string): EffectDef {
  let shape: RecipeShape = {};
  try {
    shape = JSON.parse(entry.recipe) as RecipeShape;
  } catch {
    /* unreadable recipe: no knobs */
  }
  const types = new Map((shape.blocks ?? []).map(b => [b.uid, b.type]));
  const params = (shape.knobs ?? [])
    .filter((k): k is { uid: string; key: string } =>
      typeof k.uid === 'string' && STUDIO_UID_RE.test(k.uid) && typeof k.key === 'string' && KEY_RE.test(k.key) && types.has(k.uid))
    .map(k => ({
      name: `u_${k.uid}_${k.key}`,
      label: `${t(`lighting.studio.block.${String(types.get(k.uid))}`)} - ${t(`lighting.studio.param.${k.key}`)}`,
    }));
  // The shader's `_s` uniform for each sensor-driven param, named like its knob.
  const sensors = (shape.blocks ?? []).flatMap(b => (typeof b.uid === 'string' && STUDIO_UID_RE.test(b.uid)
    ? Object.entries(b.mods ?? {})
      .filter(([key, mod]) => KEY_RE.test(key) && mod?.source === 'sensor')
      .map(([key]) => ({
        name: `u_${b.uid as string}_${key}_s`,
        label: `${t(`lighting.studio.block.${String(b.type)}`)} - ${t(`lighting.studio.param.${key}`)}`,
      }))
    : []));
  return { key: customEffectKey(entry.id), labelKey: '', params, sensors, audio: entry.audio };
}
