import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Three-level path routing: /section/view/subtab
 *
 * Routes:
 *   /                          → redirect to /my-computer/dashboard
 *   /my-computer               → redirect to /my-computer/dashboard
 *   /my-computer/:view         → MonitoringView, LightingView, etc.
 *   /my-computer/:view/:subtab → e.g. /my-computer/monitoring/cpu
 *   /builder                   → Builder table view
 *   /builder/:category         → Builder with that category's picker open
 *   /benchmark                 → Placeholder
 *   /community                 → Placeholder
 *   /touch                     → panel kiosk entrypoint (handled before this hook)
 */

export type Section = 'my-computer' | 'builder' | 'benchmark' | 'community';

interface Route {
  section: Section;
  view: string | null;
  subtab: string | null;
  /** For /builder/component/:id - holds the component ID */
  componentId: string | null;
  /** For /builder/component/:id?from=:category - originating category for Back nav */
  fromCategory: string | null;
}

const DEFAULT_SECTION: Section = 'my-computer';
const DEFAULT_VIEW = 'dashboard';
const DEFAULT_MONITORING_SUBTAB = 'overview';

const VALID_SECTIONS: readonly string[] = ['my-computer', 'builder', 'benchmark', 'community'];

function isSection(s: string): s is Section {
  return VALID_SECTIONS.includes(s);
}

function parsePath(): Route {
  const parts = window.location.pathname.split('/').filter(Boolean);
  const rawSection = parts[0] || '';
  const fromCategory = new URLSearchParams(window.location.search).get('from');

  // Handle legacy flat routes (e.g. /monitoring, /cooling, /settings)
  const SERVICE_VIEWS = ['dashboard', 'monitoring', 'lighting', 'cooling', 'devices', 'settings', 'tools'];
  if (SERVICE_VIEWS.includes(rawSection)) {
    return {
      section: 'my-computer',
      view: rawSection,
      subtab: parts[1] || null,
      componentId: null,
      fromCategory: null,
    };
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

  return {
    section: rawSection,
    view: parts[1] || null,
    subtab: parts[2] || null,
    componentId: null,
    fromCategory: null,
  };
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
  const [initialExpectedPath] = useState(() => {
    const initialRoute = applyRouteDefaults(parsePath());
    return buildPath(initialRoute.section, initialRoute.view, initialRoute.subtab);
  });
  const [route, setRoute] = useState<Route>(() => applyRouteDefaults(parsePath()));

  // Listen for back/forward navigation
  useEffect(() => {
    const onPopState = () => {
      setRoute(applyRouteDefaults(parsePath()));
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Set initial path if at root or needs redirect.
  //
  // The ref guard ensures this can never fire more than once. Without it, any
  // future React reconciliation that re-runs the effect (StrictMode dev double-
  // invoke, concurrent-render replays, etc.) would replaceState back to the
  // mount-time URL and clobber a navigation that has already happened via
  // setView / navigate.
  const initialRedirectAppliedRef = useRef(false);
  useEffect(() => {
    if (initialRedirectAppliedRef.current) return;
    initialRedirectAppliedRef.current = true;
    const path = window.location.pathname;
    if (path !== initialExpectedPath) {
      history.replaceState(null, '', initialExpectedPath);
    }
  }, [initialExpectedPath]);

  const navigate = useCallback((section: Section, view?: string | null, subtab?: string | null) => {
    const next = applyRouteDefaults({
      section,
      view: view ?? null,
      subtab: subtab ?? null,
      componentId: null,
      fromCategory: null,
    });
    const path = buildPath(next.section, next.view, next.subtab);
    if (window.location.pathname + window.location.search !== path) {
      history.pushState(null, '', path);
    }
    setRoute(next);
  }, []);

  // setRoute updaters must be pure (no side effects) - React 18 may invoke
  // them more than once during concurrent rendering. Keep history mutation
  // out of the updater and route it through a ref so the latest committed
  // route is what actually drives the URL push.
  const routeRef = useRef(route);
  routeRef.current = route;

  const setView = useCallback((view: string, subtab?: string | null) => {
    const next = applyRouteDefaults({
      ...routeRef.current,
      view,
      subtab: subtab ?? null,
      componentId: null,
      fromCategory: null,
    });
    const path = buildPath(next.section, next.view, next.subtab);
    if (window.location.pathname + window.location.search !== path) {
      history.pushState(null, '', path);
    }
    setRoute(next);
  }, []);

  const setSubtab = useCallback((subtab: string) => {
    const prev = routeRef.current;
    const path = buildPath(prev.section, prev.view, subtab);
    if (window.location.pathname + window.location.search !== path) {
      history.pushState(null, '', path);
    }
    setRoute({ ...prev, subtab, componentId: null, fromCategory: null });
  }, []);

  const navigateToComponent = useCallback((componentId: string, fromCategory?: string | null) => {
    const qs = fromCategory ? `?from=${encodeURIComponent(fromCategory)}` : '';
    const path = `/builder/component/${componentId}${qs}`;
    if (window.location.pathname + window.location.search !== path) {
      history.pushState(null, '', path);
    }
    setRoute({ section: 'builder', view: 'component', subtab: null, componentId, fromCategory: fromCategory ?? null });
  }, []);

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
  };
}
