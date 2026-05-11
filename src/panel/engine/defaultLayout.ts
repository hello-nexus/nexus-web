import type { PanelLayout, PanelWidget, PanelWidgetSize } from '../types';
import { createUuid } from '../../lib/uuid';

// Client-side fallback when /preferences returns null or fails to load.
// Kept intentionally identical in shape to qos-service/Panel/PanelLayoutDefaults.cs
// so the two can't drift - if they disagree it's a bug, not a feature.
//
// Defaults are minimal on purpose: clock at the top, monitoring under
// it. The user can drag in more from the catalog when they want them.

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
