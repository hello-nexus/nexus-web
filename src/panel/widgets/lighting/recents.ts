export const RECENTS_CAP = 16;

/** Moves `item` to the front, dropping an earlier copy (case-insensitive) and anything past the cap. */
export function pushRecent(list: readonly string[], item: string, cap = RECENTS_CAP): string[] {
  const key = item.toLowerCase();
  return [item, ...list.filter(x => x.toLowerCase() !== key)].slice(0, cap);
}

const TAGGED = /^(.+)@(\d+)$/;

/** An animation recent: the effect and the preset slot picked, or null for an older bare key (the effect's current preset). */
export interface RecentAnimation { effect: string; slot: number | null }

/** The stored key: "<effect>@<slot>", slot being the 0-based preset index. */
export function animationRecentKey(effect: string, slot: number): string {
  return `${effect}@${slot}`;
}

export function parseAnimationRecent(key: string): RecentAnimation {
  const m = TAGGED.exec(key);
  return m ? { effect: m[1], slot: Number(m[2]) } : { effect: key, slot: null };
}

/**
 * Moves the (effect, slot) pick to the front. The same effect at another preset is its own entry;
 * a bare older entry for the effect is dropped, since the tagged one now stands for it.
 */
export function pushRecentAnimation(list: readonly string[], effect: string, slot: number, cap = RECENTS_CAP): string[] {
  const fx = effect.toLowerCase();
  const kept = list.filter(x => {
    const p = parseAnimationRecent(x);
    return !(p.effect.toLowerCase() === fx && (p.slot === null || p.slot === slot));
  });
  return [animationRecentKey(effect, slot), ...kept].slice(0, cap);
}
