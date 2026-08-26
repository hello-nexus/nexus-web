import { useEffect, useRef, useState } from 'react';
import { fetchLastRoute, saveLastRoute } from '../api/session';
import type { Section } from './useRoute';

/**
 * Restores the route a reopened window was last on, and records every route
 * change so the next reopen has one. The value lives in the service's process
 * memory (see nexus-service SessionRoutes), which is what makes "survives a
 * window close, not a service start" expressible at all.
 */
export function useLastRoute(
  path: string,
  navigate: (section: Section, view?: string | null, subtab?: string | null) => void,
  enabled: boolean,
) {
  // The window's own address, captured before useRoute's redirect rewrites it.
  // A window opened on an explicit deep link (a tray balloon, /settings) must
  // keep it, so only a bare landing restores.
  const [openedBare] = useState(() =>
    window.location.search === '' && (window.location.pathname === '/' || window.location.pathname === ''));
  const restoredRef = useRef(false);
  // Saving before the restore read has answered would overwrite the stored
  // route with the default one the window opened on, and the two requests are
  // served concurrently.
  const [restoreSettled, setRestoreSettled] = useState(false);

  useEffect(() => {
    if (!enabled || restoredRef.current) return;
    restoredRef.current = true;
    if (!openedBare) { setRestoreSettled(true); return; }
    let cancelled = false;
    void (async () => {
      try {
        const stored = await fetchLastRoute();
        if (cancelled) return;
        const parts = stored.split('/').filter(Boolean);
        // Only the app's own three-level shape, so a stored value can never
        // navigate somewhere the router cannot express.
        if (parts[0] !== 'system' || !parts[1]) return;
        navigate('system', parts[1], parts[2] ?? null);
      } catch {
        // A failed read restores nothing; saving still resumes below.
      } finally {
        if (!cancelled) setRestoreSettled(true);
      }
    })();
    return () => { cancelled = true; };
  }, [enabled, openedBare, navigate]);

  useEffect(() => {
    if (!enabled || !restoreSettled || !path) return;
    void saveLastRoute(path);
  }, [enabled, restoreSettled, path]);
}
