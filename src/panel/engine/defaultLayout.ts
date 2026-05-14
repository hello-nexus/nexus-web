import type { PanelLayout, PanelWidget, PanelWidgetSize } from '../types';
import { createUuid } from '../../lib/uuid';

// Client-side fallback when /preferences returns null or fails to load.
//
// Canonical source lives at qos-service/data/install-defaults.json (see
// panel.layouts.{desktop,y70,phone,q60}). The service consumes that file
// at startup via InstallDefaults. These values are a sync-callable mirror
// so the SPA's first paint doesn't need to await a network fetch; if you
// change install-defaults.json, mirror the change here too. A follow-up
// will swap this for a synchronous read of a pre-fetched /defaults cache,
// removing the duplication entirely.

function widget(type: string, size: PanelWidgetSize, col: number, row: number): PanelWidget {
  return {
    id: createUuid(),
    type,
    size,
    col,
    row,
  };
}

export function defaultLayoutForY70(): PanelLayout {
  return {
    layoutSchemaVersion: 2,
    surface: 'y70',
    pages: [
      {
        id: createUuid(),
        widgets: [
          widget('clock',      '4x2', 0, 0),
          widget('monitoring', '4x4', 0, 2),
        ],
      },
    ],
  };
}

export function defaultLayoutForPhone(): PanelLayout {
  return {
    layoutSchemaVersion: 2,
    surface: 'phone',
    pages: [
      {
        id: createUuid(),
        widgets: [
          widget('clock',      '4x2', 0, 0),
          widget('monitoring', '4x4', 0, 2),
        ],
      },
    ],
  };
}

export function defaultLayoutForQ60(): PanelLayout {
  return {
    layoutSchemaVersion: 2,
    surface: 'q60',
    pages: [
      {
        id: createUuid(),
        widgets: [
          widget('monitoring', '2x4', 0, 0),
        ],
      },
    ],
  };
}

export function defaultLayoutForDashboard(): PanelLayout {
  return {
    layoutSchemaVersion: 2,
    surface: 'desktop',
    pages: [
      {
        id: createUuid(),
        widgets: [
          widget('clock',      '4x2', 0, 0),
          widget('monitoring', '4x4', 0, 2),
        ],
      },
    ],
  };
}

export function defaultLayoutForSurface(surface: PanelLayout['surface']): PanelLayout {
  if (surface === 'desktop') return defaultLayoutForDashboard();
  if (surface === 'phone') return defaultLayoutForPhone();
  if (surface === 'q60') return defaultLayoutForQ60();
  return defaultLayoutForY70();
}
