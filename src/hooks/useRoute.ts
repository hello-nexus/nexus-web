import { useState, useEffect, useCallback, useRef, startTransition } from 'react';

/**
 * Three-level path routing: /section/view/subtab
 *
 * Routes:
 *   /                          → redirect to /system/dashboard
 *   /system                    → redirect to /system/dashboard
 *   /system/:view              → MonitoringView, LightingView, etc.
 *   /system/:view/:subtab      → e.g. /system/monitoring/cpu
 *   /builder                   → Builder table view
 *   /builder/:category         → Builder with that category's picker open
 *   /community                 → Placeholder
 *   /touch                     → panel kiosk entrypoint (handled before this hook)
 */

export type Section = 'system' | 'builder' | 'community';

interface Route {
  section: Section;
  view: string | null;
  subtab: string | null;
  /** For /builder/component/:id - holds the component ID */
  componentId: string | null;
  /** For /builder/component/:id?from=:category - originating category for Back nav */
  fromCategory: string | null;
}

const DEFAULT_SECTION: Section = 'system';
const DEFAULT_VIEW = 'dashboard';
const DEFAULT_MONITORING_SUBTAB = 'overview';

const VALID_SECTIONS: readonly string[] = ['system', 'builder', 'community'];

function isSection(s: string): s is Section {
  return VALID_SECTIONS.includes(s);
}

function parsePath(): Route {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const rawSection = parts[0] || '';
  const fromCategory = new URLSearchParams(window.location.search).get('from');

  // Handle legacy flat routes (e.g. /monitoring, /cooling, /settings)
  const SERVICE_VIEWS = ['dashboard', 'monitoring', 'lighting', 'cooling', 'devices', 'device', 'displays', 'clock', 'gallery', 'settings', 'profiles', 'tools'];
  if (SERVICE_VIEWS.includes(rawSection)) {
    return normalizeSystemRoute({
      section: 'system',
      view: rawSection,
      subtab: parts[1] || null,
      componentId: null,
      fromCategory: null,
    });
  }

  if (!isSection(rawSection)) {
    return { section: DEFAULT_SECTION, view: DEFAULT_VIEW, subtab: null, componentId: null, fromCategory: null };
  }

  // Handle /builder/component/:id
  if (rawSection === 'builder' && parts[1] === 'component' && parts[2]) {
    return {
      section: 'builder',
      view: 'component',
      subtab: null,
      componentId: parts[2],
      fromCategory,
    };
  }

  return normalizeSystemRoute({
    section: rawSection,
    view: parts[1] || null,
    subtab: parts[2] || null,
    componentId: null,
    fromCategory: null,
  });
}

// Displays used to be its own view; it now lives as the Devices page's
// second tab. Old bookmarks (/displays, /system/displays) land on it.
// Screen Time moved the other way - from a Monitoring tab to its own view -
// so /system/monitoring/screentime lands on /system/screentime.
function normalizeSystemRoute(route: Route): Route {
  if (route.section === 'system' && route.view === 'displays') {
    return { ...route, view: 'devices', subtab: 'displays' };
  }
  if (route.section === 'system' && route.view === 'monitoring' && route.subtab === 'screentime') {
    return { ...route, view: 'screentime', subtab: null };
  }
  return route;
}

function buildPath(section: Section, view?: string | null, subtab?: string | null): string {
  let path = `/${section}`;
  if (view) {
    path += `/${view}`;
    if (subtab) {
      path += `/${subtab}`;
    }
  }
  return path;
}

function routeToPath(route: Route): string {
  if (route.section === 'builder' && route.view === 'component' && route.componentId) {
    const qs = route.fromCategory ? `?from=${encodeURIComponent(route.fromCategory)}` : '';
    return `/builder/component/${route.componentId}${qs}`;
  }
  return buildPath(route.section, route.view, route.subtab);
}

function applyRouteDefaults(route: Route): Route {
  if (route.section !== DEFAULT_SECTION) return route;

  if (!route.view) {
    return {
      ...route,
      view: DEFAULT_VIEW,
      subtab: null,
      componentId: null,
      fromCategory: null,
    };
  }

  if (route.view === 'monitoring' && !route.subtab) {
    return {
      ...route,
      subtab: DEFAULT_MONITORING_SUBTAB,
      componentId: null,
      fromCategory: null,
    };
  }

  return route;
}

