import { useCallback, useEffect, useRef, useState } from 'react';
import { patchPanelDeviceWithStatus } from '../../api/panel';
import {
  isSingleWidgetSurface,
  normalizePanelWidgetSizeForSurface,
  type PanelLayout,
  type PanelSurface,
  type PanelWidget,
  type PanelWidgetSize,
} from '../types';
import { lookupApp, sizesForSurface, appAvailableForSurface } from '../widgets/registry';
import { defaultLayoutForSurface } from './defaultLayout';
import type { PanelRecordState } from './usePanelRecord';
import { broadcastLayoutChanged } from './panelSync';
import {
  getMarketplaceListing,
  hasMarketplaceLoadedOnce,
  isMarketplaceType,
  marketplaceIdFromType,
  normalizeAppType,
} from '../../widgets/marketplaceRegistry';

const REMOVED_WIDGET_TYPES = new Set(['y70-controls']);

// PanelRoutes' 403 ApiResponse.Fail body for a phone-session layout save that
// introduces a privileged deck action (DeckLayoutPolicy). A 403 on this route
// can also come from the Pair Remote killswitch or a non-panel session, which
// this msg check excludes.
const DECK_ACTION_REQUIRES_DESKTOP_MSG = 'deck_action_requires_desktop';

const SAVE_FORBIDDEN_NOTICE_MS = 5000;

