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

/**
 * Orders the host's recent-apps ring for display and paginates it to a
 * cols x rows grid: the focused app first (selected treatment), then the
 * rest in MRU order, unpaged if it fits. `ring` is assumed already excluded-
 * filtered (BuildRecentAppsView never filters exclusions itself). Overflow
 * chunks into pages with synthesized navNext/navPrev keys (mirrors
 * deckLayout.ts's fitPage), capped at RECENT_APPS_MAX_PAGES; entries beyond
 * the cap are dropped. A focused process absent from the ring (excluded, or
 * not seen yet) renders with no key marked focused.
 */
export function buildRecentAppsView(
  ring: readonly RecentApp[],
  focusedProcessKey: string | null | undefined,
  cols: number,
  rows: number,
): RecentAppsViewPage[] {
  const keyCount = cols * rows;
  if (keyCount <= 0) return [[]];

  const focusedApp = focusedProcessKey ? ring.find(a => a.processKey === focusedProcessKey) : undefined;
  const rest = ring.filter(a => a !== focusedApp);
  const ordered = focusedApp ? [focusedApp, ...rest] : rest;
  const entries = ordered.map(a => toKey(a, a === focusedApp));

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
