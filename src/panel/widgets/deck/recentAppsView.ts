// Pure ordering/pagination for Recent Apps mode - web counterpart of the
// service's BuildRecentAppsView; both sides load recentAppsView.vectors.json.
import type { RecentApp } from '../../../api/deck';

export interface RecentAppKey {
  kind: 'app';
  processKey: string;
  name: string;
  shortcutId?: string;
  exePath?: string;
  focused: boolean;
}

export interface RecentNavNextKey {
  kind: 'navNext';
}

export interface RecentNavPrevKey {
  kind: 'navPrev';
}

/** Both nav-key shapes, for callers that don't need to discriminate direction. */
export type RecentNavKey = RecentNavNextKey | RecentNavPrevKey;

export interface RecentBlankKey {
  kind: 'blank';
}

// Each variant flattened at the top level (not nested inside RecentNavKey) so
// a `key.kind === 'navNext'` check narrows the whole union - TS does not
// split a member whose own discriminant property is itself a multi-value
// union when narrowing the outer union.
export type RecentAppsViewKey = RecentAppKey | RecentNavNextKey | RecentNavPrevKey | RecentBlankKey;

/** One page's keys, in grid order (index 0 = top-left). */
export type RecentAppsViewPage = RecentAppsViewKey[];

const NAV_NEXT: RecentNavNextKey = { kind: 'navNext' };
const NAV_PREV: RecentNavPrevKey = { kind: 'navPrev' };
const BLANK: RecentBlankKey = { kind: 'blank' };

/** Pages beyond this are dropped, same as the service's ring view. */
export const RECENT_APPS_MAX_PAGES = 4;

function padKeys(keys: readonly RecentAppsViewKey[], count: number): RecentAppsViewKey[] {
  const out = keys.slice(0, count);
  while (out.length < count) out.push(BLANK);
  return out;
}

function toKey(app: RecentApp, focused: boolean): RecentAppKey {
  return {
    kind: 'app',
    processKey: app.processKey,
    name: app.name,
    shortcutId: app.shortcutId,
    exePath: app.exePath,
    focused,
  };
}

function focusedFirst(ring: readonly RecentApp[], focusedProcessKey: string | null | undefined): RecentApp[] {
  const focusedApp = focusedProcessKey ? ring.find(a => a.processKey === focusedProcessKey) : undefined;
  const rest = ring.filter(a => a !== focusedApp);
  return focusedApp ? [focusedApp, ...rest] : rest;
}

/**
 * The stateless layout: the focused app first (selected treatment), then the
 * rest in MRU order, paginated by paginateRecentApps. `ring` is assumed
 * already excluded-filtered (BuildRecentAppsView never filters exclusions
 * itself). A focused process absent from the ring (excluded, or not seen
 * yet) renders with no key marked focused. A viewer that keeps its own order
 * uses stableRecentAppsOrder + paginateRecentApps instead.
 */
export function buildRecentAppsView(
  ring: readonly RecentApp[],
  focusedProcessKey: string | null | undefined,
  cols: number,
  rows: number,
): RecentAppsViewPage[] {
  return paginateRecentApps(focusedFirst(ring, focusedProcessKey), focusedProcessKey, cols, rows);
}

/**
 * One viewer's display order, kept stable across focus changes (service
 * counterpart: RecentAppsTracker.StableOrder, same vectors): an app already
 * visible on the viewer's current page only gets the focused treatment; a
 * newly seen app, or one on a page the viewer is not showing, moves to the
 * front. `previousOrder` is the viewer's last result (null on first build,
 * which is buildRecentAppsView's focused-first order) and `previousFocused`
 * the focus it was built for - the visibility rule runs only when the focus
 * changed, so a page turn never shuffles the page just left. Ring entries
 * the previous order lacks join at the front in ring order; entries gone
 * from the ring drop out. Same inputs give the same order.
 */
export function stableRecentAppsOrder(
  ring: readonly RecentApp[],
  previousOrder: readonly string[] | null,
  previousFocused: string | null | undefined,
  focusedProcessKey: string | null | undefined,
  cols: number,
  rows: number,
  currentPage: number,
): RecentApp[] {
  if (previousOrder === null) return focusedFirst(ring, focusedProcessKey);
  const byKey = new Map(ring.map(a => [a.processKey, a] as const));
  const seen = new Set<string>();
  const kept: RecentApp[] = [];
  for (const key of previousOrder) {
    const app = byKey.get(key);
    if (app && !seen.has(key)) { seen.add(key); kept.push(app); }
  }
  const ordered = [...ring.filter(a => !seen.has(a.processKey)), ...kept];

  if (!focusedProcessKey || focusedProcessKey === previousFocused || !byKey.has(focusedProcessKey)) return ordered;
  const pages = paginateRecentApps(ordered, focusedProcessKey, cols, rows);
  const page = Math.min(Math.max(currentPage, 0), Math.max(pages.length - 1, 0));
  if (pages[page]?.some(k => k.kind === 'app' && k.processKey === focusedProcessKey)) return ordered;
  const focusedApp = byKey.get(focusedProcessKey)!;
  return [focusedApp, ...ordered.filter(a => a !== focusedApp)];
}

/**
 * Lays an already-ordered list onto a cols x rows grid, marking the focused
 * entry: unpaged if it fits, else chunked into pages with synthesized
 * navNext/navPrev keys (mirrors deckLayout.ts's fitPage), capped at
 * RECENT_APPS_MAX_PAGES; entries beyond the cap are dropped.
 */
export function paginateRecentApps(
  ordered: readonly RecentApp[],
  focusedProcessKey: string | null | undefined,
  cols: number,
  rows: number,
): RecentAppsViewPage[] {
  const keyCount = cols * rows;
  if (keyCount <= 0) return [[]];

  const entries = ordered.map(a => toKey(a, !!focusedProcessKey && a.processKey === focusedProcessKey));

  if (entries.length <= keyCount || keyCount < 3) {
    return [padKeys(entries, keyCount)];
  }

  const pages: RecentAppsViewPage[] = [[...entries.slice(0, keyCount - 1), NAV_NEXT]];
  let idx = keyCount - 1;
  while (idx < entries.length && pages.length < RECENT_APPS_MAX_PAGES) {
    const remaining = entries.length - idx;
    const isFinalAllowedPage = pages.length === RECENT_APPS_MAX_PAGES - 1;
    if (remaining <= keyCount - 1 || isFinalAllowedPage) {
      const chunk = entries.slice(idx, idx + (keyCount - 1));
      pages.push(padKeys([NAV_PREV, ...chunk], keyCount));
      idx += chunk.length;
    } else {
      const chunk = entries.slice(idx, idx + (keyCount - 2));
      pages.push([NAV_PREV, ...chunk, NAV_NEXT]);
      idx += chunk.length;
    }
  }
  return pages;
}
