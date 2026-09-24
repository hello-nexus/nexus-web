import { useCallback, useEffect, useState } from 'react';
import {
  getRecentApps, setRecentAppsExcluded, clearRecentApps, activateRecentApp,
  type RecentApp,
} from '../../../api/deck';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';

export interface UseRecentAppsResult {
  apps: RecentApp[];
  focusedProcessKey?: string;
  excluded: string[];
  loaded: boolean;
  setExcluded: (processKeys: string[]) => Promise<void>;
  clear: () => Promise<void>;
  activate: (processKey: string) => Promise<void>;
}

/**
 * The host-wide recent-apps ring, kept live over the `deck` topic's `recents`
 * frame with a GET fallback on mount. Shared shape by DeckWidget (Recent Apps
 * mode rendering) and DeckInstanceEditor's Recent Apps section (excluded
 * chips + clear).
 */
export function useRecentApps(enabled: boolean): UseRecentAppsResult {
  const [apps, setApps] = useState<RecentApp[]>([]);
  const [focusedProcessKey, setFocusedProcessKey] = useState<string | undefined>(undefined);
  const [excluded, setExcludedState] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void getRecentApps().then(res => {
      if (cancelled) return;
      setApps(res.apps);
      setExcludedState(res.excluded);
      setFocusedProcessKey(res.focusedProcessKey);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [enabled]);

  useTopicCallback('deck', enabled, useCallback((data: unknown) => {
    const frame = data as { kind?: string; apps?: RecentApp[]; focusedProcessKey?: string; excluded?: string[] };
    if (frame.kind !== 'recents') return;
    if (Array.isArray(frame.apps)) setApps(frame.apps);
    setFocusedProcessKey(frame.focusedProcessKey);
    // The frame is `{ apps, focusedProcessKey }` today - no `excluded` field
    // - so apply it only if a future service build adds one; a second editor
    // open elsewhere has no other live signal an exclusion changed.
    if (Array.isArray(frame.excluded)) setExcludedState(frame.excluded);
  }, []));

  const setExcluded = useCallback(async (processKeys: string[]) => {
    setExcludedState(processKeys);
    await setRecentAppsExcluded(processKeys);
    // No `excluded` field on the recents frame today (see above) - refetch so
    // this instance's own state reflects the server's actual write, rather
    // than trusting the optimistic update.
    const res = await getRecentApps();
    setApps(res.apps);
    setExcludedState(res.excluded);
    setFocusedProcessKey(res.focusedProcessKey);
  }, []);

  const clear = useCallback(async () => {
    setApps([]);
    await clearRecentApps();
  }, []);

  const activate = useCallback(async (processKey: string) => {
    await activateRecentApp(processKey);
  }, []);

  return { apps, focusedProcessKey, excluded, loaded, setExcluded, clear, activate };
}
