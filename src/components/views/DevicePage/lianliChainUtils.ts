// Pure helpers for the Lighting tab's chain list, free of React so they are unit-testable.

import type { LianLiWirelessChainLighting, LianLiWirelessChainPatch } from '../../../api/lianli-wireless';

/** Applies a patch to a chain locally; a zone patch merges into the zone with the same id. */
export function applyChainPatch(chain: LianLiWirelessChainLighting, patch: LianLiWirelessChainPatch): LianLiWirelessChainLighting {
  const { zones, ...rest } = patch;
  const next = { ...chain, ...rest };
  if (zones && chain.zones) {
    next.zones = chain.zones.map(z => {
      const change = zones.find(p => p.id === z.id);
      return change ? { ...z, ...change } : z;
    });
  }
  return next;
}

/** Chains in light-sequence order; equal sequence numbers fall back to the MAC, as the service orders them. */
export function sortBySequence(chains: readonly LianLiWirelessChainLighting[]): LianLiWirelessChainLighting[] {
  return chains
    .map((chain, index) => ({ chain, index }))
    .sort((a, b) => (a.chain.sortIndex ?? 0) - (b.chain.sortIndex ?? 0)
      || (a.chain.mac < b.chain.mac ? -1 : a.chain.mac > b.chain.mac ? 1 : 0)
      || a.index - b.index)
    .map(x => x.chain);
}

const NON_EFFECT_MODES = ['custom', 'perZone', 'perLane'];

/** The chain plays an effect that has a merged variant, so its Merge switch can take effect. */
export function canMerge(chain: LianLiWirelessChainLighting): boolean {
  if (NON_EFFECT_MODES.includes(chain.mode)) return false;
  return chain.modes.some(e => e.key === chain.mode && e.mergeable === true);
}

/**
 * MAC of the unit that sets the look of a merged group: the first unit in sequence order with
 * merge on and an effect that can merge. Null when no unit qualifies.
 */
export function mergeLeaderMac(chains: readonly LianLiWirelessChainLighting[]): string | null {
  return sortBySequence(chains).find(c => c.merge === true && canMerge(c))?.mac ?? null;
}

/**
 * Moves one chain a step along the light sequence. Returns the sort index each
 * changed chain must be saved with; every chain is renumbered by position, so
 * units that all start at the same index still end up distinct.
 */
export function moveInSequence(
  chains: readonly LianLiWirelessChainLighting[],
  mac: string,
  delta: -1 | 1,
): { mac: string; sortIndex: number }[] {
  const ordered = sortBySequence(chains);
  const from = ordered.findIndex(c => c.mac === mac);
  const to = from + delta;
  if (from < 0 || to < 0 || to >= ordered.length) return [];
  const next = [...ordered];
  [next[from], next[to]] = [next[to], next[from]];
  return next
    .map((c, sortIndex) => ({ mac: c.mac, sortIndex, changed: c.sortIndex !== sortIndex }))
    .filter(x => x.changed)
    .map(({ mac: m, sortIndex }) => ({ mac: m, sortIndex }));
}

/** A patch that can change which unit leads a merged group, so a leader named by an earlier read may be stale. */
export function patchAffectsLeader(patch: LianLiWirelessChainPatch): boolean {
  return patch.merge !== undefined || patch.mode !== undefined || patch.sortIndex !== undefined;
}

/** Numbers repeated titles in order ("TL Flex", "TL Flex 2"); a title used once is unchanged. */
export function numberDuplicateTitles(titles: readonly string[]): string[] {
  const total = new Map<string, number>();
  for (const title of titles) total.set(title, (total.get(title) ?? 0) + 1);
  const seen = new Map<string, number>();
  return titles.map(title => {
    const n = (seen.get(title) ?? 0) + 1;
    seen.set(title, n);
    return (total.get(title) ?? 0) > 1 && n > 1 ? `${title} ${n}` : title;
  });
}
