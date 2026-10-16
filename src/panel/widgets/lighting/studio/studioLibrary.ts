import { useMemo } from 'react';
import { invalidateShaderSource } from '../../../../api/lighting';
import {
  customEffectKey, deleteCustomEffect, getCustomEffects, putCustomEffect, refreshCustomEffects, useCustomEffects,
  type CustomEffectEntry,
} from '../../../../api/customEffects';
import { isSensorBinding } from '../../../../lib/sensorBinding';
import { STUDIO_COST_BUDGET, STUDIO_STAGES, STUDIO_STAGE_LIMIT, studioBlock } from './studioBlocks';
import {
  MOD_GATE, MOD_RATE, STUDIO_MOD_SOURCES, blockParams, compileStudio, isMusicSource, isSensorSource, recipeCost, stageCount,
  type StudioBlock, type StudioMod, type StudioRecipe,
} from './studioCompiler';

// Where the prototype kept effects before the service stored them; migrated once, then removed.
const LEGACY_KEY = 'nexus.studio.saved';

export interface SavedEffect {
  id: string;
  name: string;
  recipe: StudioRecipe;
  updatedAt: number;
  marketId: string | null;
  marketAuthor: string | null;
  downloaded: boolean | null;
}

const isNum = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n);
const isObj = (o: unknown): o is Record<string, unknown> => !!o && typeof o === 'object' && !Array.isArray(o);

// The same rules the Marketplace API applies: a rate only on a wave, a gate only on music,
// a sensor binding only on (and required by) the sensor source.
function isMod(m: StudioMod): boolean {
  if (!isObj(m) || !STUDIO_MOD_SOURCES.includes(m.source) || !isNum(m.amount)) return false;
  if (isSensorSource(m.source)) return m.rate === undefined && m.gate === undefined && isSensorBinding(m.sensor);
  if (m.sensor !== undefined) return false;
  const music = isMusicSource(m.source);
  if (m.rate !== undefined && (music || !isNum(m.rate) || m.rate < MOD_RATE.min || m.rate > MOD_RATE.max)) return false;
  return m.gate === undefined || (music && isNum(m.gate) && m.gate >= MOD_GATE.min && m.gate <= MOD_GATE.max);
}

function isBlock(b: StudioBlock | null | undefined): boolean {
  if (!b || typeof b.uid !== 'string' || !studioBlock(b.type) || !isObj(b.params)) return false;
  if (!Object.values(b.params).every(isNum)) return false;
  if (b.mods !== undefined && !(isObj(b.mods) && Object.values(b.mods).every(isMod))) return false;
  return b.colors === undefined || (isObj(b.colors) && Object.values(b.colors).every(c => Array.isArray(c) && c.length === 3 && c.every(isNum)));
}

export function isRecipe(x: unknown): x is StudioRecipe {
  if (!isObj(x)) return false;
  const r = x as unknown as StudioRecipe;
  if (r.v !== 1 || !Array.isArray(r.blocks) || !r.blocks.every(isBlock)) return false;
  if (![r.speed, r.hue, r.saturation, r.contrast].every(isNum)) return false;
  if (r.knobs !== undefined && !(Array.isArray(r.knobs) && r.knobs.every(k => isObj(k) && typeof k.uid === 'string' && typeof k.key === 'string'))) return false;
  return stageCount(r, 'pattern') >= 1 && stageCount(r, 'color') === 1;
}

const MARKET_BLOCK_LIMIT = 16;

/**
 * A recipe from another account, or null when this build cannot run it as
 * the Studio would build it: unknown blocks, stage limits, the cost budget.
 * Base adjustments are clamped to the Studio's slider ranges, and knobs naming
 * no param are dropped so the effect controls list real sliders.
 */
export function parseMarketRecipe(x: unknown): StudioRecipe | null {
  if (!isRecipe(x) || x.blocks.length > MARKET_BLOCK_LIMIT) return null;
  if (new Set(x.blocks.map(b => b.uid)).size !== x.blocks.length) return null;
  if (recipeCost(x) > STUDIO_COST_BUDGET || STUDIO_STAGES.some(s => stageCount(x, s) > STUDIO_STAGE_LIMIT[s])) return null;
  const keys = new Map(x.blocks.map(b => {
    const def = studioBlock(b.type)!;
    return [b.uid, new Set([...blockParams(def, true), ...blockParams(def, false)].map(p => p.key))];
  }));
  const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));
  return {
    ...x,
    speed: clamp(x.speed, -100, 100),
    hue: clamp(x.hue, 0, 1),
    saturation: clamp(x.saturation, 0, 2),
    contrast: clamp(x.contrast, 0, 2),
    knobs: x.knobs?.filter(k => keys.get(k.uid)?.has(k.key)),
  };
}

// Parsed per entry object, so an unchanged entry keeps its SavedEffect identity.
const parsed = new WeakMap<CustomEffectEntry, SavedEffect | null>();

function toSaved(entry: CustomEffectEntry): SavedEffect | null {
  if (parsed.has(entry)) return parsed.get(entry)!;
  let recipe: unknown = null;
  try {
    recipe = JSON.parse(entry.recipe);
  } catch {
    /* unreadable: skipped */
  }
  const saved = isRecipe(recipe)
    ? { id: entry.id, name: entry.name, recipe, updatedAt: entry.updatedAt, marketId: entry.marketId ?? null, marketAuthor: entry.marketAuthor ?? null, downloaded: entry.downloaded ?? null }
    : null;
  parsed.set(entry, saved);
  return saved;
}

