import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPanelDeviceWithStatus, patchPanelDeviceWithStatus } from '../../api/panel';
import { useTopicCallback } from '../../hooks/useMultiplexSocket';
import {
  normalizePanelWidgetSizeForSurface,
  type PanelLayout,
  type PanelPage,
  type PanelSurface,
  type PanelWidget,
  type PanelWidgetSize,
} from '../types';
import { lookupWidget, sizesForSurface, widgetAvailableForSurface } from '../widgets/registry';
import { defaultLayoutForSurface } from './defaultLayout';
import { broadcastLayoutChanged, onLayoutChanged } from './panelSync';
import { sizeToSpan } from './grid';

const REMOVED_WIDGET_TYPES = new Set(['y70-controls']);

const SIZE_AREA: Record<PanelWidgetSize, number> = {
  '1x1': 1,
  '2x2': 4,
  '2x4': 8,
  '4x2': 8,
  '4x4': 16,
};

// Pick the size from `allowed` closest in area to `requested`. Ties prefer
// the smaller size so the widget shrinks-to-fit rather than blowing up. The
// mapping is deterministic so re-normalizing a normalized layout is a no-op.
function nearestAllowedSize(
  requested: PanelWidgetSize,
  allowed: readonly PanelWidgetSize[],
  fallback: PanelWidgetSize,
): PanelWidgetSize {
  if (allowed.includes(requested)) return requested;
  if (allowed.length === 0) return fallback;
  const target = SIZE_AREA[requested];
  return allowed.slice().sort((a, b) => {
    const da = Math.abs(SIZE_AREA[a] - target);
    const db = Math.abs(SIZE_AREA[b] - target);
    if (da !== db) return da - db;
    return SIZE_AREA[a] - SIZE_AREA[b];
  })[0];
}

// Drop widgets that no longer exist in the registry or are unsupported on the
// current surface, and snap any widget whose size is not in its meta.sizes
// list to the nearest allowed size. Without this, a profile saved with an
// out-of-spec size renders the widget at a size its CSS does not handle,
// producing layout glitches and re-render churn.
function reconcileWidgetsAgainstRegistry(
  widgets: readonly PanelWidget[],
  surface: PanelSurface,
): PanelWidget[] {
  return widgets.flatMap((widget): PanelWidget[] => {
    const def = lookupWidget(widget.type);
    if (!def) return [];
    if (!widgetAvailableForSurface(def.meta, surface)) return [];
    const surfaceSize = normalizePanelWidgetSizeForSurface(widget.size, surface);
    const allowed = sizesForSurface(def.meta, surface);
    const finalSize = nearestAllowedSize(surfaceSize, allowed, def.meta.defaultSize);
    if (finalSize === widget.size) return [widget];
    return [{ ...widget, size: finalSize }];
  });
}

interface UsePanelLayoutResult {
  layout: PanelLayout;
  loaded: boolean;
  /**
   * True when the server has no record for this deviceId (e.g. a profile
   * switch wiped the panel registry). The panel renders a default layout
   * but auto-persist is suppressed because every patch would 404 in a
   * tight loop with the auto-paginate effect.
   */
  deviceMissing: boolean;
  setLayout: (next: PanelLayout) => void;
}

// Default columns per surface for the schema-1 -> schema-2 migration.
// The persisted shape never recorded a column count - the runtime
// inferred one from physical size. Picking a stable default per
// surface lets us synthesize (col, row) once on read; subsequent
// runs see schema-2 fields and skip the migration.
const SCHEMA_MIGRATION_COLS: Record<PanelSurface, number> = {
  y70: 4,
  phone: 4,
  q60: 2,
  desktop: 8,
};

interface LegacyWidgetShape {
  position?: number;
  positionHorizontal?: number;
}

function migrateLegacyPage(widgets: PanelWidget[], cols: number): PanelWidget[] {
  const sorted = widgets.slice().sort((a, b) => {
    const ap = (a as PanelWidget & LegacyWidgetShape).position ?? 0;
    const bp = (b as PanelWidget & LegacyWidgetShape).position ?? 0;
    return ap - bp;
  });
  let cursorRow = 0;
  let cursorCol = 0;
  let currentRowMaxSpan = 0;
  return sorted.map(widget => {
    const span = sizeToSpan(widget.size);
    const colSpan = Math.max(1, Math.min(span.cols, cols));
    const rowSpan = Math.max(1, span.rows);
    if (cursorCol + colSpan > cols) {
      cursorRow += currentRowMaxSpan || 1;
      cursorCol = 0;
      currentRowMaxSpan = 0;
    }
    const placed: PanelWidget = { ...widget, col: cursorCol, row: cursorRow };
    cursorCol += colSpan;
    if (rowSpan > currentRowMaxSpan) currentRowMaxSpan = rowSpan;
    return placed;
  });
}

function widgetsOverlap(layout: PanelLayout, cols: number): boolean {
  for (const page of layout.pages) {
    const rects = page.widgets.map(w => {
      const span = sizeToSpan(w.size);
      const colSpan = Math.max(1, Math.min(span.cols, cols));
      const rowSpan = Math.max(1, span.rows);
      return { col: w.col, row: w.row, colSpan, rowSpan };
    });
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i];
        const b = rects[j];
        if (a.col < b.col + b.colSpan && b.col < a.col + a.colSpan
          && a.row < b.row + b.rowSpan && b.row < a.row + a.rowSpan) {
          return true;
        }
      }
    }
  }
  return false;
}