export function useRoute() {
  // Initial route captured synchronously so first paint sees the right page.
  // The effect below stamps the canonical URL via replaceState if the address
  // bar differs.
  const [initialRoute] = useState(() => applyRouteDefaults(parsePath()));
  const [initialExpectedPath] = useState(() => routeToPath(initialRoute));
  const [route, setRoute] = useState<Route>(initialRoute);

  // Browser session history is the source of truth for back/forward.
  // Mirrored in `historyRef` keyed by `state.idx` so popstate (mouse buttons
  // or browser chrome) resolves the destination Route in O(1). Every
  // navigation funnels through the same index + Route table, keeping the
  // arrow disabled-states in sync with the mouse.
  const historyRef = useRef<Route[]>([initialRoute]);
  const indexRef = useRef(0);
  // Bumped on any stack mutation so consumers re-evaluate canGoBack/Forward
  // (which are derived from refs).
  const [historyVersion, setHistoryVersion] = useState(0);

  const routeRef = useRef(route);
  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  // Seed the index + mirror table from history.state.
  //  - Fresh load (no state.idx): stamp idx:0 onto the current entry.
  //  - Refresh / session-restore (state.idx is N): the browser still has
  //    entries 0..N-1 but we lack Route objects for them; seeding
  //    indexRef = N keeps canGoBack/Forward and pushState truncation aligned
  //    with the browser. Mouse-back to an older entry falls through to
  //    parsePath() in the popstate handler (URL is authoritative).
  //
  // The ref guard keeps this single-shot through React 18 concurrent
  // re-renders / StrictMode double-invoke.
  const initialRedirectAppliedRef = useRef(false);
  useEffect(() => {
    if (initialRedirectAppliedRef.current) return;
    initialRedirectAppliedRef.current = true;
    const existingIdx = (history.state && typeof (history.state as { idx?: unknown }).idx === 'number')
      ? (history.state as { idx: number }).idx
      : null;
    if (existingIdx != null && existingIdx >= 0) {
      indexRef.current = existingIdx;
      // Sparse mirror: only the current entry's Route is known. Older
      // indices stay undefined and fall back to parsePath() on popstate.
      historyRef.current = [];
      historyRef.current[existingIdx] = initialRoute;
      setHistoryVersion(v => v + 1);
      return;
    }
    const path = window.location.pathname;
    const target = path !== initialExpectedPath ? initialExpectedPath : path + window.location.search;
    history.replaceState({ idx: 0 }, '', target);
  }, [initialRoute, initialExpectedPath]);

  // Listen for back/forward navigation (browser chrome, mouse side buttons,
  // history.back()/forward() invoked elsewhere). Use the index stamped on
  // each entry to look up the corresponding Route in our local mirror.
  useEffect(() => {
    const onPopState = (e: PopStateEvent) => {
      const stateIdx = e.state && typeof (e.state as { idx?: unknown }).idx === 'number'
        ? (e.state as { idx: number }).idx
        : null;
      const target = stateIdx != null && historyRef.current[stateIdx]
        ? historyRef.current[stateIdx]
        : applyRouteDefaults(parsePath());
      if (stateIdx != null) {
        indexRef.current = stateIdx;
      }
      // setHistoryVersion synchronously BEFORE the transition so canGoBack /
      // canGoForward reflect the new index immediately. setRoute in a
      // transition so a lazy Page chunk on back/forward doesn't unmount the
      // current view (Suspense fallback={null} would flash blank). Same
      // ordering as commit(); keep symmetric or React 18 may batch the sync
      // update with the transition and keep the prior UI from staying visible.
      setHistoryVersion(v => v + 1);
      startTransition(() => setRoute(target));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Shared commit for forward navigation. pushState appends to session
  // history; mirror the entry in historyRef and truncate forward entries
  // (browser semantics: navigating after going back drops the forward
  // chain). On an unchanged path, still refresh the mirror slot so non-URL
  // Route fields (e.g. fromCategory) don't go stale.
  const commit = useCallback((next: Route) => {
    const path = routeToPath(next);
    const currentPath = window.location.pathname + window.location.search;
    if (currentPath !== path) {
      const newIdx = indexRef.current + 1;
      historyRef.current = historyRef.current.slice(0, indexRef.current + 1);
      historyRef.current[newIdx] = next;
      indexRef.current = newIdx;
      history.pushState({ idx: newIdx }, '', path);
      setHistoryVersion(v => v + 1);
    } else {
      historyRef.current[indexRef.current] = next;
    }
    // setRoute in a transition so a lazy Page chunk under Suspense keeps the
    // previous view visible (no blank flash from fallback={null}) until ready.
    // URL + history are already updated synchronously above.
    startTransition(() => setRoute(next));
  }, []);

  const navigate = useCallback((section: Section, view?: string | null, subtab?: string | null) => {
    const next = applyRouteDefaults({
      section,
      view: view ?? null,
      subtab: subtab ?? null,
      componentId: null,
      fromCategory: null,
    });
    commit(next);
  }, [commit]);

  // setRoute updaters must be pure (no side effects) - React 18 may invoke
  // them more than once during concurrent rendering. The commit() helper
  // reads from routeRef instead of relying on the setRoute updater closure
  // for this reason.
  const setView = useCallback((view: string, subtab?: string | null) => {
    const next = applyRouteDefaults({
      ...routeRef.current,
      view,
      subtab: subtab ?? null,
      componentId: null,
      fromCategory: null,
    });
    commit(next);
  }, [commit]);

  const setSubtab = useCallback((subtab: string) => {
    const prev = routeRef.current;
    commit({ ...prev, subtab, componentId: null, fromCategory: null });
  }, [commit]);

  const navigateToComponent = useCallback((componentId: string, fromCategory?: string | null) => {
    commit({
      section: 'builder',
      view: 'component',
      subtab: null,
      componentId,
      fromCategory: fromCategory ?? null,
    });
  }, [commit]);

  // Drive back/forward through window.history so mouse side buttons and the
  // arrow buttons share one history cursor. The popstate handler above is
  // what actually updates indexRef + route after the browser settles.
  const goBack = useCallback(() => {
    if (indexRef.current <= 0) return;
    history.back();
  }, []);

  const goForward = useCallback(() => {
    if (indexRef.current >= historyRef.current.length - 1) return;
    history.forward();
  }, []);

  // Derived from refs; historyVersion schedules the re-render when the stacks
  // move, so React reads fresh values.
  void historyVersion;
  const canGoBack = indexRef.current > 0;
  const canGoForward = indexRef.current < historyRef.current.length - 1;

  return {
    section: route.section,
    view: route.view,
    subtab: route.subtab,
    componentId: route.componentId,
    fromCategory: route.fromCategory,
    navigate,
    setView,
    setSubtab,
    navigateToComponent,
    canGoBack,
    canGoForward,
    goBack,
    goForward,
  };
}
