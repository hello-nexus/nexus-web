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
    const frame = data as { kind?: string; apps?: RecentApp[]; focusedProcessKey?: string };
    if (frame.kind !== 'recents') return;
    if (Array.isArray(frame.apps)) setApps(frame.apps);
    setFocusedProcessKey(frame.focusedProcessKey);
  }, []));

  const setExcluded = useCallback(async (processKeys: string[]) => {
    setExcludedState(processKeys);
    await setRecentAppsExcluded(processKeys);
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
