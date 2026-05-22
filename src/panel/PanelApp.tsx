import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  DndContext, DragOverlay, MeasuringStrategy, PointerSensor,
  useSensor, useSensors,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, type SortingStrategy } from '@dnd-kit/sortable';
import { usePanelLayout } from './engine/usePanelLayout';
import { useDashboardLayout } from './engine/useDashboardLayout';
import { useKioskWatchdog } from './engine/useKioskWatchdog';
import { PANEL_CONTEXT_MENU_TRIGGER_MS, usePanelTouchMode } from './engine/usePanelTouchMode';
import { useLongPress } from './engine/useLongPress';
import { usePanelTextSelectionGuard } from './engine/usePanelTextSelectionGuard';
import { usePanelViewportLock } from './engine/usePanelViewportLock';
import { sizeToSpan } from './engine/grid';
import { paginateCapacityForGrid, repaginatePanelLayout, type PaginateCapacity } from './engine/paginate';
import {
  allCellsForPage,
  appendWidget,
  patchWidgetById,
  previewDrag,
  removeWidgetById,
  setDockEnabled,
  tryResizeWidget,
} from './engine/panelLayoutOps';
import { PANEL_EDGE_ADVANCE_DWELL_MS } from './engine/dragConstants';
import { useWidgetResizeMotion } from './engine/useWidgetResizeMotion';
import { PanelPager } from './PanelPager';
import { PanelPageIndicator } from './PanelPageIndicator';
import { PanelActionsTray } from './PanelActionsTray';
import { PanelDock } from './PanelDock';
import { PanelImmersiveOverlay } from './PanelImmersiveOverlay';
import { lookupWidget, sizesForSurface, widgetAvailableForSurface } from './widgets/registry';
import { WidgetContextMenu } from './widgets/common/WidgetContextMenu';
import { createOverlayWidget } from '../api/overlay';
import { ErrorBoundary } from '../components/common/ErrorBoundary/ErrorBoundary';
import { useMultiplex, useTopic } from '../hooks/useMultiplexSocket';
import { useServiceStatus } from '../hooks/useServiceStatus';
import { useUiSettings } from '../hooks/useUiSettings';
import {
  isPinnableAppKey,
  sanitizePinnedTail,
} from '../app/sidebarApps';
import { useCrossZoneDrag } from '../app/CrossZoneDrag';
import { PanelOfflineOverlay } from './PanelOfflineOverlay';
import { isInsecureBrowserPanel } from './PanelInsecureBanner';
import { useTranslation } from '../lib/i18n';
import { applyHtmlChromeTheme } from '../lib/settings';
import { fetchPanelDevice, setPanelHostName } from '../api/panel';
import { pingService } from '../api/service';
import { createUuid } from '../lib/uuid';
import {
  type PanelConfigValue,
  type PanelLayout,
  type PanelSurface,
  type PanelWidget,
  type PanelWidgetSize,
} from './types';
import { surfaceSupportsTouch } from './types';
import { inferSurfaceFromViewport } from './inferSurface';
import { PanelBackgroundShader } from './PanelBackgroundShader';
import { resolvePanelBackground } from './panelBackground';
import type { SimulatorTheme } from './embed/simulatorProtocol';
import './styles/tokens.scss';
import styles from './PanelApp.module.scss';

import {
  type DashboardSectionNavigate,
  type DragGestureState,
  PANEL_DRAG_START_THRESHOLD_PX,
  buildPanelCollisionDetection,
  isDashboardClickthroughType,
  noopCellPointers,
  noopMouseHandler,
  parseDragTarget,
  trimTrailingEmptyPages,
} from './panelLayoutHelpers';
import {
  DESKTOP_ACTION_TRAY_HEIGHT,
  MAX_PANEL_PAGES,
  useRuntimePanelGrid,
  usePanelPageScrollLock,
} from './panelGrid';
import {
  useIsLandscape,
  usePhoneContentScale,
  usePhonePanelManifest,
} from './panelPhone';
import { useNativeSettingsBridge } from './panelNativeBridge';
import {
  type EditorDockMotion,
  buildEditorDockMotionStyle,
  readEditorDockSlotRect,
  toEditorDockSourceRect,
} from './panelEditorDock';
import {
  buildEmbeddedPanelThemeVars,
  buildPanelThemeVars,
  useDocumentResolvedThemeMode,
  usePanelLanguageSync,
  usePanelTheme,
  useResolvedPanelThemeMode,
} from './panelTheme';
import { PanelEditorSheet, type SheetMode } from './PanelEditorSheet';
import {
  DragTargetHighlight,
  EmptyCellDroppable,
  PanelDragOverlayCell,
  PanelTouchCell,
} from './PanelDragCells';

// Window during which the closing keyframe (or hand-driven swipe glide) plays
// before the editor sheet unmounts. Matches the SETTLE_MS / settling transition
// in usePanelSheetSwipe so a swipe-dismiss completes its glide before the tree
// is removed.
const EDITOR_EXIT_MS = 240;
const WIDGET_RESIZE_MOTION_MS = 220;
const CONNECTION_INTRO_MS = 1700;

interface PanelLayoutState {
  layout: PanelLayout;
  loaded: boolean;
  setLayout: (next: PanelLayout) => void;
}


export default function PanelApp({ deviceId }: { deviceId: string }) {
  // Resolve the device record once on mount; the surface classification
  // stamped on the record (via inferSurfaceFromViewport at allocation
  // time) drives widget filtering. If the record is missing on the
  // server (cached id but server forgot - cleared profile etc.), the
  // panel still mounts with a viewport-inferred surface so the user
  // is not stuck on a blank page.
  const [resolvedSurface, setResolvedSurface] = useState<PanelSurface | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchPanelDevice(deviceId).then(record => {
      if (cancelled) return;
      const surfaceFromRecord = record?.capabilities?.surface;
      setResolvedSurface(surfaceFromRecord ?? inferSurfaceFromViewport(false));
    }).catch(() => {
      if (!cancelled) setResolvedSurface(inferSurfaceFromViewport(false));
    });
    return () => { cancelled = true; };
  }, [deviceId]);
  if (!resolvedSurface) {
    return null;
  }
  return <PanelKioskContent deviceId={deviceId} surface={resolvedSurface} />;
}
export function PanelEmbeddedContent({ openCatalogSignal = 0, appAccentColor, onSectionNavigate }: {
  openCatalogSignal?: number;
  appAccentColor?: string;
  onSectionNavigate?: DashboardSectionNavigate;
}) {
  const layoutState = useDashboardLayout();
  return (
    <ErrorBoundary label="Dashboard">
      <PanelContent
        surface="desktop"
        layoutState={layoutState}
        embedded
        openCatalogSignal={openCatalogSignal}
        appAccentColor={appAccentColor}
        onSectionNavigate={onSectionNavigate}
      />
    </ErrorBoundary>
  );
}

function PanelKioskContent({ deviceId, surface }: { deviceId: string; surface: PanelSurface }) {
  const layoutState = usePanelLayout(deviceId, surface);
  return (
    <ErrorBoundary label="Panel">
      <PanelContent surface={surface} layoutState={layoutState} />
    </ErrorBoundary>
  );
}