const SIZE_AREA: Record<PanelWidgetSize, number> = {
  '1x1': 1,
  '2x2': 4,
  '2x4': 8,
  '4x2': 8,
  '4x4': 16,
  // Same cell footprint as 2x2; only the mask differs.
  '2x2round': 4,
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
function reconcileAppsAgainstRegistry(
  widgets: readonly PanelWidget[],
  surface: PanelSurface,
  deviceTouch?: boolean,
): PanelWidget[] {
  return widgets.flatMap((rawWidget): PanelWidget[] => {
    // A pre-v11 service (my.hellonexus.com against an older LAN box) still
    // serves legacy marketplace:-prefixed app placements; rewrite instead of
    // treating them as unknown, or this reconcile would delete them and the
    // layout writer would persist the loss.
    const type = normalizeAppType(rawWidget.type);
    const widget = type === rawWidget.type ? rawWidget : { ...rawWidget, type };
    const def = lookupApp(widget.type);
    if (!def) {
      // Marketplace widget rectangles can stick around in the layout
      // through one of two windows:
      //   1. App-start: the marketplace registry hasn't loaded yet, so
      //      every app:* type is "unknown" transiently. Preserve
      //      the rect so a slow first fetch doesn't silently delete the
      //      user's widgets; MarketplaceWidget renders a Loading…
      //      placeholder until the listing lands.
      //   2. Post-load: the registry HAS loaded but the listing for this
      //      id is missing - the widget was uninstalled (or renamed, e.g.
      //      com.nexus.* → com.hellonexus.*). Drop it from the layout so the
      //      panel doesn't show an "unknown:" cell forever.
      if (isMarketplaceType(widget.type)) {
        if (!hasMarketplaceLoadedOnce()) return [widget];
        const id = marketplaceIdFromType(widget.type);
        if (id && getMarketplaceListing(id)) return [widget];
        // Stale id - purge silently. The layout writer will persist the
        // cleaned shape on the next debounced flush.
         
        console.info(`[panel-layout] dropping orphaned marketplace widget: ${widget.type}`);
        return [];
      }
      return [];
    }
    if (!appAvailableForSurface(def.meta, surface, { deviceTouch })) return [];
    const surfaceSize = normalizePanelWidgetSizeForSurface(widget.size, surface);
    const allowed = sizesForSurface(def.meta, surface, deviceTouch);
    const finalSize = nearestAllowedSize(surfaceSize, allowed, def.meta.defaultSize);
    if (finalSize === widget.size) return [widget];
    return [{ ...widget, size: finalSize }];
  });
}

interface UsePanelLayoutResult {
  layout: PanelLayout;
  loaded: boolean;
  /**
   * No stored layout is in hand (the record is missing, or the service has
   * not answered yet), so the panel renders a default that must never be
   * written back over the stored one.
   */
  deviceMissing: boolean;
  /**
   * The last save was refused as a privileged deck edit from a phone session
   * (PanelRoutes' DeckLayoutPolicy). Drives a transient notice; cleared by
   * the next successful save.
   */
  saveForbidden: boolean;
  /**
   * `layout` is derived from the record's STORED layout, not from the local
   * seed. Auto-persisting callers (PanelApp's repagination effect) must wait
   * for this: `loaded` only says the record fetch settled, and the effect
   * that swaps the seed out for the stored layout lands one render later.
   * Persisting in that gap writes the seed over the user's saved layout.
   */
  hydrated: boolean;
  setLayout: (next: PanelLayout) => void;
}

// Geometry (positions, overlap, bounds) is NOT normalize's concern: a size
// snap here may introduce overlap, and repaginatePanelLayout - which every
// render path runs against the real grid capacity - repairs it there. Keeping
// normalize geometry-neutral gives the normalize/repaginate composition a
// fixed point at any capacity (see panelEditorLayoutSync.test.ts).
export function normalizePanelLayout(layout: PanelLayout, surface: PanelSurface, deviceTouch?: boolean): PanelLayout {
  const reconciledPages = layout.pages.map(page => ({
    ...page,
    widgets: reconcileAppsAgainstRegistry(
      page.widgets.filter(widget => !REMOVED_WIDGET_TYPES.has(widget.type)),
      surface,
      deviceTouch,
    ),
  }));

  // Single-widget surface invariant: collapse to one page, one widget,
  // snapped to the surface's allowed size. The earlier reconciliation
  // pass has already normalized each widget's size via
  // normalizePanelWidgetSizeForSurface, so we just keep the first
  // surviving widget across all pages.
  let finalPages = reconciledPages;
  if (isSingleWidgetSurface(surface)) {
    const firstWidget = reconciledPages.flatMap(p => p.widgets)[0];
    const firstPageId = reconciledPages[0]?.id;
    finalPages = [{
      id: firstPageId ?? '',
      widgets: firstWidget ? [{ ...firstWidget, col: 0, row: 0 }] : [],
    }];
  }

  return {
    ...layout,
    surface,
    pages: finalPages,
  };
}

/**
 * The panel's layout, read from the shared device record and written back
 * with a 250 ms debounce. Sibling tabs and other devices refresh through the
 * record store; this hook owns only the local edit path.
 */
export function usePanelLayout(
  recordState: PanelRecordState,
  deviceId: string,
  surface: PanelSurface,
  deviceTouch?: boolean,
): UsePanelLayoutResult {
  const { record, loaded, missing, refetch } = recordState;
  // Seeded from the record when it is already in hand (the kiosk mounts this
  // subtree only after the fetch settles), so the panel's first paint is the
  // user's layout rather than a frame of the local seed.
  const [layout, setLayoutState] = useState<PanelLayout>(
    () => normalizePanelLayout(record?.layout ?? defaultLayoutForSurface(surface), surface, deviceTouch));
  const [hydrated, setHydrated] = useState(() => (record?.layout ?? null) !== null);
  const [saveForbidden, setSaveForbidden] = useState(false);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Writes are allowed only against a layout we actually read back.
  const storedLayout = record?.layout ?? null;
  const storedRef = useRef(storedLayout);
  useEffect(() => { storedRef.current = storedLayout; }, [storedLayout]);
  const writable = !missing && record !== null;
  const writableRef = useRef(writable);
  // No dependency list: a 404 clears the ref directly, and a later successful
  // read can hand back the same `writable` value, which would never re-arm it.
  useEffect(() => { writableRef.current = writable; });

  useEffect(() => {
    setLayoutState(normalizePanelLayout(storedLayout ?? defaultLayoutForSurface(surface), surface, deviceTouch));
    // State, not a ref: the auto-persist effect reads this in the SAME commit
    // that queues the swap above, and must still see the pre-swap value.
    setHydrated(storedLayout !== null);
  }, [storedLayout, surface, deviceTouch]);

  const setLayout = useCallback((next: PanelLayout) => {
    const normalized = normalizePanelLayout(next, surface, deviceTouch);
    setLayoutState(normalized);
    if (!writableRef.current) return;
    if (writeTimer.current) clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => {
      writeTimer.current = null;
      void patchPanelDeviceWithStatus(deviceId, { layout: normalized }).then(result => {
        if (result.ok) {
          setSaveForbidden(false);
          broadcastLayoutChanged();
        } else if (result.status === 404) {
          writableRef.current = false;
          refetch();
        } else if (result.status === 403 && result.msg === DECK_ACTION_REQUIRES_DESKTOP_MSG) {
          // The desktop app owns privileged deck actions; snap back to the
          // stored copy so the refused edit stops re-patching.
          setSaveForbidden(true);
          setLayoutState(normalizePanelLayout(
            storedRef.current ?? defaultLayoutForSurface(surface), surface, deviceTouch));
        }
      });
    }, 250);
  }, [deviceId, surface, deviceTouch, refetch]);

  useEffect(() => {
    if (!saveForbidden) return undefined;
    const timer = window.setTimeout(() => setSaveForbidden(false), SAVE_FORBIDDEN_NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [saveForbidden]);

  useEffect(() => () => {
    if (writeTimer.current) {
      clearTimeout(writeTimer.current);
      writeTimer.current = null;
    }
  }, []);

  return { layout, loaded, deviceMissing: !writable, saveForbidden, hydrated, setLayout };
}
