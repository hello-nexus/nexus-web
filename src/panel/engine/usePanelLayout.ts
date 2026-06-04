import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPanelDeviceWithStatus, patchPanelDeviceWithStatus } from '../../api/panel';
import { useTopicCallback } from '../../hooks/useMultiplexSocket';
import {
  isSingleWidgetSurface,
  normalizePanelWidgetSizeForSurface,
  type PanelLayout,
  type PanelSurface,
  type PanelWidget,
  type PanelWidgetSize,
} from '../types';
import { lookupApp, sizesForSurface, appAvailableForSurface } from '../widgets/registry';
import { defaultDockForMissingSurface, defaultLayoutForSurface } from './defaultLayout';
import { broadcastLayoutChanged, onLayoutChanged } from './panelSync';
import { pagesHaveOverlap, repackPage } from './paginate';
import {
  getMarketplaceListing,
  hasMarketplaceLoadedOnce,
  isMarketplaceType,
  marketplaceIdFromType,
} from '../../widgets/marketplaceRegistry';

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
    const def = lookupApp(widget.type);
    if (!def) {
      // Marketplace widget rectangles can stick around in the layout
      // through one of two windows:
      //   1. App-start: the marketplace registry hasn't loaded yet, so
      //      every marketplace:* type is "unknown" transiently. Preserve
      //      the rect so a slow first fetch doesn't silently delete the
      //      user's widgets; MarketplaceWidget renders a Loading…
      //      placeholder until the listing lands.
      //   2. Post-load: the registry HAS loaded but the listing for this
      //      id is missing — the widget was uninstalled (or renamed, e.g.
      //      com.nexus.* → com.hellonexus.*). Drop it from the layout so the
      //      panel doesn't show an "unknown:" cell forever.
      if (isMarketplaceType(widget.type)) {
        if (!hasMarketplaceLoadedOnce()) return [widget];
        const id = marketplaceIdFromType(widget.type);
        if (id && getMarketplaceListing(id)) return [widget];
        // Stale id — purge silently. The layout writer will persist the
        // cleaned shape on the next debounced flush.
         
        console.info(`[panel-layout] dropping orphaned marketplace widget: ${widget.type}`);
        return [];
      }
      return [];
    }
    if (!appAvailableForSurface(def.meta, surface)) return [];
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

// Default column count per surface used by the overlap-reflow path
// when reconcileWidgetsAgainstRegistry snaps a widget's size and
// introduces overlap with siblings.
const SURFACE_COLS: Record<PanelSurface, number> = {
  y70: 4,
  phone: 4,
  q60: 2,
  desktop: 8,
};

export function normalizePanelLayout(layout: PanelLayout, surface: PanelSurface): PanelLayout {
  const migrated = layout;
  // Surfaces that ship with a default dock (currently Y70 only) get one
  // injected when no dock state has been persisted yet. Once the user
  // toggles the dock — even to `enabled: false` — that decision sticks
  // and we never re-inject. Existing pre-dock-feature layouts upgrade
  // transparently on next load.
  const sourceDock = migrated.dock ?? defaultDockForMissingSurface(surface);
  const dock = sourceDock
    ? {
        ...sourceDock,
        // Dock slots own their size (always 1x1 visually), so we only filter
        // out widgets that no longer exist or aren't valid for this surface,
        // plus anything not actually 1x1 (defensive — store-level invariant).
        widgets: sourceDock.widgets.filter(widget => {
          if (widget.size !== '1x1') return false;
          if (REMOVED_WIDGET_TYPES.has(widget.type)) return false;
          const def = lookupApp(widget.type);
          if (!def) return false;
          return appAvailableForSurface(def.meta, surface);
        }),
      }
    : undefined;
  const reconciledPages = migrated.pages.map(page => ({
    ...page,
    widgets: reconcileWidgetsAgainstRegistry(
      page.widgets.filter(widget => !REMOVED_WIDGET_TYPES.has(widget.type)),
      surface,
    ),
  }));

  // Reconcile may have snapped a widget's size (e.g. 2x4 → 4x2 on a
  // multi-widget surface), which can introduce overlap with siblings.
  // Detect post-snap overlap and re-pack row-major in place so the UI
  // never lands on overlapping widgets that lock out subsequent edits.
  const reflowCols = SURFACE_COLS[surface] ?? 4;
  const reflowedPages = pagesHaveOverlap(reconciledPages, reflowCols)
    ? reconciledPages.map(page => ({
        ...page,
        widgets: repackPage(page.widgets, reflowCols),
      }))
    : reconciledPages;

  // Single-widget surface invariant: collapse to one page, one widget,
  // snapped to the surface's allowed size. The earlier reconciliation
  // pass has already normalized each widget's size via
  // normalizePanelWidgetSizeForSurface, so we just keep the first
  // surviving widget across all pages.
  let finalPages = reflowedPages;
  if (isSingleWidgetSurface(surface)) {
    const firstWidget = reconciledPages.flatMap(p => p.widgets)[0];
    const firstPageId = reconciledPages[0]?.id;
    finalPages = [{
      id: firstPageId ?? '',
      widgets: firstWidget ? [{ ...firstWidget, col: 0, row: 0 }] : [],
    }];
  }

  return {
    ...migrated,
    surface,
    ...(dock ? { dock } : {}),
    pages: finalPages,
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
      // never throws today, so the .catch below only guards against a
      // future refactor that surfaces exceptions.
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
