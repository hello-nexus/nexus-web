import type { PanelLayout, PanelWidget, PanelWidgetSize } from '../types';
import { createUuid } from '../../lib/uuid';
import { getInstallDefaults } from '../../api/installDefaultsCache';

// Synchronous accessors for the four canonical surface layouts. Pulls from
// the install-defaults cache populated by `preloadInstallDefaults()` at
// bootstrap (main.tsx). When the cache hasn't filled yet — only possible
// during a sub-100ms race between bootstrap and the first hook init — we
// return an empty-widgets layout so the SPA renders something; the next
// /preferences round-trip replaces it with the persisted state anyway.
//
// Canonical values live in qos-service/data/install-defaults.json under
// panel.layouts.{desktop,y70,phone,q60}.

function buildLayout(surface: PanelLayout['surface']): PanelLayout {
  const defaults = getInstallDefaults();
  const src = defaults?.panel.layouts[surface];
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
        }) satisfies PanelWidget),
      },
    ],
  };
}

export const defaultLayoutForY70       = (): PanelLayout => buildLayout('y70');
export const defaultLayoutForPhone     = (): PanelLayout => buildLayout('phone');
export const defaultLayoutForQ60       = (): PanelLayout => buildLayout('q60');
export const defaultLayoutForDashboard = (): PanelLayout => buildLayout('desktop');

export function defaultLayoutForSurface(surface: PanelLayout['surface']): PanelLayout {
  return buildLayout(surface);
}
