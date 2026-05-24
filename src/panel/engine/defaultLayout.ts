import type { PanelConfigValue, PanelDock, PanelLayout, PanelWidget, PanelWidgetSize } from '../types';
import { createUuid } from '../../lib/uuid';
import { getInstallDefaults } from '../../api/installDefaultsCache';

// Synchronous accessors for the four canonical surface layouts. Pulls from
// the install-defaults cache populated by `preloadInstallDefaults()` at
// bootstrap (main.tsx). When the cache hasn't filled yet — only possible
// during a sub-100ms race between bootstrap and the first hook init — we
// return an empty-widgets layout so the SPA renders something; the next
// /preferences round-trip replaces it with the persisted state anyway.
//
// Canonical values live in nexus-service/data/install-defaults.json under
// panel.layouts.{desktop,y70,phone,q60}.

// iOS-springboard-style dock samples. Only Y70 ships with the dock
// pre-enabled (touch-first surface, large screen real estate); phone keeps
// the dock available but defaults off. Each entry is a macro widget with
// a working URL action so the dock demonstrates the feature out of the
// box — the user customizes from there.
function defaultDockForSurface(surface: PanelLayout['surface']): PanelDock | undefined {
  if (surface !== 'y70') return undefined;
  const macro = (title: string, icon: string, url: string): PanelWidget => ({
    id: createUuid(),
    type: 'macros',
    size: '1x1',
    col: 0,
    row: 0,
    config: { title, icon, action: 'url', url },
  });
  return {
    enabled: true,
    widgets: [
      macro('Search', '🔍', 'https://www.google.com'),
      macro('YouTube', '📺', 'https://www.youtube.com'),
      macro('GitHub', '💻', 'https://github.com'),
      macro('Reddit', '👽', 'https://www.reddit.com'),
    ],
  };
}

/**
 * Default dock for a surface that has no persisted dock state yet. Used by
 * `normalizePanelLayout` to upgrade existing layouts without overwriting
 * an explicit `dock.enabled = false` the user has already set.
 */
export function defaultDockForMissingSurface(surface: PanelLayout['surface']): PanelDock | undefined {
  return defaultDockForSurface(surface);
}

function buildLayout(surface: PanelLayout['surface']): PanelLayout {
  const defaults = getInstallDefaults();
  const src = defaults?.panel.layouts[surface];
  const dock = defaultDockForSurface(surface);
  return {
    layoutSchemaVersion: src?.layoutSchemaVersion ?? 2,
    surface,
    pages: [
      {
        id: createUuid(),
        widgets: (src?.widgets ?? []).map(w => ({
          id: createUuid(),
          type: w.type,
          size: w.size as PanelWidgetSize,
          col: w.col,
          row: w.row,
          ...(w.config ? { config: w.config as Record<string, PanelConfigValue> } : {}),
        }) satisfies PanelWidget),
      },
    ],
    ...(dock ? { dock } : {}),
  };
}

export const defaultLayoutForY70       = (): PanelLayout => buildLayout('y70');
export const defaultLayoutForPhone     = (): PanelLayout => buildLayout('phone');
export const defaultLayoutForQ60       = (): PanelLayout => buildLayout('q60');
export const defaultLayoutForDashboard = (): PanelLayout => buildLayout('desktop');

export function defaultLayoutForSurface(surface: PanelLayout['surface']): PanelLayout {
  return buildLayout(surface);
}
