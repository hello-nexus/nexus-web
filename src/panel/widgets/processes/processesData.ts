// Data + sorting core for the process-list widget, kept free of React
// rendering so processesData.test.ts covers it directly.
//
// Everything here rides the existing monitoring path: rows come from
// monitoringStore's `monitoring` frame (the same store the Monitoring page's
// process list reads), GPU numbers from the `gpu-processes` topic, and the
// comparator from page/processRanking. Nothing polls, and no new socket topic
// is introduced.

import type { SortMode } from '../monitoring/page/processRanking';

// Column order is the render order: icon+name, then the metric columns.
export const PROCESS_COLUMNS = ['name', 'cpu', 'gpu', 'ram'] as const;
export type ProcessColumn = typeof PROCESS_COLUMNS[number];
export type SortDirection = 'asc' | 'desc';

/** One process aggregated by name - the same aggregation key the monitoring
 *  page uses, so a multi-process app (browser, IDE) is one row. */
export interface ProcessRow {
  name: string;
  cpu: number;
  memMb: number;
  /** Summed across adapters, 0..100. Undefined where the platform reports no
   *  per-process GPU at all (everything except Windows - see the manifest). */
  gpu?: number;
  /** Combined disk read+write, bytes/sec. Undefined on a service too old to
   *  put it on the wire. */
  io?: number;
}

// Refresh cadence the settings sheet offers, in seconds. The wire is a fixed
// 1 Hz broadcast shared by every consumer, so these only slow this widget's
// own redraw down from that.
export const REFRESH_SECONDS = [1, 2, 3, 4, 5] as const;
export const DEFAULT_REFRESH_SECONDS = 1;

export function resolveRefreshSeconds(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return (REFRESH_SECONDS as readonly number[]).includes(n) ? n : DEFAULT_REFRESH_SECONDS;
}

// Which column a freshly-rendered list ranks by. Not persisted: the header
// press is a run-mode interaction and onUpdate is only wired while editing.
export const DEFAULT_COLUMN: ProcessColumn = 'cpu';

/**
 * Maps a column onto one of processRanking's sort modes. 'usage' compares
 * RankableItem.current, so the caller stamps the active column's value there
 * (see rankableFor) instead of this needing per-column comparators of its own.
 * processRanking's third mode, 'recent', has no column here - the list shows
 * no launch-time figure to sort by.
 */
export function sortModeForColumn(column: ProcessColumn): SortMode {
  return column === 'name' ? 'name' : 'usage';
}

/** The direction each column ranks in before the user flips it: metrics lead
 *  with the biggest, names with A-Z. */
export function defaultDirectionFor(column: ProcessColumn): SortDirection {
  return column === 'name' ? 'asc' : 'desc';
}

export function valueForColumn(row: ProcessRow, column: ProcessColumn): number {
  switch (column) {
    case 'cpu': return row.cpu;
    case 'ram': return row.memMb;
    case 'gpu': return row.gpu ?? 0;
    // 'name' ranks through its own sort mode, not a numeric value.
    default: return 0;
  }
}

/** RankableItem view of a row for the active column: `current` carries the
 *  column's own value so compareItems' 'usage' branch sorts by it. */
export interface RankableProcessRow extends ProcessRow {
  current: number;
}

export function rankableFor(rows: readonly ProcessRow[], column: ProcessColumn): RankableProcessRow[] {
  return rows.map(row => ({ ...row, current: valueForColumn(row, column) }));
}