const parseAll = (list: CustomEffectEntry[]) => list.map(toSaved).filter((s): s is SavedEffect => !!s);

export function getSavedEffects(): SavedEffect[] {
  return parseAll(getCustomEffects());
}

export function useSavedEffects(): SavedEffect[] {
  const list = useCustomEffects();
  return useMemo(() => parseAll(list), [list]);
}

export const newEffectId = () => `fx${Date.now().toString(36)}`;

/** A Marketplace download; effects saved before the service recorded `downloaded` compare the listing author with `username`. */
export function isDownloaded(s: SavedEffect, username: string | null | undefined): boolean {
  return s.downloaded ?? (!!s.marketId && s.marketAuthor?.toLowerCase() !== username?.toLowerCase());
}

/** A copy of someone else's listing. Without a recorded flag it takes a signed-in account to tell one from your own listing. */
export function isMarketCopy(s: SavedEffect, username: string | null | undefined): boolean {
  if (!s.marketId) return false;
  return s.downloaded ?? (!!username && isDownloaded(s, username));
}

/** The longest effect name the service stores. */
export const EFFECT_NAME_MAX = 40;

/** `base`, or with the lowest number after it that no name in `taken` uses, so copies stay tellable apart; never past the name cap. */
export function copyName(base: string, taken: readonly string[]): string {
  const used = new Set(taken.map(n => n.toLocaleLowerCase()));
  const fit = (suffix: string) => {
    let head = base.slice(0, EFFECT_NAME_MAX - suffix.length);
    // Never end on half of a surrogate pair (an emoji cut in two).
    if (/[\uD800-\uDBFF]$/.test(head)) head = head.slice(0, -1);
    return `${head.trimEnd()}${suffix}`;
  };
  if (!used.has(fit('').toLocaleLowerCase())) return fit('');
  for (let n = 2; ; n++) {
    const name = fit(` ${n}`);
    if (!used.has(name.toLocaleLowerCase())) return name;
  }
}

/** The most recently created of the user's own effects (any effect when there are none): a newEffectId's base36 suffix is its creation time. */
export function lastCreatedEffect(list: SavedEffect[], username: string | null | undefined): SavedEffect | undefined {
  const createdAt = (id: string) => (/^fx[0-9a-z]+$/.test(id) ? parseInt(id.slice(2), 36) : 0);
  const own = list.filter(s => !isDownloaded(s, username));
  return (own.length ? own : list)
    .reduce<SavedEffect | undefined>((best, s) => (!best || createdAt(s.id) >= createdAt(best.id) ? s : best), undefined);
}

export interface MarketLink {
  marketId: string;
  marketAuthor: string;
  /** Installed from the Marketplace (true) or published from this account (false). */
  downloaded?: boolean;
}

/** Stores the recipe with its baked shader; resolves to the service's error text when it rejects the shader. */
export async function saveEffect(id: string, name: string, recipe: StudioRecipe, link?: MarketLink): Promise<string | null> {
  const frag = compileStudio(recipe, { bake: true }).frag;
  const result = await putCustomEffect(id, { name, recipe: JSON.stringify(recipe), frag, ...link });
  if ('error' in result) return result.error;
  invalidateShaderSource(customEffectKey(id));
  return null;
}

/** Drops an effect's Marketplace link (its listing was removed); its look is unchanged. An empty marketId clears the link. */
export async function unlinkEffect(effect: SavedEffect): Promise<string | null> {
  const frag = compileStudio(effect.recipe, { bake: true }).frag;
  const result = await putCustomEffect(effect.id, { name: effect.name, recipe: JSON.stringify(effect.recipe), frag, marketId: '' });
  if ('error' in result) return result.error;
  invalidateShaderSource(customEffectKey(effect.id));
  return null;
}

export async function deleteEffect(id: string): Promise<boolean> {
  const ok = await deleteCustomEffect(id);
  if (ok) invalidateShaderSource(customEffectKey(id));
  return ok;
}

let migrated = false;

/** Moves effects saved in browser storage by the earlier prototype into the service, once per page load. */
export async function migrateLegacyEffects(): Promise<void> {
  if (migrated) return;
  migrated = true;
  let legacy: unknown;
  try {
    legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? 'null');
  } catch {
    return;
  }
  if (!Array.isArray(legacy) || legacy.length === 0) return;
  await refreshCustomEffects();
  const existing = new Set(getCustomEffects().map(e => e.id));
  // Only failed items stay behind, so an effect deleted after it migrated never comes back.
  const failed: unknown[] = [];
  for (const item of legacy) {
    if (!isObj(item) || typeof item.id !== 'string' || typeof item.name !== 'string' || !isRecipe(item.recipe)) continue;
    if (existing.has(item.id)) continue;
    if (await saveEffect(item.id, item.name, item.recipe)) failed.push(item);
  }
  try {
    if (failed.length) localStorage.setItem(LEGACY_KEY, JSON.stringify(failed));
    else localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* storage unavailable */
  }
}