export function PanelContent({
  surface,
  layoutState,
  embedded = false,
  simulator = false,
  simulatorTheme,
  simulatorThemeMode,
  simulatorSelectedWidgetId,
  onSimulatorWidgetClicked,
  onSimulatorBackgroundClicked,
  openCatalogSignal,
  appAccentColor,
  onSectionNavigate,
}: {
  surface: PanelSurface;
  layoutState: PanelLayoutState;
  embedded?: boolean;
  simulator?: boolean;
  simulatorTheme?: SimulatorTheme;
  simulatorThemeMode?: 'dark' | 'light';
  simulatorSelectedWidgetId?: string | null;
  onSimulatorWidgetClicked?: (id: string) => void;
  onSimulatorBackgroundClicked?: () => void;
  openCatalogSignal?: number;
  appAccentColor?: string;
  onSectionNavigate?: DashboardSectionNavigate;
}) {
  // Simulator runs alongside the iframe parent, which owns kiosk-only
  // chrome (offline overlay, viewport lock, page-scroll lock, native
  // bridges, language sync, watchdog). The simulator iframe must not
  // duplicate any of those - the parent already provides them, and a
  // second viewport lock would fight the parent's window scroll.
  const kioskBehavior = !embedded && !simulator;
  usePanelViewportLock(kioskBehavior);
  usePanelPageScrollLock(kioskBehavior);
  useTopic('panel/phone/presence', kioskBehavior && surface === 'phone');
  usePhonePanelManifest(kioskBehavior && surface === 'phone');
  const { layout, loaded, setLayout } = layoutState;
  const panelTheme = usePanelTheme(kioskBehavior);
  // Simulator gets its theme from the parent via postMessage, so the
  // local fetch path stays disabled and `effectiveTheme` swaps in the
  // parent-supplied PanelThemeState wherever the live runtime would
  // read panelTheme.theme. Without this, the iframe would render the
  // default-state theme until usePanelTheme's first fetch resolved
  // (and on the simulator that fetch never runs at all).
  const effectiveTheme = simulator && simulatorTheme ? simulatorTheme : panelTheme.theme;
  usePanelLanguageSync(kioskBehavior);
  const effectiveThemeMode = effectiveTheme.themeSyncWithDesktop
    ? effectiveTheme.appThemeMode
    : effectiveTheme.themeMode;
  const panelResolvedThemeMode = useResolvedPanelThemeMode(effectiveThemeMode);
  const desktopResolvedThemeMode = useDocumentResolvedThemeMode(embedded);
  const resolvedThemeMode = simulator && simulatorThemeMode
    ? simulatorThemeMode
    : embedded ? desktopResolvedThemeMode : panelResolvedThemeMode;
  // Standalone phone / kiosk panel owns the whole tab - mirror its resolved
  // theme to <html> so iOS Safari paints its chrome (URL bar, overscroll,
  // scrollbars) via the matching `color-scheme` rule and `<meta theme-color>`.
  // Skipped when embedded inside the desktop dashboard, where the desktop
  // already drives html theme via applyThemeMode.
  useEffect(() => {
    if (embedded || simulator) return;
    applyHtmlChromeTheme(resolvedThemeMode);
  }, [embedded, simulator, resolvedThemeMode]);
  const nativeSettings = useNativeSettingsBridge(kioskBehavior && surface === 'phone');
  const serviceStatus = useServiceStatus(kioskBehavior);
  const multiplex = useMultiplex();
  // The widget context menu's "Pin to Sidebar" entry needs to know the
  // current pinned-tail to gate the action (only pinnable types that
  // aren't already pinned). Always inside a UiSettingsProvider because
  // every PanelContent mount point (kiosk, embedded, simulator) wraps
  // one — see PanelEntrypoint / Dashboard.
  const { settings: uiSettings, update: updateUiSettings } = useUiSettings();
  const pinnedTail = sanitizePinnedTail(uiSettings.pinnedSidebarApps);
  // Side-channel signal for the sidebar to mount its drop target. We
  // only publish for pinnable types AND only on the embedded desktop
  // surface; everywhere else the value stays null and the sidebar's
  // pointer tracking never engages. See app/CrossZoneDrag.tsx.
  const { setDraggingPinnableType, dropHandlerRef: sidebarDropHandlerRef } = useCrossZoneDrag();
  const isOffline = kioskBehavior && (serviceStatus.state === 'offline' || serviceStatus.state === 'offline-installed');
  const rootRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const connectionIntroTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const connectionIntroAnnouncedRef = useRef(false);
  const [sheetMode, setSheetMode] = useState<SheetMode | null>(null);
  const [sheetClosing, setSheetClosing] = useState(false);
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);
  const [selectedMonitoringSlot, setSelectedMonitoringSlot] = useState(0);
  const [editorDockMotion, setEditorDockMotion] = useState<EditorDockMotion | null>(null);
  // Widgets that just had an action rejected (e.g. resize couldn't fit
  // anywhere, even across pages). Drives a brief shake/flash on the
  // cell so the user understands why the change didn't land. The
  // animation auto-clears via a timer; the keyset is plural so multiple
  // simultaneous rejections each get their own play.
  const [flashedWidgets, setFlashedWidgets] = useState<ReadonlySet<string>>(() => new Set());
  const flashTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const triggerFlash = useCallback((widgetId: string) => {
    setFlashedWidgets(prev => {
      if (prev.has(widgetId)) return prev;
      const next = new Set(prev);
      next.add(widgetId);
      return next;
    });
    const existing = flashTimersRef.current.get(widgetId);
    if (existing) window.clearTimeout(existing);
    const handle = window.setTimeout(() => {
      flashTimersRef.current.delete(widgetId);
      setFlashedWidgets(prev => {
        if (!prev.has(widgetId)) return prev;
        const next = new Set(prev);
        next.delete(widgetId);
        return next;
      });
    }, 600);
    flashTimersRef.current.set(widgetId, handle);
  }, []);
  useEffect(() => () => {
    const timers = flashTimersRef.current;
    for (const handle of timers.values()) window.clearTimeout(handle);
    timers.clear();
  }, []);
  const [connectionIntroHost, setConnectionIntroHost] = useState<string | null>(null);
  // Portal target for the editor-docked cell. The pager track applies a
  // `transform` for any non-active page, which traps `position: fixed`
  // descendants inside the (offscreen) track and makes the docked cell
  // disappear when editing a widget on page 2+. Render via portal into
  // this stable, untransformed container at the panel-root level so the
  // docked cell anchors to the viewport regardless of which page hosts
  // the source widget.
  const [editorDockPortalEl, setEditorDockPortalEl] = useState<HTMLDivElement | null>(null);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const { t } = useTranslation();
  // Host PC display name shown in the tray. On the kiosk the watchdog
  // (3s ping) keeps it fresh; on phone surfaces (no watchdog) we fire
  // a single ping on mount to seed it.
  const [machineName, setMachineName] = useState<string>('');
  const phoneSeed = kioskBehavior && surface === 'phone';
  useEffect(() => {
    if (!phoneSeed) return;
    let cancelled = false;
    pingService().then(res => {
      if (!cancelled && res?.machineName) setMachineName(res.machineName);
    });
    return () => { cancelled = true; };
  }, [phoneSeed]);
  useKioskWatchdog({
    enabled: kioskBehavior && surface !== 'phone',
    onPing: response => {
      if (response.machineName) setMachineName(response.machineName);
    },
  });
  useEffect(() => {
    const next = serviceStatus.ping?.machineName?.trim();
    if (next) setMachineName(next);
  }, [serviceStatus.ping?.machineName]);
  const onMachineNameCommit = useCallback((next: string) => {
    // Optimistic local update so the tray header changes immediately;
    // the next ping will overwrite with the server's normalised value
    // (trim, dedup whitespace, fall back to OS name if cleared).
    setMachineName(next);
    setPanelHostName(next).then(res => {
      if (res?.machineName) setMachineName(res.machineName);
    }).catch(() => {});
  }, []);
  const lastCatalogSignalRef = useRef(openCatalogSignal);
  const [immersiveWidgetId, setImmersiveWidgetId] = useState<string | null>(null);
  // Bumped each time immersive opens so the overlay's React key
  // changes between sessions even when the same widget is re-opened
  // - prevents any stale internal state from blocking re-entry.
  const [immersiveOpenCounter, setImmersiveOpenCounter] = useState(0);
  const enterImmersive = useCallback((widgetId: string) => {
    setImmersiveOpenCounter(n => n + 1);
    setImmersiveWidgetId(widgetId);
  }, []);
  const handleImmersiveExit = useCallback(() => {
    setImmersiveWidgetId(null);
  }, []);
  const clearConnectionIntro = useCallback(() => {
    if (connectionIntroTimerRef.current) {
      window.clearTimeout(connectionIntroTimerRef.current);
      connectionIntroTimerRef.current = null;
    }
    setConnectionIntroHost(null);
  }, []);
  const startConnectionIntro = useCallback((host: string) => {
    clearConnectionIntro();
    setTrayOpen(false);
    setConnectionIntroHost(host);
    connectionIntroTimerRef.current = window.setTimeout(() => {
      connectionIntroTimerRef.current = null;
      setConnectionIntroHost(null);
    }, CONNECTION_INTRO_MS);
  }, [clearConnectionIntro]);
  useEffect(() => () => clearConnectionIntro(), [clearConnectionIntro]);
  const { resizeMotionWidgetId, beginResizeMotion } = useWidgetResizeMotion(
    rootRef,
    styles.cellResizeMotion,
    WIDGET_RESIZE_MOTION_MS,
  );
  // Selection guard runs in simulator too: text-select would fight drag
  // gestures inside the iframe just like on a real touch surface.
  usePanelTextSelectionGuard(rootRef, !embedded || simulator);
  usePhoneContentScale(surface === 'phone' && loaded, rootRef);
  const runtimeGrid = useRuntimePanelGrid(surface, rootRef, simulator);
  const panelThemeVars = useMemo(
    () => embedded ? buildEmbeddedPanelThemeVars(appAccentColor, resolvedThemeMode) : buildPanelThemeVars(effectiveTheme, resolvedThemeMode),
    [appAccentColor, embedded, effectiveTheme, resolvedThemeMode],
  );
  const effectiveBackground = useMemo(
    () => embedded ? 'transparent' : resolvePanelBackground(
      effectiveTheme.backgroundColor,
      effectiveTheme.backgroundColorLight,
      resolvedThemeMode,
    ),
    [embedded, effectiveTheme.backgroundColor, effectiveTheme.backgroundColorLight, resolvedThemeMode],
  );
  const panelRootStyle = useMemo(
    () => ({
      ...panelThemeVars,
      background: effectiveBackground,
      '--panel-background-solid': effectiveBackground,
      '--panel-columns': runtimeGrid.columns,
      '--panel-rows': runtimeGrid.rows,
      ...(surface === 'desktop' ? {
        '--panel-cell-size': `${runtimeGrid.cellSize}px`,
        '--panel-row-size': `${runtimeGrid.rowSize}px`,
        '--panel-content-scale': `${runtimeGrid.contentScale}px`,
        '--panel-desktop-actions-height': `${DESKTOP_ACTION_TRAY_HEIGHT}px`,
      } : {}),
    }) as CSSProperties,
    [
      effectiveBackground,
      panelThemeVars,
      runtimeGrid.cellSize,
      runtimeGrid.columns,
      runtimeGrid.contentScale,
      runtimeGrid.rowSize,
      runtimeGrid.rows,
      surface,
    ],
  );

  // ---------- Pagination + dock state derived from layout ----------
  const dockEnabled = Boolean(layout.dock?.enabled);
  const dockSupported = surface !== 'desktop' && surfaceSupportsTouch(surface);
  // Every touch-capable surface must hoist the focused widget above the
  // editor's backdrop-blur scrim, otherwise the widget being edited disappears
  // under the blur. q60 is display-only so the edit flow never engages there.
  // See the .cellEditorDocked rules in PanelApp.module.scss.
  const editorDockSupported = surfaceSupportsTouch(surface);
  const dockActive = dockSupported && dockEnabled;
  const isLandscape = useIsLandscape(surface);
  const capacity = useMemo<PaginateCapacity>(
    () => paginateCapacityForGrid(
      runtimeGrid.columns,
      runtimeGrid.rows,
      dockActive,
      isLandscape ? 'landscape' : 'portrait',
      surface,
    ),
    [runtimeGrid.columns, runtimeGrid.rows, dockActive, isLandscape, surface],
  );

  // Two-stage drag state declared early so the layout derivations
  // below (dragLayout, allFiltered, etc.) can fold the drag-only
  // phantom page into the rendered shape.
  //   dragArmedId: set the moment dnd-kit's delay activation
  //                completes (the long-press has matured into a
  //                "ready to drag" gesture). Used to disable
  //                competing gestures (tray-swipe, page-swipe).
  //   activeDragId: set the moment the user actually starts moving
  //                 past activation. Drives the visual overlay
  //                 clone + the source-cell hide.
  //   dragExtraPageId: phantom trailing page rendered alongside
  //                    committed pages so the user can drag onto a
  //                    new (empty) page without creating it first.
  //                    Persisted only if a widget actually lands on
  //                    it; cleared on dragEnd / dragCancel.
  const [dragArmedId, setDragArmedId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dragExtraPageId, setDragExtraPageId] = useState<string | null>(null);

  // Re-paginate the persisted layout to match current capacity. Persists
  // the new shape via setLayout (debounced, idempotent via reference
  // equality short-circuit in repaginatePanelLayout).
  // repaginatePanelLayout returns the SAME layout reference when the
  // pages already match the requested capacity (byte-equal). That
  // reference equality is load-bearing: without it, the persistence
  // useEffect below would call setLayout on every render, the next
  // render would compute a fresh paginated reference, the effect would
  // fire again, and the panel would melt into a render loop (which
  // also looks like the WebSocket "loses connection after a single
  // frame" symptom because the React tree never settles).
  const paginatedLayout = useMemo(
    () => repaginatePanelLayout(layout, capacity),
    [layout, capacity],
  );
  useEffect(() => {
    // CRITICAL: only auto-persist the re-paginated shape AFTER the
    // server fetch has populated `layout`. Before `loaded`, `layout`
    // is the local fallback default from usePanelLayout's useState
    // initializer. Re-paginating that default and POSTing it would
    // race the in-flight fetch and overwrite the user's saved edits
    // with the default-paginated layout. Wait for `loaded` so we
    // only ever auto-persist a paginated version of what the server
    // actually has.
    if (!loaded) return;
    if (paginatedLayout !== layout) setLayout(paginatedLayout);
  }, [paginatedLayout, layout, setLayout, loaded]);

  // Layout used by the renderer + drag pipeline. During a drag we
  // append a phantom empty page (if room within MAX_PANEL_PAGES) so
  // the user can drop onto a brand-new page without first creating
  // one. Outside drag, equals paginatedLayout exactly so persistence
  // is unaffected.
  const dragLayout = useMemo<PanelLayout>(() => {
    if (!activeDragId || !dragExtraPageId) return paginatedLayout;
    if (paginatedLayout.pages.length >= MAX_PANEL_PAGES) return paginatedLayout;
    return {
      ...paginatedLayout,
      pages: [...paginatedLayout.pages, { id: dragExtraPageId, widgets: [] }],
    };
  }, [paginatedLayout, activeDragId, dragExtraPageId]);

  const allFiltered = useMemo(() => dragLayout.pages.map(page => ({
    id: page.id,
    widgets: page.widgets
      .filter(w => {
        const def = lookupWidget(w.type);
        if (!def) return true;
        return widgetAvailableForSurface(def.meta, surface);
      })
      .slice()
      // Render order is row-major over (col, row) so the focus walk
      // and DOM order match what the user sees, but each widget is
      // grid-positioned via inline style, not by source order.
      .sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col),
  })), [dragLayout.pages, surface]);

  // Flat list of all visible widget ids across pages. Drives a SINGLE
  // SortableContext that wraps every page so dnd-kit's per-context
  // hover detection works ACROSS pages.
  const allFlatIds = useMemo(() => allFiltered.flatMap(p => p.widgets.map(w => w.id)), [allFiltered]);
  const pageCount = Math.max(1, allFiltered.length);
  // dnd-kit's SortableContext memoizes its strategy output by
  // [strategy, rects, activeIndex, overIndex, index]. Our over is
  // always a NON-sortable empty-cell droppable, so overIndex stays
  // at -1 forever and the memo doesn't reliably re-fire as the user
  // drags. Use a no-op strategy instead and project widgets via
  // React state below.
  const projectedLayoutStrategy = useMemo<SortingStrategy>(() => () => null, []);
  const [activePageIndex, setActivePageIndex] = useState(0);
  useEffect(() => {
    if (activePageIndex > pageCount - 1) setActivePageIndex(pageCount - 1);
  }, [activePageIndex, pageCount]);
  // Read in dnd handlers (edge-advance) without restarting the
  // pointermove subscription on every page change.
  const pageCountRef = useRef(pageCount);
  useEffect(() => { pageCountRef.current = pageCount; }, [pageCount]);
  // Active page index, mirrored into a ref so the custom collision
  // detector (built once via useMemo) can read it without rebuilding.
  // The detector locks the snap target to this page only - the pager's
  // edge-advance dwell handles cross-page navigation, the snap math
  // never picks a cell on a different page just because the dragged
  // widget's translated rect happens to be over there.
  const activePageIndexRef = useRef(activePageIndex);
  useEffect(() => { activePageIndexRef.current = activePageIndex; }, [activePageIndex]);
  // Frozen snapshot of the dragged cell's pixel size + the panel's
  // runtime CSS vars at drag start. Captured ONCE in onDragStart and
  // reused every overlay render so the floating clone never re-measures
  // mid-drag. Re-measuring would pick up post-pager-translate or
  // post-resize values and the clone scale would jitter 1-2 seconds in.
  type DragSnapshot = {
    id: string;
    width: number;
    height: number;
    cellSize: string;
    widgetScale: string;
    gap: string;
  };
  const [dragSnapshot, setDragSnapshot] = useState<DragSnapshot | null>(null);
  // Holds snapshot data captured at dnd-kit's onDragStart but NOT yet
  // promoted to the rendered state. Promotion happens on the first
  // onDragMove so the user sees no "lift" effect until they actually
  // start moving the finger - holding for the menu alone shows only
  // the menu, never the drag overlay.
  const pendingDragRef = useRef<DragSnapshot | null>(null);

  const dockWidgets = paginatedLayout.dock?.widgets ?? [];
  const dockOrientation: 'portrait' | 'landscape' = isLandscape ? 'landscape' : 'portrait';

  const widgetById = useCallback((id: string): PanelWidget | undefined => {
    for (const page of paginatedLayout.pages) {
      const found = page.widgets.find(w => w.id === id);
      if (found) return found;
    }
    return paginatedLayout.dock?.widgets.find(w => w.id === id);
  }, [paginatedLayout]);

  const editingWidget = editingWidgetId ? widgetById(editingWidgetId) ?? null : null;
  const editingWidgetSize = editingWidget?.size;
  // The QR pairing tray is for adding another device to a paired desktop,
  // which only makes sense from the native app or the bundled-localhost
  // dashboard. The browser-fallback panel (plain HTTP from a non-loopback
  // host) is itself the "no app installed" path - exposing a pair QR there
  // is confusing and reaches a feature the browser path can't deliver.
  const nativePairingAvailable =
    !isInsecureBrowserPanel() && (surface === 'phone' || nativeSettings.available);

  const onCellTap = useCallback((w: PanelWidget) => {
    if (simulator) {
      // Simulator: a tap opens this widget's settings in the parent modal.
      onSimulatorWidgetClicked?.(w.id);
      return;
    }
    if (embedded) {
      if (surface === 'desktop' && onSectionNavigate && isDashboardClickthroughType(w.type)) {
        onSectionNavigate(w.type);
      }
      return;
    }
    const def = lookupWidget(w.type);
    if (!def?.ImmersiveComponent) return;
    const orientationKey = isLandscape ? 'landscape' : 'portrait';
    if (!def.meta.supportsImmersive[orientationKey]) return;
    enterImmersive(w.id);
  }, [embedded, enterImmersive, isLandscape, onSectionNavigate, onSimulatorWidgetClicked, simulator, surface]);
  const touch = usePanelTouchMode({ onCellTap });
  const contextMenuWidgetId = surface === 'phone' && !sheetMode
    ? touch.ctxMenu?.widget.id ?? null
    : null;
  const connectionIntroBlocked = Boolean(
    sheetMode
      || trayOpen
      || touch.rearranging
      || touch.ctxMenu
      || dragArmedId
      || activeDragId
      || immersiveWidgetId,
  );
  const connectionIntroLabel = (() => {
    const label = t('panel.connectedTo');
    return label === 'panel.connectedTo' ? 'Connected to' : label;
  })();

  // Long-press on the empty panel background opens the actions tray, mirroring
  // the long-press-to-context-menu gesture on widgets. Only fires on kiosk-mode
  // surfaces (when the tray itself is rendered), only when not already in a
  // sheet / immersive / drag state, and only when the press target wasn't
  // inside a widget or interactive element.
  const backgroundLongPress = useLongPress(() => setTrayOpen(true), PANEL_CONTEXT_MENU_TRIGGER_MS);
  const backgroundPressBlocked = !kioskBehavior
    || !surfaceSupportsTouch(surface)
    || trayOpen
    || Boolean(sheetMode)
    || Boolean(immersiveWidgetId)
    || Boolean(activeDragId)
    || Boolean(dragArmedId)
    || isOffline
    || touch.rearranging;
  const handleBackgroundPointerDown = useCallback((e: React.PointerEvent) => {
    if (backgroundPressBlocked) return;
    if (!(e.target instanceof Element)) return;
    // Skip if the press landed on a widget, an interactive control, the bottom
    // tray itself, the page indicator, or any element that handles its own
    // press. The widget's own long-press (context menu) and the tray's swipe
    // handler keep their gestures intact.
    if (
      e.target.closest('[data-panel-widget-id]')
      || e.target.closest('button, input, select, textarea, a, [role="button"], [role="slider"], [role="switch"], [role="checkbox"], [role="tab"], [role="menuitem"], [role="option"]')
      || e.target.closest('[data-panel-scrollable="true"]')
    ) return;
    backgroundLongPress.onPointerDown(e);
  }, [backgroundPressBlocked, backgroundLongPress]);
  // Mouse right-click on the empty background is the desktop equivalent of
  // the touch long-press: same gating, same outcome (opens the bottom tray).
  // Suppresses the browser's native menu when it would otherwise fire on the
  // panel surface.
  const handleBackgroundContextMenu = useCallback((e: React.MouseEvent) => {
    if (backgroundPressBlocked) return;
    if (!(e.target instanceof Element)) return;
    if (
      e.target.closest('[data-panel-widget-id]')
      || e.target.closest('button, input, select, textarea, a, [role="button"], [role="slider"], [role="switch"], [role="checkbox"], [role="tab"], [role="menuitem"], [role="option"]')
      || e.target.closest('[data-panel-scrollable="true"]')
    ) return;
    e.preventDefault();
    setTrayOpen(true);
  }, [backgroundPressBlocked]);

  useEffect(() => {
    if (embedded || !loaded || isOffline || serviceStatus.state !== 'online') return;
    if (connectionIntroAnnouncedRef.current) return;
    const host = machineName.trim();
    if (!host) return;
    connectionIntroAnnouncedRef.current = true;
    if (connectionIntroBlocked) return;
    startConnectionIntro(host);
  }, [
    connectionIntroBlocked,
    embedded,
    isOffline,
    loaded,
    machineName,
    serviceStatus.state,
    startConnectionIntro,
  ]);
  useEffect(() => {
    if (!connectionIntroHost || !connectionIntroBlocked) return;
    clearConnectionIntro();
  }, [clearConnectionIntro, connectionIntroBlocked, connectionIntroHost]);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const finishSheetClose = useCallback(() => {
    closeTimerRef.current = null;
    setSheetMode(null);
    setSheetClosing(false);
    setEditingWidgetId(null);
    setSelectedMonitoringSlot(0);
    setEditorDockMotion(null);
  }, []);

  /* eslint-disable react-hooks/preserve-manual-memoization */
  const closeSheet = useCallback(() => {
    if (!sheetMode) return;
    const closingWidget = editingWidgetId && editingWidgetSize
      ? {
          id: editingWidgetId,
          type: '',
          size: editingWidgetSize,
          col: 0,
          row: 0,
        } satisfies PanelWidget
      : null;
    clearCloseTimer();
    setSheetClosing(true);
    setEditorDockMotion(prev => {
      if (!prev) return null;
      if (!editorDockSupported || sheetMode !== 'settings' || !closingWidget || prev.widgetId !== closingWidget.id) {
        return { ...prev, phase: 'closing' };
      }
      const targetRect = readEditorDockSlotRect(rootRef.current, closingWidget.id) ?? prev.sourceRect;
      return {
        ...prev,
        phase: 'closing',
        sourceRect: targetRect,
        style: buildEditorDockMotionStyle(rootRef.current, closingWidget, targetRect, surface),
      };
    });
    closeTimerRef.current = window.setTimeout(finishSheetClose, EDITOR_EXIT_MS);
  }, [clearCloseTimer, editingWidgetId, editingWidgetSize, editorDockSupported, finishSheetClose, sheetMode, surface]);
  /* eslint-enable react-hooks/preserve-manual-memoization */

  const openSheet = useCallback((mode: SheetMode) => {
    clearCloseTimer();
    setSheetClosing(false);
    setEditorDockMotion(null);
    setEditingWidgetId(null);
    setSelectedMonitoringSlot(0);
    setSheetMode(mode);
  }, [clearCloseTimer]);

  useEffect(() => {
    if (!embedded || openCatalogSignal === undefined) return;
    if (openCatalogSignal === lastCatalogSignalRef.current) return;
    if (!loaded) return;
    lastCatalogSignalRef.current = openCatalogSignal;
    openSheet('catalog');
  }, [embedded, loaded, openCatalogSignal, openSheet]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  // While the panel is offline, the editor / add-widget / context-menu sheets
  // can't act on anything; tear them down so connectivity recovery doesn't
  // resume mid-transition. Depending on the closeCtxMenu identity (a stable
  // useCallback from usePanelTouchMode) avoids re-firing on every render of
  // the touch state machine.
  const touchCloseCtxMenu = touch.closeCtxMenu;
  const hasCtxMenu = Boolean(touch.ctxMenu);
  useEffect(() => {
    if (!isOffline) return;
    connectionIntroAnnouncedRef.current = false;
    clearConnectionIntro();
    setTrayOpen(false);
    const handle = window.setTimeout(() => {
      clearCloseTimer();
      setSheetMode(null);
      setSheetClosing(false);
      setEditingWidgetId(null);
      setSelectedMonitoringSlot(0);
      setEditorDockMotion(null);
      if (hasCtxMenu) touchCloseCtxMenu();
    }, 0);
    return () => window.clearTimeout(handle);
  }, [isOffline, clearCloseTimer, clearConnectionIntro, hasCtxMenu, touchCloseCtxMenu]);

  // iOS swipes from the bottom edge to background the app. The trailing
  // events occasionally commit the actions tray, so it's already open
  // when the user returns. Close on hide (and pagehide as a belt-and-
  // braces signal for iOS Safari) rather than on restore so there's no
  // flash of the menu on return.
  useEffect(() => {
    const closeOnHide = () => {
      if (document.visibilityState !== 'hidden') return;
      setTrayOpen(false);
    };
    const closeOnPageHide = () => setTrayOpen(false);
    document.addEventListener('visibilitychange', closeOnHide);
    window.addEventListener('pagehide', closeOnPageHide);
    return () => {
      document.removeEventListener('visibilitychange', closeOnHide);
      window.removeEventListener('pagehide', closeOnPageHide);
    };
  }, []);

  const handleRetry = useCallback(() => {
    serviceStatus.retry();
    multiplex?.reconnect();
  }, [serviceStatus, multiplex]);

  // Scroll the most recently inserted widget into view once the sheet has
  // finished animating closed. Snaps the active page to the page that
  // contains it. The actual scrollIntoView is a no-op for cells already
  // visible inside the pager, but keeps drag-resize / context-menu
  // animations centred consistently.
  useEffect(() => {
    if (!pendingScrollId) return;
    if (sheetMode) return;
    const id = pendingScrollId;
    // Snap the active page to wherever the widget landed.
    const idx = allFiltered.findIndex(p => p.widgets.some(w => w.id === id));
    if (idx >= 0 && idx !== activePageIndex) setActivePageIndex(idx);
    const root = rootRef.current;
    if (!root) return;
    const target = root.querySelector<HTMLElement>(`[data-panel-widget-id="${id}"]`);
    if (!target) {
      const handle = window.setTimeout(() => setPendingScrollId(null), 0);
      return () => window.clearTimeout(handle);
    }
    const handle = window.setTimeout(() => {
      setPendingScrollId(null);
    }, 60);
    return () => window.clearTimeout(handle);
  }, [pendingScrollId, sheetMode, allFiltered, activePageIndex]);

  const addWidget = useCallback((type: string, size: PanelWidgetSize) => {
    const next: PanelWidget = {
      id: createUuid(),
      type,
      size,
      col: 0,
      row: 0,
    };
    // Dashboard is single-page: appendWidget no-ops if page 0 is full
    // instead of spawning a new page. Other surfaces keep multi-page.
    const dashboardSinglePage = embedded && surface === 'desktop';
    setLayout(appendWidget(paginatedLayout, next, capacity, { singlePage: dashboardSinglePage }));
    setPendingScrollId(next.id);
    closeSheet();
  }, [closeSheet, embedded, paginatedLayout, capacity, setLayout, surface]);

  const toggleDock = useCallback(() => {
    setLayout(setDockEnabled(paginatedLayout, !dockEnabled, capacity));
  }, [paginatedLayout, dockEnabled, capacity, setLayout]);

  const updateWidgetConfig = useCallback((widgetId: string, config: Record<string, PanelConfigValue>) => {
    setLayout(patchWidgetById(
      paginatedLayout,
      widgetId,
      w => ({ ...w, config: { ...w.config, ...config } }),
      capacity,
    ));
  }, [paginatedLayout, capacity, setLayout]);

  const resizeWidget = useCallback((widgetId: string, size: PanelWidgetSize, opts?: { animateFromContextMenu?: boolean }) => {
    const current = widgetById(widgetId);
    if (!current || current.size === size) return;

    // Try to fit the new size with siblings cascading across pages
    // (creating new ones up to MAX_PANEL_PAGES). If even that fails the
    // displaced widgets have nowhere to go, so the resize is rejected
    // outright and the user gets a flash on the widget instead of a
    // silent layout corruption.
    const next = tryResizeWidget(paginatedLayout, widgetId, size, capacity, MAX_PANEL_PAGES);
    if (!next) {
      triggerFlash(widgetId);
      return;
    }

    if (opts?.animateFromContextMenu) {
      beginResizeMotion(widgetId);
    }

    setLayout(next);
    // Keep the editor-dock motion attached to the current widget visual.
    setEditorDockMotion(prev => {
      if (!prev || prev.widgetId !== widgetId) return prev;
      const widgetWithNewSize: PanelWidget = { ...current, size };
      return {
        ...prev,
        style: buildEditorDockMotionStyle(rootRef.current, widgetWithNewSize, prev.sourceRect, surface),
      };
    });
  }, [beginResizeMotion, paginatedLayout, capacity, setLayout, surface, triggerFlash, widgetById]);

  const removeWidget = useCallback((widgetId: string) => {
    setLayout(removeWidgetById(paginatedLayout, widgetId, capacity));
    if (editingWidgetId === widgetId) {
      finishSheetClose();
    }
  }, [editingWidgetId, finishSheetClose, paginatedLayout, capacity, setLayout]);

  const openWidgetSettings = useCallback((widget: PanelWidget, point?: { x: number; y: number }) => {
    clearCloseTimer();
    const source = rootRef.current?.querySelector<HTMLElement>(`[data-panel-widget-id="${widget.id}"]`);
    const sourceRect = toEditorDockSourceRect(source?.getBoundingClientRect());
    setEditorDockMotion({
      widgetId: widget.id,
      phase: 'open',
      style: buildEditorDockMotionStyle(rootRef.current, widget, sourceRect, surface),
      sourceRect,
    });
    setSheetClosing(false);
    // Resolve initial sheet state (e.g. which monitoring slot is selected)
    // from where the context menu / right-click summoned the edit flow. Read
    // the DOM at the original press point before the dock animation has had
    // a chance to hoist the widget out of its grid position.
    const def = lookupWidget(widget.type);
    const initial = point && def?.resolveInitialSelection
      ? def.resolveInitialSelection({ point, widget })
      : undefined;
    setSelectedMonitoringSlot(initial?.selectedSlot ?? 0);
    setEditingWidgetId(widget.id);
    setSheetMode('settings');
  }, [clearCloseTimer, surface]);

  useEffect(() => {
    if (!editorDockSupported || sheetMode !== 'settings' || !editingWidget) return undefined;

    const updateEditorDockMotion = () => {
      setEditorDockMotion(prev => {
        if (!prev || prev.widgetId !== editingWidget.id) return prev;
        const sourceRect = readEditorDockSlotRect(rootRef.current, editingWidget.id) ?? prev.sourceRect;
        return {
          ...prev,
          sourceRect,
          style: buildEditorDockMotionStyle(rootRef.current, editingWidget, sourceRect, surface),
        };
      });
    };

    // Recompute on every editingWidget change (size picker in the edit drawer
    // updates widget.size, which arrives here as a new editingWidget reference)
    // so the dock cell tracks the new span instead of staying frozen at the
    // dimensions captured when the editor first opened.
    updateEditorDockMotion();

    const viewport = window.visualViewport;
    viewport?.addEventListener('resize', updateEditorDockMotion);
    window.addEventListener('resize', updateEditorDockMotion);
    window.addEventListener('orientationchange', updateEditorDockMotion);
    return () => {
      viewport?.removeEventListener('resize', updateEditorDockMotion);
      window.removeEventListener('resize', updateEditorDockMotion);
      window.removeEventListener('orientationchange', updateEditorDockMotion);
    };
  }, [editingWidget, editorDockSupported, sheetMode, surface]);

  // Delay-based activation matched to the context-menu trigger: drag
  // ARMS at the same instant the menu opens. iOS-style: hold to lift,
  // THEN drag. Tolerance:8 cancels the arming if the user moves past
  // 8px before the delay completes - so a quick horizontal swipe (the
  // pager engages at 8px too) takes the gesture instead of latching a
  // drag. Movement before the menu = navigation, never drag.
  // Note: arming != lifting. We defer the visual overlay (activeDragId,
  // dragSnapshot, source-cell hide) until the FIRST onDragMove so a
  // user who long-presses, gets the menu, then releases without
  // moving sees only the menu, never any "lift" effect.
  // Simulator uses distance activation so the user can drag a widget by
  // pressing-and-moving without first long-pressing into rearrange mode
  // like a real touch device. Tap still works for "open settings" because
  // it triggers no movement.
  const desktopActivation = surface === 'desktop' || simulator;
  const sensors = useSensors(
    useSensor(
      PointerSensor,
      desktopActivation
        ? { activationConstraint: { distance: 6 } }
        : { activationConstraint: { delay: PANEL_CONTEXT_MENU_TRIGGER_MS, tolerance: 8 } },
    ),
  );

  // Auto-advance the pager when the user dwells the dragged widget
  // near the left/right edge. iOS-style page-turn assist: enter the
  // edge zone, hold ~600ms, the pager advances. Re-arming requires
  // leaving the edge zone and re-entering, so the user can park near
  // an edge briefly without runaway page churn.
  const EDGE_ADVANCE_PX = 64;
  const EDGE_ADVANCE_DWELL_MS = PANEL_EDGE_ADVANCE_DWELL_MS;
  const edgeAdvanceRef = useRef<{
    side: 'left' | 'right' | null;
    timer: number | null;
  }>({ side: null, timer: null });
  const clearEdgeAdvance = useCallback(() => {
    if (edgeAdvanceRef.current.timer !== null) {
      window.clearTimeout(edgeAdvanceRef.current.timer);
      edgeAdvanceRef.current.timer = null;
    }
    edgeAdvanceRef.current.side = null;
  }, []);
  const handleDndDragMove = useCallback((event: DragMoveEvent) => {
    // Drag visuals (lift, source-cell hide, menu dismiss) only engage
    // once the user has moved past PANEL_DRAG_START_THRESHOLD_PX from
    // the long-press anchor. Mirrors the same floor the collision
    // detector applies (see buildPanelCollisionDetection); both must
    // arm together so visuals and over resolution stay in sync. Below
    // threshold = "menu only" so a small finger jiggle right after the
    // long-press does not accidentally launch a drag.
    const movedPastThreshold =
      event.delta.x * event.delta.x + event.delta.y * event.delta.y
      >= PANEL_DRAG_START_THRESHOLD_PX * PANEL_DRAG_START_THRESHOLD_PX;
    if (pendingDragRef.current && !movedPastThreshold) return;

    if (pendingDragRef.current) {
      const snap = pendingDragRef.current;
      pendingDragRef.current = null;
      setActiveDragId(snap.id);
      setDragSnapshot(snap);
    }
    touch.handleDragMove();
    const rect = event.active.rect.current.translated;
    if (!rect) {
      clearEdgeAdvance();
      return;
    }
    const centerX = (rect.left + rect.right) / 2;
    const viewportWidth = window.innerWidth;
    const inLeft = centerX < EDGE_ADVANCE_PX;
    const inRight = centerX > viewportWidth - EDGE_ADVANCE_PX;
    const desiredSide: 'left' | 'right' | null = inLeft ? 'left' : inRight ? 'right' : null;
    if (desiredSide === edgeAdvanceRef.current.side) return;
    clearEdgeAdvance();
    edgeAdvanceRef.current.side = desiredSide;
    if (!desiredSide) return;
    edgeAdvanceRef.current.timer = window.setTimeout(() => {
      edgeAdvanceRef.current.timer = null;
      // Leave `side` latched: the next onDragMove with the cursor
      // still in this edge band short-circuits via desiredSide === side.
      // clearEdgeAdvance() unlatches when the cursor leaves the band
      // or the drag ends. Without this, the pager would advance one
      // page every dwell interval until the user lifted off the edge.
      // Clamp at the ends is intentional - side stays latched even on
      // a no-op clamp so the user can keep pressing without re-arming.
      setActivePageIndex(prev => {
        const count = pageCountRef.current;
        if (desiredSide === 'left') return Math.max(0, prev - 1);
        return Math.min(count - 1, prev + 1);
      });
    }, EDGE_ADVANCE_DWELL_MS);
  }, [clearEdgeAdvance, touch]);
  // Gesture refs for the collision detector: PANEL_DRAG_START_THRESHOLD_PX
  // is gated off the cursor's distance from this anchor, so we capture
  // wherever dnd-kit thinks the press began. lastOverId provides
  // hysteresis - the over only flips when the cursor clearly leaves
  // the previous over's hysteresis band.
  const dragGestureRef = useRef<DragGestureState>({ startX: 0, startY: 0, lastOverId: null });
  // Live `over` droppable id, updated each onDragOver. The drag
  // projection strategy reads this so it can compute the iOS make-
  // room preview without depending on dnd-kit's overIndex (which is
  // -1 when the cursor is over an empty-cell droppable, since those
  // are not in the SortableContext items list).
  const currentOverIdRef = useRef<string | null>(null);
  const panelCollisionDetection = useMemo(
    () => buildPanelCollisionDetection(dragGestureRef, activePageIndexRef),
    [],
  );

  // Tick that increments whenever the over target changes. The
  // highlight overlay reads from currentOverIdRef but needs a render
  // signal to repaint - we don't want a state setter on the hot
  // pointer-move path because the strategy uses the ref directly.
  const [overIdTick, setOverIdTick] = useState(0);
  const handleDndDragOver = useCallback((event: DragOverEvent) => {
    const next = event.over ? String(event.over.id) : null;
    if (next !== currentOverIdRef.current) {
      currentOverIdRef.current = next;
      setOverIdTick(n => n + 1);
    }
  }, []);

  // Drag preview layout: recomputed every time the over target moves
  // to a new cell. Each cell reads its own (col, row) from this and
  // animates from its committed position to the preview position via
  // an inline transform. This is what produces the "make-room"
  // feel - widgets whose rects overlap the dragged widget cascade
  // into the next free aligned cell while the drag is in flight,
  // then commit on drop. Bypasses dnd-kit's SortableContext strategy
  // which doesn't re-fire reliably with non-sortable empty droppables.
  const [previewLayout, setPreviewLayout] = useState<PanelLayout | null>(null);
  useEffect(() => {
    if (!activeDragId) { setPreviewLayout(null); return; }
    const overId = currentOverIdRef.current;
    if (!overId) { setPreviewLayout(null); return; }
    const active = widgetById(activeDragId);
    if (!active) { setPreviewLayout(null); return; }
    // Use dragLayout (with phantom trailing page) so previewDrag can
    // resolve the new-page id when the user is hovering over it.
    const target = parseDragTarget(overId, dragLayout, active);
    if (!target) { setPreviewLayout(null); return; }
    const preview = previewDrag(
      dragLayout,
      activeDragId,
      target.pageId,
      target.col,
      target.row,
      capacity,
    );
    setPreviewLayout(preview);
  }, [overIdTick, activeDragId, dragLayout, capacity, widgetById]);

  const handleDndDragStart = useCallback((event: DragStartEvent) => {
    const id = String(event.active.id);
    // Prime the over to the active's home cell so the highlight is
    // visible from t=0. onDragOver only fires when over CHANGES, so
    // without priming, the user sees no highlight until they cross a
    // cell boundary.
    const widget = widgetById(id);
    const pageId = paginatedLayout.pages.find(p => p.widgets.some(w => w.id === id))?.id;
    if (widget && pageId) {
      const seed = `empty:${pageId}:${widget.col}:${widget.row}`;
      currentOverIdRef.current = seed;
      setOverIdTick(n => n + 1);
    }
    // Mint a phantom trailing page so the user can drag onto a new
    // empty page if room is available. Skipped when:
    //  - Dashboard (single-page surface; phantom would let the user
    //    create a new page via drag and we removed that capability).
    //  - At MAX_PANEL_PAGES already.
    //  - The existing last page is empty (free trailing page exists).
    //  - The active widget's source page has only the active widget
    //    on it. Allowing the phantom there means the user moves the
    //    single widget across, leaving the source page empty and the
    //    new page with one widget - a net no-op page count, which
    //    isn't what "create a new page" should mean.
    const dashboardSinglePage = embedded && surface === 'desktop';
    if (!dashboardSinglePage && paginatedLayout.pages.length < MAX_PANEL_PAGES) {
      const lastPage = paginatedLayout.pages[paginatedLayout.pages.length - 1];
      const sourcePage = paginatedLayout.pages.find(p => p.widgets.some(w => w.id === id));
      const sourceHasOthers = sourcePage ? sourcePage.widgets.length > 1 : false;
      if ((!lastPage || lastPage.widgets.length > 0) && sourceHasOthers) {
        setDragExtraPageId(createUuid());
      }
    }
    // Mark the drag as armed immediately so competing gestures
    // (tray-swipe, page-swipe) get gated off before the user's first
    // motion. Overlay visuals stay deferred to onDragMove.
    setDragArmedId(id);
    const source = rootRef.current?.querySelector<HTMLElement>(`[data-panel-widget-id="${id}"]`);
    const layoutW = source?.offsetWidth ?? 0;
    const layoutH = source?.offsetHeight ?? 0;
    const rootStyle = rootRef.current ? getComputedStyle(rootRef.current) : null;
    const liveGap = rootStyle?.getPropertyValue('--panel-gap').trim() || '8px';
    const liveWidgetScale = rootStyle?.getPropertyValue('--panel-widget-scale').trim() || '1';
    if (layoutW > 0 && layoutH > 0) {
      const widget = widgetById(id);
      const span = widget ? sizeToSpan(widget.size) : { cols: 1, rows: 1 };
      const gapPx = Number.parseFloat(liveGap) || 8;
      const cellSizePx = (layoutW - (span.cols - 1) * gapPx) / span.cols;
      pendingDragRef.current = {
        id,
        width: layoutW,
        height: layoutH,
        cellSize: `${cellSizePx}px`,
        widgetScale: liveWidgetScale,
        gap: liveGap,
      };
    } else {
      pendingDragRef.current = null;
    }
    // Capture the press anchor so the collision detector can apply
    // its minimum-movement floor. activatorEvent is the original
    // pointerdown that armed the drag - using its coords means a
    // sub-threshold finger jiggle after the long-press will not
    // shuffle anything.
    const ae = event.activatorEvent as PointerEvent | MouseEvent | TouchEvent;
    let startX = 0;
    let startY = 0;
    if ('clientX' in ae && typeof (ae as PointerEvent).clientX === 'number') {
      startX = (ae as PointerEvent).clientX;
      startY = (ae as PointerEvent).clientY;
    } else if ('touches' in ae && (ae as TouchEvent).touches.length > 0) {
      const t = (ae as TouchEvent).touches[0];
      startX = t.clientX;
      startY = t.clientY;
    }
    dragGestureRef.current = { startX, startY, lastOverId: null };
    touch.handleDragStart();
    // Publish the drag to the sidebar for cross-zone pin pickup. Gated
    // by surface so panel-kiosk drags never tickle the dashboard's
    // pinned-apps state (the panel can't see a sidebar anyway, but the
    // context provider may exist higher up via the simulator iframe).
    // Also skip when the widget is already pinned — the drop would be a
    // no-op and the indicator would confuse the user.
    if (embedded && surface === 'desktop' && widget && isPinnableAppKey(widget.type)
        && !pinnedTail.includes(widget.type)) {
      setDraggingPinnableType(widget.type);
    }
  }, [paginatedLayout, touch, widgetById, embedded, surface, setDraggingPinnableType, pinnedTail]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={panelCollisionDetection}
      // Re-measure droppables on every render while dragging. Without
      // this, dnd-kit caches drop targets at drag-start and the
      // pager's auto-advance would translate the active page's cells
      // to new viewport positions that dnd-kit still believes sit
      // where they were at drag-start - drops on a new page would
      // either miss or land on the wrong widget.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDndDragStart}
      onDragMove={handleDndDragMove}
      onDragOver={handleDndDragOver}
      onDragCancel={() => {
        clearEdgeAdvance();
        currentOverIdRef.current = null;
        setActiveDragId(null);
        setDragArmedId(null);
        setDragSnapshot(null);
        setDragExtraPageId(null);
        pendingDragRef.current = null;
        dragGestureRef.current = { startX: 0, startY: 0, lastOverId: null };
        if (touch.rearranging) touch.toggleRearrange();
        touch.handleDragEnd();
        setDraggingPinnableType(null);
      }}
      onDragEnd={event => {
        clearEdgeAdvance();
        const activeId = String(event.active.id);
        const overId = event.over ? String(event.over.id) : null;
        // Capture the current dragLayout BEFORE clearing the phantom
        // page state. dragLayout is what previewDrag knows about; if
        // we cleared dragExtraPageId first, dragLayout would lose the
        // phantom page mid-flight and previewDrag could not resolve
        // the new-page id.
        const layoutForDrop = dragLayout;
        // Invoke the sidebar's drop committer BEFORE clearing the
        // drag state. React 19 flushes setDraggingPinnableType(null)
        // synchronously inside this event handler, which unmounts
        // SidebarPinDropTarget and detaches its document pointerup
        // listener before pointerup propagates to it. So we commit the
        // pin imperatively here while the sidebar's state is still live.
        sidebarDropHandlerRef.current?.();
        currentOverIdRef.current = null;
        setActiveDragId(null);
        setDragArmedId(null);
        setDragSnapshot(null);
        setDragExtraPageId(null);
        pendingDragRef.current = null;
        dragGestureRef.current = { startX: 0, startY: 0, lastOverId: null };
        if (touch.rearranging) touch.toggleRearrange();
        touch.handleDragEnd();
        setDraggingPinnableType(null);
        if (!overId || activeId === overId) return;
        const activeWidget = widgetById(activeId);
        if (!activeWidget) return;
        const target = parseDragTarget(overId, layoutForDrop, activeWidget);
        if (!target) return;
        const preview = previewDrag(
          layoutForDrop,
          activeId,
          target.pageId,
          target.col,
          target.row,
          capacity,
        );
        if (!preview) return;
        // No-op short-circuit: drop at source cell on the same page.
        if (preview === layoutForDrop) return;
        // Drop the phantom page if the user did NOT actually land on
        // it - we don't want an empty trailing page persisted just
        // because it was rendered during the drag. Trim trailing
        // empty pages but keep at least one.
        const trimmed = trimTrailingEmptyPages(preview);
        setLayout(trimmed);
      }}
    >
      <div
        ref={rootRef}
        className={`panel-root ${styles.panelRoot}`}
        data-theme={resolvedThemeMode}
        data-surface={surface}
        data-background-mode={embedded ? 'solid' : effectiveTheme.backgroundMode}
        data-show-widget-labels={effectiveTheme.widgetLabels ? 'true' : 'false'}
        data-context-menu-open={contextMenuWidgetId ? 'true' : undefined}
        data-editing={surface === 'phone' && sheetMode === 'settings' ? 'true' : undefined}
        data-connection-intro={connectionIntroHost ? 'active' : undefined}
        data-simulator-selected={simulator && simulatorSelectedWidgetId ? simulatorSelectedWidgetId : undefined}
        style={panelRootStyle}
        onClick={simulator ? (e) => {
          // Background click: bubbles to the panel-root only when the
          // event passed through every empty area without being stopped.
          // Forward to the parent so it closes its settings pane.
          if (e.target === e.currentTarget) onSimulatorBackgroundClicked?.();
        } : undefined}
        onPointerDown={handleBackgroundPointerDown}
        onPointerMove={backgroundLongPress.onPointerMove}
        onPointerUp={backgroundLongPress.onPointerUp}
        onPointerCancel={backgroundLongPress.onPointerCancel}
        onContextMenu={handleBackgroundContextMenu}
      >
        {(!embedded || simulator) && effectiveTheme.backgroundMode === 'shader' && (
          <PanelBackgroundShader
            effect={effectiveTheme.backgroundEffect}
            template={effectiveTheme.backgroundTemplate}
            opacity={effectiveTheme.backgroundOpacity}
          />
        )}
        {!loaded ? (
          <div className={styles.loading}>loading panel...</div>
        ) : (
          <>
            <div
              className={styles.panelStage}
              data-orientation={dockOrientation}
              data-dock-active={dockActive ? 'true' : undefined}
            >
              <div className={styles.panelStagePages}>
                <SortableContext items={allFlatIds} strategy={projectedLayoutStrategy}>
                <PanelPager
                  pages={allFiltered}
                  activeIndex={Math.min(activePageIndex, pageCount - 1)}
                  onActiveChange={setActivePageIndex}
                  swipeEnabled={!sheetMode && !dragArmedId}
                  renderPage={page => (
                    <>
                      <div
                        data-panel-grid
                        className={`${styles.grid} ${touch.rearranging ? styles.gridRearranging : ''}`}
                        onClick={touch.handleGridClick}
                      >
                        {page.widgets.map(w => (
                          <ErrorBoundary key={w.id} label={w.type}>
                            <PanelTouchCell
                              widget={w}
                              surface={surface}
                              rearranging={touch.rearranging}
                              pressHint={surface === 'phone' && !sheetMode && (touch.pressedWidgetId === w.id || contextMenuWidgetId === w.id)}
                              dimmed={Boolean(contextMenuWidgetId) && contextMenuWidgetId !== w.id}
                              editorDockMotion={editorDockSupported && sheetMode === 'settings' && editorDockMotion?.widgetId === w.id ? editorDockMotion : null}
                              editorDockPortal={editorDockPortalEl}
                              flash={flashedWidgets.has(w.id)}
                              isDragSource={activeDragId === w.id}
                              resizeMotion={!sheetMode && resizeMotionWidgetId === w.id}
                              selectedSlot={sheetMode === 'settings' && editingWidgetId === w.id && w.type === 'monitoring' ? selectedMonitoringSlot : undefined}
                              onSelectSlot={sheetMode === 'settings' && editingWidgetId === w.id && w.type === 'monitoring' ? setSelectedMonitoringSlot : undefined}
                              clickthrough={embedded && surface === 'desktop' && Boolean(onSectionNavigate) && isDashboardClickthroughType(w.type)}
                              onContextMenu={surfaceSupportsTouch(surface) ? e => touch.handleContextMenu(e, w) : (e => e.preventDefault())}
                              onRearrangeTap={surfaceSupportsTouch(surface) ? touch.handleRearrangeTap : noopMouseHandler}
                              cellPointers={surfaceSupportsTouch(surface) ? touch.bindCellPointers(w) : noopCellPointers}
                              // Non-touch simulator surfaces (Q-series) can't reach onCellTap
                              // through the pointer/long-press pipeline. Wire a plain click
                              // so the user can tap the rendered widget in the device-page
                              // iframe to open its edit sheet.
                              onSimulatorClick={simulator && !surfaceSupportsTouch(surface) ? () => onSimulatorWidgetClicked?.(w.id) : undefined}
                              previewLayout={previewLayout}
                              anyDragging={Boolean(activeDragId)}
                              onSectionNavigate={embedded && surface === 'desktop' ? onSectionNavigate : undefined}
                              onConfigureWidget={openWidgetSettings}
                            />
                          </ErrorBoundary>
                        ))}
                        {activeDragId && allCellsForPage(page, capacity).map(cell => (
                          <EmptyCellDroppable
                            key={`${page.id}:${cell.col}:${cell.row}`}
                            pageId={page.id}
                            col={cell.col}
                            row={cell.row}
                          />
                        ))}
                        {activeDragId ? (
                          <DragTargetHighlight
                            pageId={page.id}
                            activeWidgetId={activeDragId}
                            paginatedLayout={paginatedLayout}
                            overIdSignal={overIdTick}
                            overIdRef={currentOverIdRef}
                          />
                        ) : null}
                      </div>
                    </>
                  )}
                />
                </SortableContext>
                {pageCount > 1 && (
                  <div className={styles.panelPageIndicatorPosition} data-orientation={dockOrientation}>
                    <PanelPageIndicator
                      total={pageCount}
                      active={Math.min(activePageIndex, pageCount - 1)}
                      visibilityToken={activePageIndex}
                    />
                  </div>
                )}
              </div>
              {dockActive && (
                <div className={styles.panelDockPosition} data-orientation={dockOrientation}>
                  <PanelDock
                    widgets={dockWidgets}
                    surface={surface}
                    orientation={dockOrientation}
                  />
                </div>
              )}
            </div>
            {kioskBehavior && surfaceSupportsTouch(surface) && (
              <PanelActionsTray
                open={trayOpen}
                onOpen={() => setTrayOpen(true)}
                onClose={() => setTrayOpen(false)}
                onAddWidget={() => openSheet('catalog')}
                onSettings={() => openSheet('panelSettings')}
                onPair={nativePairingAvailable ? nativeSettings.open : undefined}
                pairAvailable={nativePairingAvailable}
                surfaceRef={rootRef}
                disabled={Boolean(sheetMode) || isOffline || touch.rearranging || !!dragArmedId}
                machineName={machineName}
              />
            )}
            <div ref={setEditorDockPortalEl} className={styles.editorDockPortal} aria-hidden="true" />
            {connectionIntroHost && (
              <>
                <div className={styles.connectionIntroBackdrop} aria-hidden="true" />
                <div className={styles.connectionIntroTray} role="status" aria-live="polite">
                  <span className={styles.connectionIntroLabel}>{connectionIntroLabel}</span>
                  <span className={styles.connectionIntroName}>{connectionIntroHost}</span>
                </div>
              </>
            )}
          </>
        )}
      </div>

      {touch.ctxMenu && (() => {
        const def = lookupWidget(touch.ctxMenu.widget.type);
        if (!def) return null;
        const orientationKey = isLandscape ? 'landscape' : 'portrait';
        const immersiveAvailable = Boolean(def.ImmersiveComponent)
          && def.meta.supportsImmersive[orientationKey];
        const ctxWidget = touch.ctxMenu.widget;
        const ctxPoint = { x: touch.ctxMenu.x, y: touch.ctxMenu.y };
        const desktopPinAvailable = embedded && surface === 'desktop';
        // "Pin to Sidebar" is desktop-only and is only meaningful for
        // widget types whose SPA view exists (PINNABLE_APP_KEYS). Hidden
        // when the widget type is already in the user's tail.
        const pinnableKey = isPinnableAppKey(ctxWidget.type) ? ctxWidget.type : null;
        const sidebarPinAvailable = embedded
          && surface === 'desktop'
          && pinnableKey !== null
          && !pinnedTail.includes(pinnableKey);
        return (
          <WidgetContextMenu
            x={ctxPoint.x}
            y={ctxPoint.y}
            currentSize={ctxWidget.size}
            sizes={sizesForSurface(def.meta, surface)}
            hasConfig
            surface={surface}
            themeMode={resolvedThemeMode}
            themeStyle={panelThemeVars}
            isRearranging={touch.rearranging}
            onResize={size => resizeWidget(ctxWidget.id, size, { animateFromContextMenu: true })}
            onEdit={() => openWidgetSettings(ctxWidget, ctxPoint)}
            onRemove={() => removeWidget(ctxWidget.id)}
            onRearrange={touch.toggleRearrange}
            onImmersive={!embedded && immersiveAvailable ? () => enterImmersive(ctxWidget.id) : undefined}
            onAddToDesktop={desktopPinAvailable ? () => {
              void createOverlayWidget({
                type: ctxWidget.type,
                size: ctxWidget.size,
                config: ctxWidget.config,
              });
            } : undefined}
            onPinToSidebar={sidebarPinAvailable && pinnableKey ? () => {
              updateUiSettings({
                pinnedSidebarApps: [...pinnedTail, pinnableKey],
              });
            } : undefined}
            onClose={touch.closeCtxMenu}
          />
        );
      })()}

      {kioskBehavior && (() => {
        if (!immersiveWidgetId) return null;
        const w = widgetById(immersiveWidgetId);
        if (!w) return null;
        const def = lookupWidget(w.type);
        const Comp = def?.ImmersiveComponent;
        if (!Comp) return null;
        // key forces a fresh mount each open/close cycle so any
        // internal state in the overlay (mountState, swipe offset)
        // never carries over from a previous session.
        return (
          <PanelImmersiveOverlay
            key={`${immersiveWidgetId}-${immersiveOpenCounter}`}
            open
            onExit={handleImmersiveExit}
            themeStyle={panelRootStyle}
            themeMode={resolvedThemeMode}
            surface={surface}
          >
            <Comp
              widget={w}
              surface={surface}
              immersiveGrid={{ columns: runtimeGrid.columns, rows: runtimeGrid.rows }}
            />
          </PanelImmersiveOverlay>
        );
      })()}

      {sheetMode && (
        <PanelEditorSheet
          mode={sheetMode}
          surface={surface}
          editingWidget={sheetMode === 'settings' ? editingWidget : null}
          panelTheme={panelTheme.theme}
          gridColumns={runtimeGrid.columns}
          gridRows={runtimeGrid.rows}
          resolvedThemeMode={resolvedThemeMode}
          panelThemeStyle={panelThemeVars}
          closing={sheetClosing}
          onClose={closeSheet}
          onThemeSyncCommit={panelTheme.commitThemeSync}
          onThemeModeCommit={panelTheme.commitThemeMode}
          onThemeAccentSyncCommit={panelTheme.commitAccentSync}
          onThemeAccentPreview={panelTheme.previewAccent}
          onThemeAccentCommit={panelTheme.commitAccent}
          onThemeBackgroundPreview={panelTheme.previewBackground}
          onThemeBackgroundCommit={panelTheme.commitBackground}
          onThemeBackgroundModeCommit={panelTheme.commitBackgroundMode}
          onThemeBackgroundEffectCommit={panelTheme.commitBackgroundEffect}
          onThemeBackgroundTemplateCommit={panelTheme.commitBackgroundTemplate}
          onThemeBackgroundOpacityPreview={panelTheme.previewBackgroundOpacity}
          onThemeBackgroundOpacityCommit={panelTheme.commitBackgroundOpacity}
          onThemeWidgetOpacityPreview={panelTheme.previewWidgetOpacity}
          onThemeWidgetOpacityCommit={panelTheme.commitWidgetOpacity}
          onThemeWidgetLabelsCommit={panelTheme.commitWidgetLabels}
          machineName={machineName}
          onMachineNameCommit={onMachineNameCommit}
          onAdd={addWidget}
          onResize={resizeWidget}
          onUpdate={updateWidgetConfig}
          onRemove={removeWidget}
          selectedMonitoringSlot={selectedMonitoringSlot}
          onSelectedMonitoringSlotChange={setSelectedMonitoringSlot}
          dockSupported={dockSupported}
          dockEnabled={dockEnabled}
          onDockToggle={toggleDock}
        />
      )}

      {kioskBehavior && (
        <PanelOfflineOverlay
          state={serviceStatus.state}
          surface={surface}
          resolvedThemeMode={resolvedThemeMode}
          themeStyle={panelThemeVars}
          nativeBridgeAvailable={nativeSettings.available}
          nextAttemptAt={multiplex?.nextAttemptAt ?? null}
          remoteDisabled={multiplex?.remoteDisabled ?? false}
          onRetry={handleRetry}
          onOpenNativePairing={nativeSettings.open}
        />
      )}
      <DragOverlay dropAnimation={null}>
        {(() => {
          if (!activeDragId || !dragSnapshot) return null;
          const w = widgetById(activeDragId);
          if (!w) return null;
          const overlayStyle: CSSProperties = {
            ...panelRootStyle,
            '--panel-cell-size': dragSnapshot.cellSize,
            '--panel-content-scale': dragSnapshot.cellSize,
            '--panel-row-size': dragSnapshot.cellSize,
            '--panel-widget-scale': dragSnapshot.widgetScale,
            '--panel-gap': dragSnapshot.gap,
            // panelRootStyle paints the panel surface bg on the wrapper.
            // The DragOverlay is portaled to body, so a solid wrapper bg
            // would render the floating clone as an opaque rectangle
            // sitting on top of the panel - the clone's translucent
            // .panel-card and its backdrop-filter are then layered over
            // a flat color instead of the actual surface (with shader,
            // gradient, etc.) showing through. Force transparent so the
            // clone reads identically to the in-grid cell.
            background: 'transparent',
            '--panel-background-solid': 'transparent',
          } as CSSProperties;
          return (
            <PanelDragOverlayCell
              widget={w}
              surface={surface}
              themeStyle={overlayStyle}
              themeMode={resolvedThemeMode}
              fixedWidth={dragSnapshot.width}
              fixedHeight={dragSnapshot.height}
            />
          );
        })()}
      </DragOverlay>
    </DndContext>
  );
}
