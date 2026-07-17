// A small client-side cache for GET /monitoring/history responses, keyed by
// the exact request shape (series/maxPoints/from/to) - see useMetricHistory's
// scrub-latency handling. Scrubbing the seek bar commonly revisits a window
// the user was just at (drag back and forth) or a neighbor the idle-prefetch
// warmed - an exact-key hit serves an instant interim render while the
// authoritative fetch (always still issued - this never replaces a request,
// only fills the gap before it resolves) is in flight. A miss can still
// help: any cached entry for the same series/maxPoints whose own [from,to]
// overlaps the requested window supplies an approximate interim render
// instead of the chart going blank or freezing on a stale, wrongly-scoped
// window.

import type { MetricHistoryResponse } from '../api/monitoringHistory';

export interface CacheEntry {
  from: number;
  to: number;
  maxPoints: number;
  series: string;
  data: MetricHistoryResponse;
  /** A monotonic insertion counter, not a wall-clock timestamp - two `set`
   *  calls in the same millisecond must still order deterministically for
   *  findOverlapping's "most recent" pick. */
  storedAt: number;
}

// Bounds memory for a long-lived session - old entries fall off in
// insertion/re-insertion order (a coarse recency approximation, not a
// strict LRU) once the cache exceeds this size.
const MAX_ENTRIES = 24;

function keyOf(from: number, to: number, maxPoints: number, series: string): string {
  return `${series}|${maxPoints}|${from}|${to}`;
}

export class MonitoringHistoryCache {
  private entries = new Map<string, CacheEntry>();
  private insertionCounter = 0;

  get(from: number, to: number, maxPoints: number, series: string): CacheEntry | null {
    return this.entries.get(keyOf(from, to, maxPoints, series)) ?? null;
  }

  /** The most recently stored entry (any maxPoints) for `series` whose own
   *  window overlaps [from, to) - used to synthesize an interim render for a
   *  window that's never been fetched at this exact shape before. */
  findOverlapping(from: number, to: number, series: string): CacheEntry | null {
    let best: CacheEntry | null = null;
    for (const entry of this.entries.values()) {
      if (entry.series !== series) continue;
      if (entry.to <= from || entry.from >= to) continue;
      if (!best || entry.storedAt > best.storedAt) best = entry;
    }
    return best;
  }

  set(from: number, to: number, maxPoints: number, series: string, data: MetricHistoryResponse): void {
    const key = keyOf(from, to, maxPoints, series);
    this.entries.delete(key);
    this.entries.set(key, { from, to, maxPoints, series, data, storedAt: ++this.insertionCounter });
    while (this.entries.size > MAX_ENTRIES) {
      const oldestKey = this.entries.keys().next().value;
      if (oldestKey === undefined) break;
      this.entries.delete(oldestKey);
    }
  }
}

/** Filters a cached response's series down to the points falling within
 *  [from, to] - the interim render shown while the authoritative fetch for
 *  the exact requested window is still in flight. */
export function sliceToWindow(data: MetricHistoryResponse, from: number, to: number): MetricHistoryResponse {
  return {
    ...data,
    series: data.series.map(s => ({ ...s, points: s.points.filter(p => p.t >= from && p.t <= to) })),
  };
}
