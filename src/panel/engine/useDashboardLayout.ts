import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPreferences, savePreferences } from '../../api/profiles';
import { useTopicCallback } from '../../hooks/useMultiplexSocket';
import type { PanelLayout } from '../types';
import { defaultLayoutForDashboard } from './defaultLayout';
import { broadcastLayoutChanged, onLayoutChanged } from './panelSync';
import { normalizePanelLayout } from './usePanelLayout';
import { useAppsChangedSync } from './useAppsChangedSync';

// Dashboard is single-page by design: keep page 0, drop everything after.
// Applied on read so the renderer never sees a multi-page layout, and on
// the input to `savePreferences` so any legacy multi-page widget data
// gets cleaned out the first time the user edits the dashboard. The
// add-widget callsite also passes singlePage:true to appendWidget so
// new writes can never re-introduce multi-page state.
function collapseToSinglePage(layout: PanelLayout): PanelLayout {
  if (layout.pages.length <= 1) return layout;
  return { ...layout, pages: [layout.pages[0]] };
}

export interface UseDashboardLayoutResult {
  layout: PanelLayout;
  loaded: boolean;
  setLayout: (next: PanelLayout) => void;
  /** Resolves once every setLayout so far is written, so a preset switch captures it. */
  flush: () => Promise<void>;
}

function saveLayout(layout: PanelLayout): Promise<void> {
  return savePreferences({ panel: { dashboardLayout: layout } })
    .then(() => broadcastLayoutChanged())
    .catch(() => {});
}

export function useDashboardLayout(): UseDashboardLayoutResult {
  const [layout, setLayoutState] = useState<PanelLayout>(() => defaultLayoutForDashboard());
  const [loaded, setLoaded] = useState(false);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingWrite = useRef<PanelLayout | null>(null);
  const lastSave = useRef<Promise<void>>(Promise.resolve());

  const fetchLayout = useCallback(() => {
    fetchPreferences().then(prefs => {
      const next = prefs?.panel?.dashboardLayout ?? defaultLayoutForDashboard();
      setLayoutState(collapseToSinglePage(normalizePanelLayout(next, 'desktop')));
      setLoaded(true);
    }).catch(() => {
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    fetchLayout();
    return onLayoutChanged(fetchLayout);
  }, [fetchLayout]);

  useTopicCallback('prefs', true, fetchLayout);
  // The dashboard holds app:<id> placements too (useOemAppSeed puts the OEM
  // bake-in app here), and setLayout persists whatever normalize returned.
  useAppsChangedSync(fetchLayout);

  const setLayout = useCallback((next: PanelLayout) => {
    const normalized = collapseToSinglePage(normalizePanelLayout(next, 'desktop'));
    setLayoutState(normalized);
    pendingWrite.current = normalized;
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      writeTimer.current = null;
      pendingWrite.current = null;
      lastSave.current = saveLayout(normalized);
    }, 250);
  }, []);

  const flush = useCallback(async () => {
    const pending = pendingWrite.current;
    if (writeTimer.current && pending) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
      pendingWrite.current = null;
      lastSave.current = saveLayout(pending);
    }
    await lastSave.current;
  }, []);

  useEffect(() => () => {
    if (writeTimer.current) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
    }
  }, []);

  return { layout, loaded, setLayout, flush };
}
