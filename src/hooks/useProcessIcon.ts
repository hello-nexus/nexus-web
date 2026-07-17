// Process-row icon resolution for the monitoring history process list and
// its hover tooltip (ProcessListSection.ProcessIcon) - GET
// /monitoring/process-icon?name=<processName>, the PRIMARY icon source for a
// running process (AppPicker's useAppIcon reads /shortcuts/icon by targetId,
// which a raw process name essentially never matches - see
// api/processIcon.ts). A module-level cache shared by every mounted
// ProcessIcon instance keeps a resolved object URL (or a negative "no icon"
// result) per name for the whole session: switching tabs, re-ranking, or a
// row simply re-rendering never re-fetches an already-known name. Concurrent
// fetches for NEW (never-seen) names share lib/mediaFetchSlot.ts's pool with
// every other icon/image source (AppPicker, DeckGrid) - one pool, not one
// per call site, so combined in-flight icon fetches across the whole panel
// never exceed the cap.

import { useEffect, useState } from 'react';
import { fetchProcessIcon } from '../api/processIcon';
import { withMediaFetchSlot } from '../lib/mediaFetchSlot';

type ProcessIconMockModule = typeof import('../api/processIconMock');

// Raw build defines (NOT the DEV_TOOLS const re-exported from lib/devTools):
// the transform-time constant fold only eliminates a dynamic import() when
// the guard is this literal expression at the call site - see
// api/monitoringHistory.ts for the same pattern.
const loadProcessIconMock = (import.meta.env.DEV || __DEV_TOOLS__)
  ? (): Promise<ProcessIconMockModule> => import('../api/processIconMock')
  : null;

// name -> resolved object URL. Never revoked: the cache (and the URL it
// hands out) lives for the session, shared across every row/tooltip that
// ever displays this process, not scoped to one component instance.
const resolvedCache = new Map<string, string>();
// Confirmed "no icon for this name" this session - skips re-fetching a 404
// on every re-render/re-mount (a search filter, a re-rank, a tab switch).
const negativeCache = new Set<string>();
const inFlight = new Map<string, Promise<string | null>>();

function resolveIcon(name: string): Promise<string | null> {
  const existing = inFlight.get(name);
  if (existing) return existing;

  const promise = withMediaFetchSlot(async () => {
    let blob = await fetchProcessIcon(name);
    if ((!blob || blob.size === 0) && loadProcessIconMock) {
      const mock = await loadProcessIconMock();
      blob = mock.mockProcessIcon(name);
    }
    if (!blob || blob.size === 0) {
      negativeCache.add(name);
      return null;
    }
    const url = URL.createObjectURL(blob);
    resolvedCache.set(name, url);
    return url;
  }).finally(() => { inFlight.delete(name); });

  inFlight.set(name, promise);
  return promise;
}

/** A process name's icon as a cached object URL, or null while unresolved
 *  or confirmed absent. See the module comment above for the caching
 *  discipline. */
export function useProcessIcon(name: string | undefined): string | null {
  const [iconUrl, setIconUrl] = useState<string | null>(() => (name ? resolvedCache.get(name) ?? null : null));

  useEffect(() => {
    if (!name) { setIconUrl(null); return; }
    if (resolvedCache.has(name)) { setIconUrl(resolvedCache.get(name)!); return; }
    if (negativeCache.has(name)) { setIconUrl(null); return; }
    let cancelled = false;
    void resolveIcon(name).then(url => { if (!cancelled) setIconUrl(url); });
    return () => { cancelled = true; };
  }, [name]);

  return iconUrl;
}
