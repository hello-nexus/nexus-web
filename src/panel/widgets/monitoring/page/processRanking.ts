// Pure ranking-stability core for ProcessListSection, kept side-effect-free
// (no React) so it's covered directly by processRanking.test.ts. Two
// problems, one mechanism: (1) rows must never visibly reorder just because
// a value changed - only a real "meaningful change" (sort mode, metric,
// window, or data-source swap) re-ranks from scratch; (2) the service's
// top-N-by-usage feed can drop a borderline app for a single tick and
// re-report it the next - that membership churn must not read as the row
// disappearing and reappearing either. Both are solved by keeping a stable
// order of "anchors" that only ever gains newly-sorted insertions or loses
// entries whose grace window truly expired, and never otherwise reshuffles.

export interface RankableItem {
  name: string;
  current: number;
  startedAtMs?: number;
}

export type SortMode = 'recent' | 'usage' | 'name';

/** Total order for the process list's sort modes. 'recent' ranks by
 *  startedAtMs (most recently launched first); a pair where either side
 *  lacks it falls back to the usage comparison, so a source that doesn't
 *  report launch times (or a fallback-sourced row) falls back to the usage
 *  order instead of a broken partial sort. */
export function compareItems(a: RankableItem, b: RankableItem, sort: SortMode): number {
  if (sort === 'name') return a.name.localeCompare(b.name);
  if (sort === 'recent') {
    if (a.startedAtMs !== undefined && b.startedAtMs !== undefined) return b.startedAtMs - a.startedAtMs;
    if (a.startedAtMs !== undefined) return -1;
    if (b.startedAtMs !== undefined) return 1;
  }
  return b.current - a.current;
}

interface TrackedEntry<T> {
  item: T;
  /** The revision at which this entry was last actually present in an
   *  incoming items array - NOT bumped while it survives on borrowed time
   *  within the grace window, so a second consecutive miss is judged
   *  against its true last sighting, not the previous grace check. */
  lastSeenAt: number;
}

export interface RankState<T extends RankableItem> {
  order: readonly string[];
  tracked: ReadonlyMap<string, TrackedEntry<T>>;
}

export function initRankState<T extends RankableItem>(): RankState<T> {
  return { order: [], tracked: new Map() };
}

export interface UpdateRankingOptions {
  /** An item missing from `items` is retained (frozen at its last known
   *  values) until this many revisions pass since it was last actually
   *  seen. `now` is a monotonically increasing counter the caller bumps once
   *  per real data update (not per render), so this is expressed in
   *  "number of consecutive missed updates" units regardless of the
   *  source's real-world polling cadence. */
  graceRevisions: number;
  /** Discards every retained/grace-held entry and re-sorts everything from
   *  scratch - set on a sort-mode change, a metric switch, or a data-source
   *  swap (fallback <-> window-scoped apps), where the prior order no
   *  longer means anything. */
  forceReset: boolean;
}

/**
 * Reconciles `state` against a fresh `items` snapshot. Existing rows never
 * move relative to each other from a value update alone; a row missing from
 * `items` this round is retained (unchanged) while it's within its grace
 * window, and dropped once the window truly expires. Rows not previously
 * tracked are sorted among themselves and merge-inserted into the preserved
 * order at their correct position, without disturbing any existing row's
 * placement.
 * `forceReset` bypasses all of the above for a full fresh sort.
 */
export function updateRanking<T extends RankableItem>(
  state: RankState<T>,
  items: readonly T[],
  now: number,
  sort: SortMode,
  opts: UpdateRankingOptions,
): RankState<T> {
  const incoming = new Map(items.map(i => [i.name, i] as const));
  const priorTracked = opts.forceReset ? new Map<string, TrackedEntry<T>>() : state.tracked;
  const priorOrder = opts.forceReset ? [] : state.order;

  const tracked = new Map<string, TrackedEntry<T>>();
  const anchors: string[] = [];
  for (const name of priorOrder) {
    const prior = priorTracked.get(name);
    if (!prior) continue;
    const current = incoming.get(name);
    if (current) {
      tracked.set(name, { item: current, lastSeenAt: now });
      anchors.push(name);
    } else if (now - prior.lastSeenAt < opts.graceRevisions) {
      tracked.set(name, prior);
      anchors.push(name);
    }
    // Grace expired - the entry is dropped (absent from tracked/anchors).
  }

  const anchorSet = new Set(anchors);
  const fresh = items.filter(i => !anchorSet.has(i.name)).sort((a, b) => compareItems(a, b, sort));
  for (const item of fresh) tracked.set(item.name, { item, lastSeenAt: now });

  const order: string[] = [];
  let ai = 0;
  let fi = 0;
  while (ai < anchors.length && fi < fresh.length) {
    const anchorItem = tracked.get(anchors[ai])!.item;
    if (compareItems(fresh[fi], anchorItem, sort) < 0) {
      order.push(fresh[fi].name);
      fi++;
    } else {
      order.push(anchors[ai]);
      ai++;
    }
  }
  while (ai < anchors.length) order.push(anchors[ai++]);
  while (fi < fresh.length) order.push(fresh[fi++].name);

  return { order, tracked };
}

/** Projects a RankState back onto the ordered item list for rendering. */
export function renderedItems<T extends RankableItem>(state: RankState<T>): T[] {
  return state.order.map(name => state.tracked.get(name)!.item);
}