function migrateLayoutSchema(layout: PanelLayout, surface: PanelSurface): PanelLayout {
  // Re-flow when EITHER:
  //  - The layout is older than schema 2 (no col/row stored), OR
  //  - Widgets overlap each other.
  //
  // The overlap branch repairs corrupted state left over from an
  // earlier bug: when the web read a schema-1 record, the C# DTO
  // defaulted Col/Row to 0 for every widget; the migration trigger
  // accepted those zeros as "already migrated" and only bumped
  // layoutSchemaVersion to 2 without re-flowing. Layouts saved
  // through that path have version=2 and every widget at (0, 0),
  // visually stacked on top of each other. Detecting any overlap
  // forces a fresh row-major re-flow regardless of version.
  const cols = SCHEMA_MIGRATION_COLS[surface] ?? 4;
  const version = typeof layout.layoutSchemaVersion === 'number' ? layout.layoutSchemaVersion : 0;
  if (version >= 2 && !widgetsOverlap(layout, cols)) return layout;
  const pages: PanelPage[] = layout.pages.map(page => ({
    ...page,
    widgets: migrateLegacyPage(page.widgets, cols),
  }));
  return {
    ...layout,
    layoutSchemaVersion: 2,
    pages,
  };
}

export function normalizePanelLayout(layout: PanelLayout, surface: PanelSurface): PanelLayout {
  const migrated = migrateLayoutSchema(layout, surface);
  const layoutWithoutLegacyDensity = { ...migrated } as PanelLayout & { gridDensity?: unknown };
  delete layoutWithoutLegacyDensity.gridDensity;
  const dock = migrated.dock
    ? {
        ...migrated.dock,
        // Dock slots own their size (always 1x1 visually), so we only filter
        // out widgets that no longer exist or aren't valid for this surface.
        widgets: migrated.dock.widgets.filter(widget => {
          if (REMOVED_WIDGET_TYPES.has(widget.type)) return false;
          const def = lookupWidget(widget.type);
          if (!def) return false;
          return widgetAvailableForSurface(def.meta, surface);
        }),
      }
    : migrated.dock;
  return {
    ...layoutWithoutLegacyDensity,
    surface,
    dock,
    pages: migrated.pages.map(page => ({
      ...page,
      widgets: reconcileWidgetsAgainstRegistry(
        page.widgets.filter(widget => !REMOVED_WIDGET_TYPES.has(widget.type)),
        surface,
      ),
    })),
  };
}

/**
 * Reads the per-device panel layout from /panel/devices/{deviceId}, persists
 * changes back with a 250 ms debounce, and listens on BroadcastChannel for
 * layout-changed events from sibling tabs (kiosk + editor in the same
 * browser stay in sync). Cross-device sync arrives via the multiplex
 * panel/device topic - subscribed in PanelApp via useTopic.
 */
export function usePanelLayout(deviceId: string, surface: PanelSurface): UsePanelLayoutResult {
  const [layout, setLayoutState] = useState<PanelLayout>(() => defaultLayoutForSurface(surface));
  const [loaded, setLoaded] = useState(false);
  const [deviceMissing, setDeviceMissing] = useState(false);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirror of `deviceMissing` so setLayout (whose deps must stay stable)
  // can read the latest value without rebinding on every change.
  const deviceMissingRef = useRef(false);
  useEffect(() => { deviceMissingRef.current = deviceMissing; }, [deviceMissing]);

  const fetchLayout = useCallback(() => {
    fetchPanelDeviceWithStatus(deviceId).then(result => {
      if (result.found) {
        const next = result.record.layout ?? defaultLayoutForSurface(surface);
        // Update the ref synchronously alongside the state setter so a
        // setLayout call later in the same commit sees the cleared flag,
        // not the stale value the mirror effect hasn't yet written.
        deviceMissingRef.current = false;
        setLayoutState(normalizePanelLayout(next, surface));
        setDeviceMissing(false);
      } else if (result.status === 404) {
        // Device record is gone server-side (profile switch, manual delete).
        // Render a default layout but flag the device as missing so we do
        // NOT auto-persist - every patch would 404 in a tight loop.
        deviceMissingRef.current = true;
        setLayoutState(normalizePanelLayout(defaultLayoutForSurface(surface), surface));
        setDeviceMissing(true);
      }
      // Other failures (network, 401 after re-pair) leave layout state
      // intact and let the next refetch retry. fetchPanelDeviceWithStatus
      // never throws, so .catch is dead code; keep it as belt-and-suspenders
      // against future refactors that surface exceptions.
      setLoaded(true);
    }).catch(() => {
      setLoaded(true);
    });
  }, [deviceId, surface]);

  useEffect(() => {
    fetchLayout();
    const unsub = onLayoutChanged(fetchLayout);
    return unsub;
  }, [fetchLayout]);
  // Cross-device push: every PanelDevice mutation broadcasts 'panel/device'
  // with the deviceId that changed. Refetch only when it's ours so two
  // panels do not refresh on each other's edits.
  useTopicCallback('panel/device', true, (raw) => {
    const frame = raw as { deviceId?: string } | null;
    if (frame?.deviceId === deviceId) fetchLayout();
  });

  const setLayout = useCallback((next: PanelLayout) => {
    const normalized = normalizePanelLayout(next, surface);
    setLayoutState(normalized);
    if (deviceMissingRef.current) return;
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      writeTimer.current = null;
      patchPanelDeviceWithStatus(deviceId, { layout: normalized }).then(result => {
        if (result.ok) {
          broadcastLayoutChanged();
        } else if (result.status === 404) {
          // Device went away mid-session: stop persisting until something
          // re-registers. Set the ref synchronously so any same-tick
          // setLayout call already in the queue is suppressed too;
          // setDeviceMissing only kicks in next render.
          deviceMissingRef.current = true;
          setDeviceMissing(true);
        }
      });
    }, 250);
  }, [deviceId, surface]);

  useEffect(() => () => {
    if (writeTimer.current) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
    }
  }, []);

  return { layout, loaded, deviceMissing, setLayout };
}
