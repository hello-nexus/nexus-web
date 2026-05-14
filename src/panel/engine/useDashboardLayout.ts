import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPreferences, savePreferences } from '../../api/profiles';
import { useTopicCallback } from '../../hooks/useMultiplexSocket';
import type { PanelLayout } from '../types';
import { defaultLayoutForDashboard } from './defaultLayout';
import { broadcastLayoutChanged, onLayoutChanged } from './panelSync';
import { normalizePanelLayout } from './usePanelLayout';

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

interface UseDashboardLayoutResult {
  layout: PanelLayout;
  loaded: boolean;
  setLayout: (next: PanelLayout) => void;
}

export function useDashboardLayout(): UseDashboardLayoutResult {
  const [layout, setLayoutState] = useState<PanelLayout>(() => defaultLayoutForDashboard());
  const [loaded, setLoaded] = useState(false);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const setLayout = useCallback((next: PanelLayout) => {
    const normalized = collapseToSinglePage(normalizePanelLayout(next, 'desktop'));
    setLayoutState(normalized);
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      writeTimer.current = null;
      savePreferences({ panel: { dashboardLayout: normalized } })
        .then(() => broadcastLayoutChanged())
        .catch(() => {});
    }, 250);
  }, []);

  useEffect(() => () => {
    if (writeTimer.current) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
    }
  }, []);

  return { layout, loaded, setLayout };
}
