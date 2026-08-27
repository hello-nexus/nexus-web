import { useEffect, useRef, useState } from 'react';
import { fetchLastRoute, saveLastRoute } from '../api/session';
import { loadSettings } from '../lib/settings';
import type { Section } from './useRoute';

/**
 * Restores the route a reopened window was last on, and records every route
 * change so the next reopen has one. The value lives in the service's process
 * memory (see nexus-service SessionRoutes), which is what makes "survives a
 * window close, not a service start" expressible at all.
 *
 * Gated on the client-only `rememberLastPage` setting (Settings > General >
 * Startup & tray, default on). Read from localStorage rather than
 * useUiSettings: this runs in Dashboard's own body, which sits outside the
 * UiSettingsProvider it renders.
 */
export function useLastRoute(
  path: string,
  navigate: (section: Section, view?: string | null, subtab?: string | null) => void,
  enabled: boolean,
) {
  // The window's own address, captured before useRoute's redirect rewrites it.
  // A window opened on an explicit deep link (a tray balloon, /settings) must
  // keep it, so only a bare landing restores. `token` is the desktop shell's
  // auth handoff, not a destination - nexus-overlay opens the dashboard as
  // "/?token=..." on every Windows tray click - so it alone does not make the
  // landing a deep link.
  const [openedBare] = useState(() => {
    const path = window.location.pathname;
    if (path !== '/' && path !== '') return false;
    const params = new URLSearchParams(window.location.search);
    params.delete('token');
    return params.toString() === '';
  });
  const restoredRef = useRef(false);
  // Saving before the restore read has answered would overwrite the stored
  // route with the default one the window opened on, and the two requests are
  // served concurrently.
  const [restoreSettled, setRestoreSettled] = useState(false);
  // useRoute navigates in a transition, so `path` still holds the landing
  // route for one render after the restore resolves; saving there would
  // overwrite the stored route with it. Cleared on the first other path, so
  // navigating back to the landing page still records.
  const skipPathRef = useRef<string | null>(null);
  const pathRef = useRef(path);
  pathRef.current = path;
  // The route the window opened on. `enabled` is false until the service
  // answers, so a restore can resolve seconds in - long enough for the user to
  // have clicked somewhere. Moving off this path forfeits the restore.
  const landingPathRef = useRef<string | null>(null);
  if (landingPathRef.current === null && path) landingPathRef.current = path;

  useEffect(() => {
    if (!enabled || restoredRef.current) return;
    restoredRef.current = true;
    if (!openedBare || !rememberLastPage()) { setRestoreSettled(true); return; }
    let cancelled = false;
    let settled = false;
    void (async () => {
      try {
        const stored = await fetchLastRoute();
        if (cancelled || pathRef.current !== landingPathRef.current) return;
        const parts = stored.split('/').filter(Boolean);
        // Only the app's own three-level shape, so a stored value can never
        // navigate somewhere the router cannot express.
        if (parts[0] !== 'system' || !parts[1]) return;
        skipPathRef.current = pathRef.current;
        navigate('system', parts[1], parts[2] ?? null);
      } catch {
        // A failed read restores nothing; saving still resumes below.
      } finally {
        settled = true;
        if (!cancelled) setRestoreSettled(true);
      }
    })();
    // Tearing down before the read answers releases the claim, so StrictMode's
    // double-invoke restores instead of leaving the hook inert in dev.
    return () => { cancelled = true; if (!settled) restoredRef.current = false; };
  }, [enabled, openedBare, navigate]);

  useEffect(() => {
    // Re-read per navigation rather than once at mount, so switching the
    // setting off stops the recording without a reload.
    if (!enabled || !restoreSettled || !path || !rememberLastPage()) return;
    if (skipPathRef.current !== null) {
      if (path === skipPathRef.current) return;
      skipPathRef.current = null;
    }
    void saveLastRoute(path);
  }, [enabled, restoreSettled, path]);
}

function rememberLastPage(): boolean {
  try { return loadSettings().general.rememberLastPage; }
  catch { return true; }
}
