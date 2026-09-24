import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchRecentApps, saveRecentApps } from '../api/session';
import { sanitizeRecents } from '../app/sidebarAppKeys';

/**
 * The sidebar's "recently opened" rows, backed by the service's process
 * memory (see useLastRoute for the same boundary): a reopened window shows
 * the rows it had, a fresh service start shows none.
 *
 * Reads once when the service is first reachable. Until that read answers
 * the list is empty and writes are dropped, so an early navigation can never
 * post the empty landing state over the stored one.
 */
export function useSessionRecents(enabled: boolean): {
  recents: string[];
  loaded: boolean;
  setRecents: (next: string[]) => void;
} {
  const [recents, setRecentsState] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  // Answered, as opposed to the in-flight claim below; setRecents gates on it.
  const loadedRef = useRef(false);
  const claimedRef = useRef(false);

  useEffect(() => {
    if (!enabled || claimedRef.current) return;
    claimedRef.current = true;
    let cancelled = false;
    let settled = false;
    void (async () => {
      try {
        const keys = await fetchRecentApps();
        if (!cancelled) setRecentsState(sanitizeRecents(keys));
      } catch {
        // A failed read starts empty; saving still resumes below.
      } finally {
        settled = true;
        if (!cancelled) { loadedRef.current = true; setLoaded(true); }
      }
    })();
    // Tearing down before the read answers releases the claim, so StrictMode's
    // double-invoke loads instead of leaving the hook inert in dev.
    return () => { cancelled = true; if (!settled) claimedRef.current = false; };
  }, [enabled]);

  const setRecents = useCallback((next: string[]) => {
    if (!loadedRef.current) return;
    setRecentsState(next);
    void saveRecentApps(next);
  }, []);

  return { recents, loaded, setRecents };
}
