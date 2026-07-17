import { useState } from 'react';
import {
  initRankState,
  renderedItems,
  updateRanking,
  type RankableItem,
  type RankState,
  type SortMode,
} from './processRanking';

// An entry missing from `items` survives this many consecutive updates
// before it's dropped - enough to ride out a single borderline drop from the
// service's top-N-by-usage feed (and a bit of jitter) without the row
// visibly flickering out and back in.
const GRACE_REVISIONS = 3;

interface StableRankingState<T extends RankableItem> {
  rank: RankState<T>;
  items: readonly T[];
  sort: SortMode;
  resetKey: string;
  revision: number;
}

function computeInitial<T extends RankableItem>(items: readonly T[], sort: SortMode, resetKey: string): StableRankingState<T> {
  return {
    rank: updateRanking(initRankState<T>(), items, 0, sort, { graceRevisions: GRACE_REVISIONS, forceReset: true }),
    items,
    sort,
    resetKey,
    revision: 0,
  };
}

/**
 * Wraps processRanking's pure reconciliation in React state, following the
 * "adjust state during render" pattern (comparing the incoming props against
 * the previous render's own state) rather than an effect, so the ranked
 * order is available in the SAME render as the data that produced it - no
 * one-render lag showing a stale order.
 *
 * `items` changing (by reference) bumps the revision counter that grace
 * windows are measured in - not real time, since different item sources
 * update at different cadences and a logical "number of misses" is what the
 * grace window actually needs to survive. `sort` or `resetKey` changing
 * forces a full re-rank, discarding any grace-held entries.
 */
export function useStableRanking<T extends RankableItem>(items: readonly T[], sort: SortMode, resetKey: string): T[] {
  const [state, setState] = useState<StableRankingState<T>>(() => computeInitial(items, sort, resetKey));

  const itemsChanged = items !== state.items;
  const resetChanged = sort !== state.sort || resetKey !== state.resetKey;

  if (itemsChanged || resetChanged) {
    const revision = itemsChanged ? state.revision + 1 : state.revision;
    const rank = updateRanking(state.rank, items, revision, sort, { graceRevisions: GRACE_REVISIONS, forceReset: resetChanged });
    setState({ rank, items, sort, resetKey, revision });
    return renderedItems(rank);
  }

  return renderedItems(state.rank);
}
