import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { Lock, SatelliteDish } from 'lucide-react';
import {
  DndContext, DragOverlay, MeasuringStrategy, PointerSensor,
  useSensor, useSensors,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, type SortingStrategy } from '@dnd-kit/sortable';
import { Spinner } from '../components/common/Spinner/Spinner';
import { usePanelLayout } from './engine/usePanelLayout';
import { useDashboardLayout } from './engine/useDashboardLayout';
import { useOemAppSeed } from './engine/useOemAppSeed';
import { useFlashWidgets } from './engine/useFlashWidgets';
import { useAddedWidgetEntrance } from './engine/useAddedWidgetEntrance';
import { useMachineName } from './engine/useMachineName';
import { useEdgeAdvance } from './engine/useEdgeAdvance';
import { usePageSync } from './engine/usePageSync';
import { useConnectionIntro } from './engine/useConnectionIntro';
import { useHomeIntro } from './engine/useHomeIntro';
import { PANEL_CONTEXT_MENU_TRIGGER_MS, usePanelTouchMode } from './engine/usePanelTouchMode';
import { useLongPress } from './engine/useLongPress';
import { usePanelTextSelectionGuard } from './engine/usePanelTextSelectionGuard';
import { usePanelViewportLock } from './engine/usePanelViewportLock';
import { sizeToSpan } from './engine/grid';
import { repaginatePanelLayout, type PaginateCapacity } from './engine/paginate';
import {
  allCellsForPage,
  appendWidget,
  patchWidgetById,
  previewDrag,
  removeWidgetById,
  tryResizeWidget,
} from './engine/panelLayoutOps';
import { useWidgetResizeMotion } from './engine/useWidgetResizeMotion';
import { PanelPager } from './chrome/PanelPager';
import { PanelPageIndicator } from './chrome/PanelPageIndicator';
import { PanelActionsTray } from './chrome/PanelActionsTray';
import { PanelImmersiveOverlay } from './overlays/PanelImmersiveOverlay';
import { lookupApp, sizesForSurface, appAvailableForSurface } from './widgets/registry';
import type { DeckEditView } from './widgets/types';
import { WidgetContextMenu } from './widgets/common/WidgetContextMenu';
import { createOverlayWidget, deleteOverlayWidget, listOverlayWidgets } from '../api/overlay';
import { ErrorBoundary } from '../components/common/ErrorBoundary/ErrorBoundary';
import { ConfirmModal } from '../components/common/ConfirmModal/ConfirmModal';
import { useMultiplex, useTopic, useTopicCallback } from '../hooks/useMultiplexSocket';
import { useServiceStatus, HOST_DISPLAY_OFFLINE_GRACE_MS } from '../hooks/useServiceStatus';
import { wiredPanelClass } from './device/wiredPanel';
import { useUiSettings } from '../hooks/useUiSettings';
import {
  isPinnableAppKey,
  sanitizePinnedTail,
} from '../app/sidebarApps';
import { useCrossZoneDrag } from '../app/CrossZoneDrag';
import { PanelOfflineOverlay } from './overlays/PanelOfflineOverlay';
import { isInsecureBrowserPanel } from './overlays/PanelInsecureBanner';
import { useTranslation } from '../lib/i18n';
import { applyHtmlChromeTheme } from '../lib/settings';
import { fetchPanelDevice } from '../api/panel';
import { isRemotePaired } from '../api/service';
import { createUuid } from '../lib/uuid';
import { spawnDropRing } from '../lib/dropRing';
import {
  type PanelConfigValue,
  type PanelLayout,
  type PanelSurface,
  type PanelWidget,
  type PanelWidgetSize,
} from './types';
import { isSingleWidgetSurface, surfaceSupportsTouch } from './types';
import { q60OfflineClockPages } from './engine/q60OfflineClock';
import { inferSurfaceFromViewport } from './device/inferSurface';
import { PanelBackgroundShader } from './background/PanelBackgroundShader';
import { PanelBackgroundMedia } from './background/PanelBackgroundMedia';
import { resolvePanelBackground } from './background/panelBackground';
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
  parseDragTarget,
  trimTrailingEmptyPages,
} from './engine/panelLayoutHelpers';
import {
  DESKTOP_ACTION_TRAY_HEIGHT,
  MAX_PANEL_PAGES,
  PHONE_WIDGET_REFERENCE_CELL,
  useRuntimePanelGrid,
  usePanelPageScrollLock,
} from './engine/panelGrid';
import {
  useIsLandscape,
  usePhoneContentScale,
  usePhonePanelManifest,
} from './device/panelPhone';
import { useNativeSettingsBridge } from './device/panelNativeBridge';
import {
  type EditorDockMotion,
  buildEditorDockMotionStyle,
  readEditorDockSlotRect,
  toEditorDockSourceRect,
} from './editor/panelEditorDock';
import {
  buildEmbeddedPanelThemeVars,
  buildPanelThemeVars,
  useDocumentResolvedThemeMode,
  usePanelLanguageSync,
  usePanelTheme,
  useResolvedPanelThemeMode,
} from './theme/panelTheme';
import { PanelEditorSheet, type SheetMode } from './editor/PanelEditorSheet';
import {
  DragTargetHighlight,
  EmptyCellDroppable,
  PanelDragOverlayCell,
  PanelTouchCell,
} from './dnd/PanelDragCells';

// Window during which the closing keyframe (or hand-driven swipe glide) plays
// before the editor sheet unmounts. Matches the SETTLE_MS / settling transition
// in usePanelSheetSwipe so a swipe-dismiss completes its glide before the tree
// is removed.
const EDITOR_EXIT_MS = 240;
const WIDGET_RESIZE_MOTION_MS = 220;

interface PanelLayoutState {
  layout: PanelLayout;
  loaded: boolean;
  setLayout: (next: PanelLayout) => void;
}


export default function PanelApp({ deviceId }: { deviceId: string }) {
  // Resolve the device record once on mount; the surface + touch capability
  // stamped on it drive widget filtering. If the record is missing on the
  // server (cleared profile etc.), fall back to a viewport-inferred surface
  // so the panel still mounts instead of showing a blank page.
  const [resolved, setResolved] = useState<{ surface: PanelSurface; touch?: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetchPanelDevice(deviceId).then(record => {
      if (cancelled) return;
      const surfaceFromRecord = record?.capabilities?.surface;
      setResolved({
        surface: surfaceFromRecord ?? inferSurfaceFromViewport(false),
        touch: record?.capabilities?.touch,
      });
    }).catch(() => {
      if (!cancelled) setResolved({ surface: inferSurfaceFromViewport(false) });
    });
    return () => { cancelled = true; };
  }, [deviceId]);
  if (!resolved) {
    return null;
  }
  return <PanelKioskContent deviceId={deviceId} surface={resolved.surface} deviceTouch={resolved.touch} />;
}
export function PanelEmbeddedContent({ openCatalogSignal = 0, appAccentColor, onSectionNavigate }: {
  openCatalogSignal?: number;
  appAccentColor?: string;
  onSectionNavigate?: DashboardSectionNavigate;
}) {
  const layoutState = useDashboardLayout();
  return (
    <ErrorBoundary
      // eslint-disable-next-line i18next/no-literal-string -- crash-boundary diagnostic id
      label="Dashboard"
    >
      <PanelContent
        // eslint-disable-next-line i18next/no-literal-string -- panel surface enum
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

function PanelKioskContent({ deviceId, surface, deviceTouch }: { deviceId: string; surface: PanelSurface; deviceTouch?: boolean }) {
  const layoutState = usePanelLayout(deviceId, surface, deviceTouch);
  return (
    <ErrorBoundary
      // eslint-disable-next-line i18next/no-literal-string -- crash-boundary diagnostic id
      label="Panel"
    >
      <PanelContent surface={surface} deviceId={deviceId} deviceTouch={deviceTouch} layoutState={layoutState} />
    </ErrorBoundary>
  );
}

export function PanelContent({
  surface,
  deviceId,
  deviceTouch,
  layoutState,
  embedded = false,
  simulator = false,
  simulatorTheme,
  simulatorThemeMode,
  simulatorSelectedWidgetId,
  simulatorFlashSignal,
  onSimulatorWidgetClicked,
  onSimulatorBackgroundClicked,
  openCatalogSignal,
  appAccentColor,
  onSectionNavigate,
}: {
  surface: PanelSurface;
  deviceId?: string;
  // Per-device touch capability (promoted monitors). Undefined falls back to
  // the surface default in surfaceSupportsTouch.
  deviceTouch?: boolean;
  layoutState: PanelLayoutState;
  embedded?: boolean;
  simulator?: boolean;
  simulatorTheme?: SimulatorTheme;
  simulatorThemeMode?: 'dark' | 'light';
  simulatorSelectedWidgetId?: string | null;
  // Parent-driven one-shot flash (e.g. a resize the editor rejected). The
  // nonce re-fires the flash for repeat rejections of the same widget.
  simulatorFlashSignal?: { widgetId: string; nonce: number } | null;
  onSimulatorWidgetClicked?: (id: string) => void;
  onSimulatorBackgroundClicked?: () => void;
  openCatalogSignal?: number;
  appAccentColor?: string;
  onSectionNavigate?: DashboardSectionNavigate;
}) {
  // The iframe parent owns kiosk-only chrome (offline overlay, viewport lock,
  // page-scroll lock, native bridges, language sync, watchdog). The simulator
  // iframe must not duplicate them - a second viewport lock fights the
  // parent's window scroll.
  const kioskBehavior = !embedded && !simulator;
  usePanelViewportLock(kioskBehavior);
  usePanelPageScrollLock(kioskBehavior);
  useTopic('panel/phone/presence', kioskBehavior && surface === 'phone');
  usePhonePanelManifest(kioskBehavior && surface === 'phone');
  const { layout, loaded, setLayout } = layoutState;
  const panelTheme = usePanelTheme(deviceId ?? null, kioskBehavior);
  // Simulator gets its theme from the parent via postMessage (local fetch
  // stays disabled), so effectiveTheme uses the parent-supplied state
  // wherever the runtime would read panelTheme.theme; otherwise the iframe
  // shows the default theme (its fetch never runs).
  // Single-widget surfaces (q-series) force labels off so the tile fills the
  // canvas (no ~14px label footer), and force widget blur off + opacity 0 so
  // the single tile floats clean over the shader (no card chrome) and the weak
  // panel GPU skips the backdrop-filter. Render-time flip; persisted theme
  // intact. Same forced-for-q-series treatment as the half-res shader cap.
  const baseTheme = simulator && simulatorTheme ? simulatorTheme : panelTheme.theme;
  const effectiveTheme = useMemo(
    () => isSingleWidgetSurface(surface)
      ? { ...baseTheme, widgetLabels: false, widgetBlur: false, widgetOpacity: 0 }
      : baseTheme,
    [baseTheme, surface],
  );
  usePanelLanguageSync(kioskBehavior);
  // In sync mode prefer the desktop's *resolved* theme (concrete dark/light,
  // tracking the desktop OS); fall back to appThemeMode when unpublished -
  // 'system' there would re-resolve against THIS device's OS (the wrong OS).
  const effectiveThemeMode = effectiveTheme.themeSyncWithDesktop
    ? (effectiveTheme.appResolvedThemeMode || effectiveTheme.appThemeMode)
    : effectiveTheme.themeMode;
  const panelResolvedThemeMode = useResolvedPanelThemeMode(effectiveThemeMode);
  const desktopResolvedThemeMode = useDocumentResolvedThemeMode(embedded);
  const resolvedThemeMode = simulator && simulatorThemeMode
    ? simulatorThemeMode
    : embedded ? desktopResolvedThemeMode : panelResolvedThemeMode;
  // Standalone phone/kiosk owns the tab - mirror its resolved theme to <html>
  // so iOS Safari paints chrome (URL bar, overscroll, scrollbars) via the
  // matching color-scheme + <meta theme-color>. Skipped when embedded (the
  // desktop already drives html theme via applyThemeMode).
  useEffect(() => {
    if (embedded || simulator) return;
    applyHtmlChromeTheme(resolvedThemeMode);
  }, [embedded, simulator, resolvedThemeMode]);
  const nativeSettings = useNativeSettingsBridge(kioskBehavior && surface === 'phone');
  // A host-display panel (Y70/monitor) is the host's own loopback screen: a real
  // service outage drops its connections at once, so a missed ping is almost
  // always transient and it can ride one out instead of flipping offline and
  // tearing down an open editor. Cabled surfaces (q60, USB phone) and WiFi/relay
  // phones keep the instant offline response so a real unplug / signal loss
  // surfaces right away.
  const isHostDisplay = wiredPanelClass(surface) === 'host-display';
  const serviceStatus = useServiceStatus(kioskBehavior, isHostDisplay ? HOST_DISPLAY_OFFLINE_GRACE_MS : 0);
  const multiplex = useMultiplex();
  // The context menu's "Pin to Sidebar" gates on the current pinned-tail
  // (only pinnable types not already pinned). Always inside a
  // UiSettingsProvider - every PanelContent mount wraps one (see
  // PanelEntrypoint / Dashboard).
  const { settings: uiSettings, update: updateUiSettings, hydrated: uiHydrated } = useUiSettings();
  const pinnedTail = sanitizePinnedTail(uiSettings.pinnedSidebarApps);
  // Side-channel signal for the sidebar to mount its drop target. Published
  // only for pinnable types on the embedded desktop surface; elsewhere it
  // stays null so sidebar pointer tracking never engages. See CrossZoneDrag.
  const { setDraggingPinnableType, dropHandlerRef: sidebarDropHandlerRef } = useCrossZoneDrag();

  // Overlay widgets floating on the desktop, tracked so the context menu can
  // flip "Add to desktop" / "Remove from desktop" by whether this widget type
  // already has an overlay instance. Only fetched on the embedded desktop.
  const [overlayWidgets, setOverlayWidgets] = useState<{ id: string; type: string }[]>([]);
  const overlayActive = embedded && surface === 'desktop';
  useEffect(() => {
    if (!overlayActive) return;
    let cancelled = false;
    void listOverlayWidgets().then(list => {
      if (cancelled) return;
      setOverlayWidgets(list.map(w => ({ id: w.id, type: w.type })));
    });
    return () => { cancelled = true; };
  }, [overlayActive]);
  // Overlay create/delete writes broadcast on the 'prefs' topic; refetch on
  // it so add/remove reflects in the context menu immediately.
  useTopicCallback('prefs', overlayActive, () => {
    void listOverlayWidgets().then(list => {
      setOverlayWidgets(list.map(w => ({ id: w.id, type: w.type })));
    });
  });
  // The HTTP /ping shares the browser's 6-connection pool and the host's CPU
  // with whatever the panel is doing, so a widget that floods the pool (deck
  // app-icon loads) or pegs the box (a benchmark run) can starve the ping past
  // its 3s abort and read "offline" while the service is fine. The multiplex
  // websocket is a separate long-lived connection that stays up through both
  // (the benchmark even pushes progress over it), so a live socket proves the
  // service is reachable - suppress the false offline. Scoped to host-display:
  // there a real outage drops the loopback socket at once, whereas a phone's
  // socket can linger open (no heartbeat) after WiFi loss, where prompt offline
  // is wanted.
  const wsConnected = multiplex?.connected ?? false;
  const isOffline = kioskBehavior
    && (serviceStatus.state === 'offline' || serviceStatus.state === 'offline-installed')
    && !(isHostDisplay && wsConnected);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const [sheetMode, setSheetMode] = useState<SheetMode | null>(null);
  const [sheetClosing, setSheetClosing] = useState(false);
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);
  const [selectedMonitoringSlot, setSelectedMonitoringSlot] = useState(0);
  const [deckEditView, setDeckEditView] = useState<DeckEditView>({ folderPath: [] });
  const [editorDockMotion, setEditorDockMotion] = useState<EditorDockMotion | null>(null);
  const { flashedWidgets, triggerFlash } = useFlashWidgets();
  // Flash the widget when the simulator parent rejects an action (e.g. a resize
  // that can't fit). nonce identity drives the one-shot, so repeat rejections
  // of the same widget re-fire.
  const flashNonce = simulatorFlashSignal?.nonce;
  useEffect(() => {
    if (!simulatorFlashSignal) return;
    triggerFlash(simulatorFlashSignal.widgetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire per nonce, not on object identity
  }, [flashNonce]);
  // Portal target for the editor-docked cell. The pager track's transform on
  // non-active pages traps `position: fixed` descendants, hiding the docked
  // cell when editing a widget on page 2+. Portal into this untransformed
  // panel-root container so the cell anchors to the viewport on any page.
  const [editorDockPortalEl, setEditorDockPortalEl] = useState<HTMLDivElement | null>(null);
  const [pendingScrollId, setPendingScrollId] = useState<string | null>(null);
  const [trayOpen, setTrayOpen] = useState(false);
  const { t } = useTranslation();
  const { machineName, onMachineNameCommit } = useMachineName(kioskBehavior, surface, serviceStatus.ping?.machineName);
  const lastCatalogSignalRef = useRef(openCatalogSignal);
  const [immersiveWidgetId, setImmersiveWidgetId] = useState<string | null>(null);
  // Bumped on each immersive open so the overlay's React key changes between
  // sessions for the same widget, clearing stale state that blocks re-entry.
  const [immersiveOpenCounter, setImmersiveOpenCounter] = useState(0);
  const enterImmersive = useCallback((widgetId: string) => {
    setImmersiveOpenCounter(n => n + 1);
    setImmersiveWidgetId(widgetId);
  }, []);
  const handleImmersiveExit = useCallback(() => {
    setImmersiveWidgetId(null);
  }, []);
  const { resizeMotionWidgetId, beginResizeMotion } = useWidgetResizeMotion(
    rootRef,
    styles.cellResizeMotion,
    WIDGET_RESIZE_MOTION_MS,
  );
  // Selection guard runs in simulator too: text-select fights drag gestures
  // inside the iframe like on a real touch surface.
  usePanelTextSelectionGuard(rootRef, !embedded || simulator);
  usePhoneContentScale(surface === 'phone' && loaded, rootRef);
  const runtimeGrid = useRuntimePanelGrid(surface, rootRef, simulator);
  // WebKit (Safari / macOS WKWebView) miscomputes the tokens.scss
  // tan(atan2(cell, 90px)) length-ratio used for --panel-scale, returning a
  // negative number that flips every --panel-scale-driven element 180deg
  // (cellScaler content + the context menu). Compute the ratio in JS (exact in
  // every engine) and set it inline. Phone (live --panel-widget-scale) and q60
  // (Chrome-83 hardcoded 2.5) keep their own --panel-scale.
  const webkitSafePanelScale = surface !== 'phone' && surface !== 'q60'
    ? runtimeGrid.contentScale / PHONE_WIDGET_REFERENCE_CELL
    : null;
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
      ...(webkitSafePanelScale != null ? { '--panel-scale': webkitSafePanelScale } : {}),
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
      webkitSafePanelScale,
    ],
  );

  // ---------- Pagination derived from layout ----------
  // Touch surfaces hoist the focused widget above the editor's backdrop-blur
  // scrim, else the edited widget disappears under the blur. q60 is
  // display-only so editing never engages. See .cellEditorDocked rules.
  const editorDockSupported = surfaceSupportsTouch(surface, deviceTouch);
  const isLandscape = useIsLandscape(surface);
  const capacity = useMemo<PaginateCapacity>(
    () => ({ gridCols: runtimeGrid.columns, pageRows: runtimeGrid.rows }),
    [runtimeGrid.columns, runtimeGrid.rows],
  );

  // Two-stage drag state, declared early so dragLayout/allFiltered can fold
  // the phantom page into the rendered shape.
  //   dragArmedId: set when dnd-kit's delay activation completes (long-press
  //                matured to "ready to drag"). Disables competing gestures
  //                (tray-swipe, page-swipe).
  //   activeDragId: set when the user starts moving past activation. Drives
  //                 the overlay clone + source-cell hide.
  //   dragExtraPageId: phantom trailing page so the user can drag onto a new
  //                    empty page without creating it first. Persisted only
  //                    if a widget lands on it; cleared on dragEnd/dragCancel.
  const [dragArmedId, setDragArmedId] = useState<string | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  const [dragExtraPageId, setDragExtraPageId] = useState<string | null>(null);

  // Re-paginate the persisted layout to current capacity, persisting via
  // setLayout. repaginatePanelLayout returns the SAME reference when pages
  // already match (byte-equal). That reference equality is load-bearing:
  // without it the persistence effect below calls setLayout every render,
  // the next render computes a fresh reference, the effect re-fires, and the
  // panel render-loops (presents as the WebSocket "loses connection after
  // one frame" symptom - the React tree never settles).
  const paginatedLayout = useMemo(
    () => repaginatePanelLayout(layout, capacity),
    [layout, capacity],
  );
  useEffect(() => {
    // CRITICAL: only auto-persist after the server fetch populates `layout`.
    // Before `loaded`, `layout` is the local fallback default; persisting a
    // re-paginated default would race the in-flight fetch and overwrite the
    // user's saved edits.
    if (!loaded) return;
    if (paginatedLayout !== layout) setLayout(paginatedLayout);
  }, [paginatedLayout, layout, setLayout, loaded]);

  // Places the OEM bake-in app's widget + sidebar pin for a profile that
  // predates the service reporting it - the embedded desktop dashboard is
  // the only surface that owns dashboardLayout writes.
  useOemAppSeed({
    enabled: embedded && surface === 'desktop',
    layoutLoaded: loaded,
    layout: paginatedLayout,
    setLayout,
    capacity,
    uiHydrated,
    uiSettings,
    updateUiSettings,
  });

  // Abort an in-flight widget drag when the grid reshapes (device rotation /
  // viewport orientation flip). Rotation re-paginates every widget to the new
  // orientation; a half-finished drag would otherwise commit into the reflowed
  // grid and land the widget in the wrong slot. Cancelling restores the
  // pre-drag layout instead - no drop is committed, so the widget reflows in
  // place with the rest. Routed through dnd-kit's own resize-cancel path
  // (window 'resize' -> sensor handleCancel) so its pointer capture + overlay
  // tear down too. dnd-kit already cancels on a real window resize, but the
  // phone surface can flip orientation via matchMedia without one, so make the
  // cancel explicit off the capacity signal. No-ops when nothing is dragging.
  const dragInProgress = Boolean(dragArmedId || activeDragId);
  const prevCapacityRef = useRef(capacity);
  useEffect(() => {
    if (prevCapacityRef.current === capacity) return;
    prevCapacityRef.current = capacity;
    if (dragInProgress) window.dispatchEvent(new Event('resize'));
  }, [capacity, dragInProgress]);

  // Layout for the renderer + drag pipeline. During a drag, appends a phantom
  // empty page (if under MAX_PANEL_PAGES) so the user can drop onto a new
  // page. Outside drag, equals paginatedLayout so persistence is unaffected.
  const dragLayout = useMemo<PanelLayout>(() => {
    if (!activeDragId || !dragExtraPageId) return paginatedLayout;
    if (paginatedLayout.pages.length >= MAX_PANEL_PAGES) return paginatedLayout;
    return {
      ...paginatedLayout,
      pages: [...paginatedLayout.pages, { id: dragExtraPageId, widgets: [] }],
    };
  }, [paginatedLayout, activeDragId, dragExtraPageId]);

  const allFiltered = useMemo(() => {
    // q60 offline failsafe: keep the panel exactly as-is (background animation,
    // theme, chrome) and swap only the rendered widgets for the clock widget.
    // Render-only - paginatedLayout (persistence) is untouched, so the real
    // widgets return on reconnect.
    if (surface === 'q60' && isOffline) {
      return q60OfflineClockPages(dragLayout.pages, surface);
    }
    return dragLayout.pages.map(page => ({
      id: page.id,
      widgets: page.widgets
        .filter(w => {
          const def = lookupApp(w.type);
          if (!def) return true;
          return appAvailableForSurface(def.meta, surface, { deviceTouch });
        })
        .slice()
        // Row-major (col, row) sort so the focus walk and DOM order match the
        // visual layout; placement itself is via inline style, not source order.
        .sort((a, b) => a.row !== b.row ? a.row - b.row : a.col - b.col),
    }));
  }, [dragLayout.pages, surface, deviceTouch, isOffline]);

  // Flat list of all visible widget ids. Drives a SINGLE SortableContext over
  // every page so dnd-kit's hover detection works across pages.
  const allFlatIds = useMemo(() => allFiltered.flatMap(p => p.widgets.map(w => w.id)), [allFiltered]);
  // Newly-added widgets play the launch-style pop-in (covers kiosk + simulator
  // add paths; the simulator add round-trips through set-layout, where the new
  // id still surfaces as a single-widget delta).
  const entranceWidgets = useAddedWidgetEntrance(allFlatIds);
  const pageCount = Math.max(1, allFiltered.length);
  // SortableContext memoizes its strategy by [strategy, rects, activeIndex,
  // overIndex, index]. Our over is always a non-sortable empty-cell droppable,
  // so overIndex stays -1 and the memo doesn't reliably re-fire. Use a no-op
  // strategy and project widgets via React state below.
  const projectedLayoutStrategy = useMemo<SortingStrategy>(() => () => null, []);
  const { activePageIndex, setActivePageIndex, activePageIndexRef, pageCountRef, handlePageChange } = usePageSync({
    loaded,
    kioskBehavior,
    paginatedLayout,
    layout,
    setLayout,
    pageCount,
    pageDragging: Boolean(activeDragId || dragArmedId),
  });
  // Frozen snapshot of the dragged cell's pixel size + runtime CSS vars at
  // drag start. Captured once in onDragStart and reused every overlay render
  // so the clone never re-measures mid-drag (which would pick up
  // post-pager-translate / post-resize values and jitter the clone scale).
  type DragSnapshot = {
    id: string;
    width: number;
    height: number;
    cellSize: string;
    widgetScale: string;
    gap: string;
  };
  const [dragSnapshot, setDragSnapshot] = useState<DragSnapshot | null>(null);
  // Snapshot captured at onDragStart but not yet promoted to rendered state.
  // Promotes on the first onDragMove so a long-press for the menu (no
  // movement) shows only the menu, never the lift/overlay.
  const pendingDragRef = useRef<DragSnapshot | null>(null);

  const pageOrientation: 'portrait' | 'landscape' = isLandscape ? 'landscape' : 'portrait';

  const widgetById = useCallback((id: string): PanelWidget | undefined => {
    for (const page of paginatedLayout.pages) {
      const found = page.widgets.find(w => w.id === id);
      if (found) return found;
    }
    return undefined;
  }, [paginatedLayout]);

  const editingWidget = editingWidgetId ? widgetById(editingWidgetId) ?? null : null;
  const editingWidgetSize = editingWidget?.size;
  // QR pairing adds another device to a paired desktop, valid only from the
  // native app or bundled-localhost dashboard. The browser-fallback panel
  // (plain HTTP, non-loopback host) is the "no app installed" path and can't
  // deliver pairing, so don't expose the QR there.
  const nativePairingAvailable =
    !isInsecureBrowserPanel() && (surface === 'phone' || nativeSettings.available);
  // Local hardwired kiosks (Y70, touch monitors) pair other devices to this PC
  // through an in-panel sheet instead of the native dialog. Phone surfaces (the
  // native app and remote browser sessions) are the remote end, not the host,
  // so they're excluded. The insecure-browser guard mirrors
  // nativePairingAvailable: the plain-HTTP LAN fallback can't deliver pairing.
  const localPairAvailable = surface !== 'phone' && !isInsecureBrowserPanel();
  // The phone's own remembered-PCs list is the mirror image of localPairAvailable:
  // only the remote end (a phone reaching a PC) has other PCs to switch between.
  const pairedPcsAvailable = surface === 'phone';

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
    const def = lookupApp(w.type);
    if (!def?.Touch) return;
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
  const { connectionIntroHost, clearConnectionIntro, resetAnnounced } = useConnectionIntro({
    blocked: connectionIntroBlocked,
    embedded,
    loaded,
    isOffline,
    online: serviceStatus.state === 'online',
    machineName,
    setTrayOpen,
  });
  // Embedded desktop only mounts once the service is online (DashboardOnline),
  // so layout `loaded` is the readiness signal; serviceStatus is kiosk-only here.
  const homeIntroActive = useHomeIntro(embedded && surface === 'desktop' && loaded);
  const connectionIntroLabel = (() => {
    const label = t('panel.connectedTo');
    return label === 'panel.connectedTo' ? 'Connected to' : label;
  })();
  // A phone is always a remote-paired device, even when the Android wrapper
  // serves the panel through its loopback proxy (origin 127.0.0.1, which
  // isRemotePaired reads as a hardwired-kiosk localhost). Show the "connected
  // to <PC>" identity for it the same as the LAN-IP / relay phone origins.
  const connectionIdentityVisible = isRemotePaired || surface === 'phone';
  // The live connection is running over the cloud relay (not the direct LAN
  // /ws socket). Surface a satellite badge so the user knows traffic is going
  // through the relay; LAN connections show nothing extra.
  const relayConnected = Boolean(multiplex?.connected && multiplex.transport === 'relay');
  const relayModeLabel = (() => {
    const label = t('connection.relayMode');
    return label === 'connection.relayMode' ? 'Connected via cloud relay' : label;
  })();

  // Long-press on the empty background opens the actions tray (mirrors the
  // widget long-press-to-menu). Kiosk surfaces only, not while in a sheet /
  // immersive / drag state, and only when the press misses widgets and
  // interactive elements.
  const backgroundLongPress = useLongPress(() => setTrayOpen(true), PANEL_CONTEXT_MENU_TRIGGER_MS);
  const backgroundPressBlocked = !kioskBehavior
    || !surfaceSupportsTouch(surface, deviceTouch)
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
    // Skip presses on a widget, interactive control, the tray, the page
    // indicator, or anything that handles its own press, so the widget
    // long-press and tray swipe keep their gestures.
    if (
      e.target.closest('[data-panel-widget-id]')
      || e.target.closest('button, input, select, textarea, a, [role="button"], [role="slider"], [role="switch"], [role="checkbox"], [role="tab"], [role="menuitem"], [role="option"]')
      || e.target.closest('[data-panel-scrollable="true"]')
    ) return;
    backgroundLongPress.onPointerDown(e);
  }, [backgroundPressBlocked, backgroundLongPress]);
  // Right-click on the empty background is the desktop equivalent of the touch
  // long-press: same gating, opens the tray. Suppresses the browser's native
  // menu on the panel surface.
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

  // While offline, tear down the editor / add-widget / context-menu sheets so
  // recovery doesn't resume mid-transition. Depend on closeCtxMenu's identity
  // (stable useCallback) to avoid re-firing on every touch-state render.
  const touchCloseCtxMenu = touch.closeCtxMenu;
  const hasCtxMenu = Boolean(touch.ctxMenu);
  useEffect(() => {
    if (!isOffline) return;
    resetAnnounced();
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
  }, [isOffline, clearCloseTimer, clearConnectionIntro, resetAnnounced, hasCtxMenu, touchCloseCtxMenu]);

  // The iOS bottom-edge backgrounding swipe sometimes commits the tray, so
  // it's open on return. Close on hide (plus pagehide for iOS Safari) rather
  // than on restore so the menu doesn't flash on return.
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

  // Scroll the most recently inserted widget into view after the sheet closes,
  // snapping the active page to its page. A no-op for cells already visible,
  // but keeps drag-resize / context-menu animations centred.
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
  }, [pendingScrollId, sheetMode, allFiltered, activePageIndex, setActivePageIndex]);

  const addWidget = useCallback((type: string, size: PanelWidgetSize) => {
    const defaultConfig = lookupApp(type)?.meta.defaultConfig?.();
    const next: PanelWidget = {
      id: createUuid(),
      type,
      size,
      col: 0,
      row: 0,
      ...(defaultConfig ? { config: defaultConfig } : {}),
    };
    // Dashboard is single-page: appendWidget no-ops if page 0 is full
    // instead of spawning a new page. Other surfaces keep multi-page.
    const dashboardSinglePage = embedded && surface === 'desktop';
    setLayout(appendWidget(paginatedLayout, next, capacity, { singlePage: dashboardSinglePage }));
    setPendingScrollId(next.id);
    closeSheet();
  }, [closeSheet, embedded, paginatedLayout, capacity, setLayout, surface]);

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

    // Fit the new size by cascading siblings across pages (up to
    // MAX_PANEL_PAGES). If displaced widgets have nowhere to go, reject the
    // resize and flash the widget rather than corrupt the layout silently.
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
    // Resolve initial sheet state (e.g. selected monitoring slot) from the
    // press point that summoned the edit flow, reading the DOM before the
    // dock animation hoists the widget out of its grid position.
    const def = lookupApp(widget.type);
    const initial = point && def?.resolveInitialSelection
      ? def.resolveInitialSelection({ point, widget })
      : undefined;
    setSelectedMonitoringSlot(initial?.selectedSlot ?? 0);
    setDeckEditView({ folderPath: [] });
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

    // Recompute on every editingWidget change (the size picker updates
    // widget.size → new editingWidget reference) so the dock cell tracks the
    // new span instead of freezing at the dimensions from editor-open.
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

  // Delay-based activation matched to the context-menu trigger: drag arms
  // when the menu opens (iOS-style hold-to-lift, then drag). tolerance:8
  // cancels arming if the user moves past 8px before the delay, so a quick
  // horizontal swipe (pager engages at 8px) wins. Movement before the menu =
  // navigation, never drag.
  // Arming != lifting: defer the visual overlay (activeDragId, dragSnapshot,
  // source-cell hide) to the first onDragMove, so long-press-then-release
  // shows only the menu, no lift.
  // Simulator uses distance activation so a press-and-move drags without a
  // long-press first; tap still opens settings (no movement).
  const desktopActivation = surface === 'desktop' || simulator;
  const pointerSensor = useSensor(
    PointerSensor,
    desktopActivation
      ? { activationConstraint: { distance: 6 } }
      : { activationConstraint: { delay: PANEL_CONTEXT_MENU_TRIGGER_MS, tolerance: 8 } },
  );
  // Non-touch surfaces (Q60) can't move widgets; register no drag sensor so a
  // pointer press never lifts a cell. Desktop mouse-drag and touch panels keep it.
  const sensors = useSensors(surfaceSupportsTouch(surface, deviceTouch) ? pointerSensor : null);

  const { clearEdgeAdvance, evaluateEdgeAdvance } = useEdgeAdvance(setActivePageIndex, pageCountRef);
  const handleDndDragMove = useCallback((event: DragMoveEvent) => {
    // Drag visuals (lift, source-cell hide, menu dismiss) engage only past
    // PANEL_DRAG_START_THRESHOLD_PX from the long-press anchor. Mirrors the
    // collision detector's floor (see buildPanelCollisionDetection); both arm
    // together so visuals and over resolution stay in sync. Below threshold =
    // menu only, so a finger jiggle after long-press can't launch a drag.
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
    evaluateEdgeAdvance(event.active.rect.current.translated ?? null);
  }, [touch, evaluateEdgeAdvance]);
  // Gesture refs for the collision detector. startX/Y is dnd-kit's press
  // origin, against which PANEL_DRAG_START_THRESHOLD_PX is gated. lastOverId
  // gives hysteresis - the over flips only when the cursor leaves the band.
  const dragGestureRef = useRef<DragGestureState>({ startX: 0, startY: 0, lastOverId: null });
  // Live `over` droppable id, updated each onDragOver. The projection strategy
  // reads this to compute the make-room preview without dnd-kit's overIndex
  // (which is -1 over an empty-cell droppable - those aren't SortableContext
  // items).
  const currentOverIdRef = useRef<string | null>(null);
  // dnd-kit invokes the collision detector later (on pointer move), so the
  // refs are read via the closure. The useMemo body never dereferences
  // `.current` - only the returned function does, at call time.
  const panelCollisionDetection = useMemo(
    () => buildPanelCollisionDetection(dragGestureRef, activePageIndexRef),
    [activePageIndexRef],
  );

  // Tick incremented when the over target changes. The highlight overlay
  // reads currentOverIdRef but needs a render signal to repaint, kept off the
  // hot pointer-move path (the strategy uses the ref directly).
  const [overIdTick, setOverIdTick] = useState(0);
  const handleDndDragOver = useCallback((event: DragOverEvent) => {
    const next = event.over ? String(event.over.id) : null;
    if (next !== currentOverIdRef.current) {
      currentOverIdRef.current = next;
      setOverIdTick(n => n + 1);
    }
  }, []);

  // Drag preview layout, recomputed when the over target moves to a new cell.
  // Each cell reads its (col, row) and animates from committed to preview
  // position via inline transform - the "make-room" feel: widgets overlapping
  // the dragged one cascade to the next free aligned cell mid-drag, committing
  // on drop. Bypasses dnd-kit's SortableContext strategy, which doesn't
  // re-fire reliably with non-sortable empty droppables.
  const [previewLayout, setPreviewLayout] = useState<PanelLayout | null>(null);
  useEffect(() => {
    if (!activeDragId) { setPreviewLayout(null); return; }
    const overId = currentOverIdRef.current;
    if (!overId) { setPreviewLayout(null); return; }
    const active = widgetById(activeDragId);
    if (!active) { setPreviewLayout(null); return; }
    // Use dragLayout (with phantom trailing page) so previewDrag resolves the
    // new-page id when the user hovers over it.
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
    // Prime the over to the active's home cell so the highlight shows from
    // t=0. onDragOver fires only on over CHANGE, so without priming there's no
    // highlight until the cursor crosses a cell boundary.
    const widget = widgetById(id);
    const pageId = paginatedLayout.pages.find(p => p.widgets.some(w => w.id === id))?.id;
    if (widget && pageId) {
      const seed = `empty:${pageId}:${widget.col}:${widget.row}`;
      currentOverIdRef.current = seed;
      setOverIdTick(n => n + 1);
    }
    // Mint a phantom trailing page so the user can drag onto a new empty page.
    // Skipped when:
    //  - Dashboard (single-page surface).
    //  - Already at MAX_PANEL_PAGES.
    //  - The last page is empty (free trailing page exists).
    //  - The source page holds only the active widget: moving it across leaves
    //    the source empty and the new page with one - a net no-op page count.
    const dashboardSinglePage = embedded && surface === 'desktop';
    if (!dashboardSinglePage && paginatedLayout.pages.length < MAX_PANEL_PAGES) {
      const lastPage = paginatedLayout.pages[paginatedLayout.pages.length - 1];
      const sourcePage = paginatedLayout.pages.find(p => p.widgets.some(w => w.id === id));
      const sourceHasOthers = sourcePage ? sourcePage.widgets.length > 1 : false;
      if ((!lastPage || lastPage.widgets.length > 0) && sourceHasOthers) {
        setDragExtraPageId(createUuid());
      }
    }
    // Arm the drag immediately so competing gestures (tray-swipe, page-swipe)
    // gate off before the first motion. Overlay visuals stay on onDragMove.
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
    // Capture the press anchor for the collision detector's minimum-movement
    // floor. activatorEvent is the original arming pointerdown, so a
    // sub-threshold finger jiggle after long-press shuffles nothing.
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
    // Publish the drag to the sidebar for cross-zone pin pickup. Surface-gated
    // so panel-kiosk drags don't touch the dashboard's pinned-apps state (the
    // context provider may exist above via the simulator iframe). Skipped when
    // already pinned (the drop would be a no-op).
    if (embedded && surface === 'desktop' && widget && isPinnableAppKey(widget.type)
        && !pinnedTail.includes(widget.type)) {
      setDraggingPinnableType(widget.type);
    }
  }, [paginatedLayout, touch, widgetById, embedded, surface, setDraggingPinnableType, pinnedTail]);

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={panelCollisionDetection}
      // Re-measure droppables every render while dragging. Otherwise dnd-kit
      // caches drop targets at drag-start, and the pager's auto-advance moves
      // cells to new viewport positions dnd-kit thinks are unchanged - drops
      // on a new page miss or land on the wrong widget.
      measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
      onDragStart={handleDndDragStart}
      onDragMove={handleDndDragMove}
      onDragOver={handleDndDragOver}
      onDragCancel={() => {
        clearEdgeAdvance();
        currentOverIdRef.current = null;
        setActiveDragId(null);
        // Clear the make-room preview in this same batch, not a frame later via
        // the activeDragId effect. A stale previewLayout keeps the displaced
        // cells' transform transition live, so the make-room offset animates
        // back to 0 over the just-committed base and overshoots (the flinch).
        setPreviewLayout(null);
        setDragArmedId(null);
        setDragSnapshot(null);
        setDragExtraPageId(null);
        pendingDragRef.current = null;
        dragGestureRef.current = { startX: 0, startY: 0, lastOverId: null };
        touch.handleDragEnd();
        setDraggingPinnableType(null);
      }}
      onDragEnd={event => {
        clearEdgeAdvance();
        const activeId = String(event.active.id);
        const overId = event.over ? String(event.over.id) : null;
        // Capture dragLayout BEFORE clearing phantom-page state. dragLayout is
        // what previewDrag knows; clearing dragExtraPageId first drops the
        // phantom page mid-flight so previewDrag can't resolve the new-page id.
        const layoutForDrop = dragLayout;
        // Invoke the sidebar's drop committer BEFORE clearing drag state.
        // React 19 flushes setDraggingPinnableType(null) synchronously here,
        // unmounting SidebarPinDropTarget and detaching its pointerup listener
        // before pointerup reaches it; commit the pin imperatively while the
        // sidebar state is still live.
        sidebarDropHandlerRef.current?.();
        currentOverIdRef.current = null;
        setActiveDragId(null);
        // Clear the make-room preview in the same batch as the committed
        // setLayout below. Deferring it to the activeDragId effect leaves one
        // paint where the layout has committed but previewLayout is stale, so
        // the displaced cells' transform transition animates the make-room
        // offset back to 0 over the new base and overshoots (the drag flinch).
        setPreviewLayout(null);
        setDragArmedId(null);
        setDragSnapshot(null);
        setDragExtraPageId(null);
        pendingDragRef.current = null;
        dragGestureRef.current = { startX: 0, startY: 0, lastOverId: null };
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
        // Trim trailing empty pages (keep at least one) so the drag-rendered
        // phantom page isn't persisted unless a widget landed on it.
        const trimmed = trimTrailingEmptyPages(preview);
        setLayout(trimmed);
        // Drop-confirm ring at the widget's final cell (next frame, after the
        // new layout paints).
        requestAnimationFrame(() => {
          const cell = rootRef.current?.querySelector<HTMLElement>(
            `[data-panel-widget-id="${CSS.escape(activeId)}"]`,
          );
          spawnDropRing(cell);
        });
      }}
    >
      <div
        ref={rootRef}
        className={`panel-root ${styles.panelRoot}`}
        data-theme={resolvedThemeMode}
        data-surface={surface}
        data-background-mode={embedded ? 'solid' : effectiveTheme.backgroundMode}
        data-show-widget-labels={effectiveTheme.widgetLabels ? 'true' : 'false'}
        data-widget-blur={effectiveTheme.widgetBlur ? 'true' : 'false'}
        data-widget-opaque={effectiveTheme.widgetOpacity >= 1 ? 'true' : undefined}
        data-context-menu-open={contextMenuWidgetId ? 'true' : undefined}
        data-editing={surface === 'phone' && sheetMode === 'settings' ? 'true' : undefined}
        data-connection-intro={connectionIntroHost ? 'active' : undefined}
        data-home-intro={homeIntroActive ? 'active' : undefined}
        data-simulator-selected={simulator && simulatorSelectedWidgetId ? simulatorSelectedWidgetId : undefined}
        style={panelRootStyle}
        onClick={simulator ? (e) => {
          // Reaches panel-root only when the click passed through empty area
          // unstopped. Forward to the parent to close its settings pane.
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
            effectState={effectiveTheme.backgroundEffectState}
            surface={surface}
            fullRes={simulator}
          />
        )}
        {(!embedded || simulator) && effectiveTheme.backgroundMode === 'media' && effectiveTheme.backgroundMediaId && effectiveTheme.backgroundMediaType && deviceId && (
          <PanelBackgroundMedia
            id={effectiveTheme.backgroundMediaId}
            deviceId={deviceId}
            type={effectiveTheme.backgroundMediaType}
            opacity={effectiveTheme.backgroundOpacity}
          />
        )}
        {!loaded ? (
          <div className={styles.loading}><Spinner size={28} /></div>
        ) : (
          <>
            <div className={styles.panelStage}>
              <div className={styles.panelStagePages}>
                <SortableContext items={allFlatIds} strategy={projectedLayoutStrategy}>
                <PanelPager
                  pages={allFiltered}
                  activeIndex={Math.min(activePageIndex, pageCount - 1)}
                  onActiveChange={handlePageChange}
                  swipeEnabled={!sheetMode && !dragArmedId}
                  renderPage={page => (
                    <>
                      <div
                        data-panel-grid
                        className={`${styles.grid} ${touch.rearranging ? styles.gridRearranging : ''}`}
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
                              entrance={entranceWidgets.has(w.id)}
                              isDragSource={activeDragId === w.id}
                              resizeMotion={!sheetMode && resizeMotionWidgetId === w.id}
                              selectedSlot={sheetMode === 'settings' && editingWidgetId === w.id && lookupApp(w.type)?.meta.usesSlotSelection ? selectedMonitoringSlot : undefined}
                              onSelectSlot={sheetMode === 'settings' && editingWidgetId === w.id && lookupApp(w.type)?.meta.usesSlotSelection ? setSelectedMonitoringSlot : undefined}
                              editView={sheetMode === 'settings' && editingWidgetId === w.id && lookupApp(w.type)?.meta.usesSlotSelection ? deckEditView : undefined}
                              onEditViewChange={sheetMode === 'settings' && editingWidgetId === w.id && lookupApp(w.type)?.meta.usesSlotSelection ? setDeckEditView : undefined}
                              onUpdate={sheetMode === 'settings' && editingWidgetId === w.id && lookupApp(w.type)?.meta.usesSlotSelection ? (cfg => updateWidgetConfig(w.id, cfg)) : undefined}
                              clickthrough={embedded && surface === 'desktop' && Boolean(onSectionNavigate) && isDashboardClickthroughType(w.type)}
                              onContextMenu={surfaceSupportsTouch(surface, deviceTouch) ? e => touch.handleContextMenu(e, w) : (e => e.preventDefault())}
                              cellPointers={surfaceSupportsTouch(surface, deviceTouch) ? touch.bindCellPointers(w) : noopCellPointers}
                              // Non-touch sim surfaces (Q-series) can't reach
                              // onCellTap via the pointer pipeline; a plain
                              // click opens the edit sheet from an iframe tap.
                              onSimulatorClick={simulator && !surfaceSupportsTouch(surface, deviceTouch) ? () => onSimulatorWidgetClicked?.(w.id) : undefined}
                              previewLayout={previewLayout}
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
                  <div className={styles.panelPageIndicatorPosition} data-orientation={pageOrientation}>
                    <PanelPageIndicator
                      total={pageCount}
                      active={Math.min(activePageIndex, pageCount - 1)}
                      visibilityToken={activePageIndex}
                    />
                  </div>
                )}
              </div>
            </div>
            {kioskBehavior && surfaceSupportsTouch(surface, deviceTouch) && (
              <PanelActionsTray
                open={trayOpen}
                onOpen={() => setTrayOpen(true)}
                onClose={() => setTrayOpen(false)}
                onAddWidget={() => openSheet('catalog')}
                onSettings={() => openSheet('panelSettings')}
                onPair={nativePairingAvailable ? nativeSettings.open : undefined}
                pairAvailable={nativePairingAvailable}
                onPairSheet={
                  localPairAvailable ? () => openSheet('pairRemote')
                    : pairedPcsAvailable ? () => openSheet('pairedPcs')
                    : undefined
                }
                pairSheetAvailable={localPairAvailable || pairedPcsAvailable}
                surfaceRef={rootRef}
                surface={surface}
                disabled={Boolean(sheetMode) || isOffline || touch.rearranging || !!dragArmedId}
                machineName={machineName}
                remotePaired={connectionIdentityVisible}
              />
            )}
            <div ref={setEditorDockPortalEl} className={styles.editorDockPortal} aria-hidden="true" />
            {connectionIntroHost && connectionIdentityVisible && (
              <>
                <div className={styles.connectionIntroBackdrop} aria-hidden="true" />
                <div className={styles.connectionIntroTray} role="status" aria-live="polite">
                  {relayConnected && (
                    <SatelliteDish
                      size={15}
                      className={styles.connectionIntroRelayIcon}
                      aria-label={relayModeLabel}
                    />
                  )}
                  <span className={styles.connectionIntroLabel}>{connectionIntroLabel}</span>
                  <span className={styles.connectionIntroName}>{connectionIntroHost}</span>
                  <Lock
                    size={13}
                    className={styles.connectionIntroLock}
                    aria-label={t('panel.actions.e2eEncrypted')}
                  />
                </div>
              </>
            )}
            {kioskBehavior && !connectionIntroHost && relayConnected && (
              <div
                className={styles.relayBadge}
                role="status"
                aria-label={relayModeLabel}
                title={relayModeLabel}
              >
                {/* eslint-disable-next-line i18next/no-literal-string -- aria boolean */}
                <SatelliteDish size={15} aria-hidden="true" />
              </div>
            )}
          </>
        )}
      </div>

      {touch.ctxMenu && (() => {
        const def = lookupApp(touch.ctxMenu.widget.type);
        if (!def) return null;
        // eslint-disable-next-line i18next/no-literal-string -- orientation enum key
        const orientationKey = isLandscape ? 'landscape' : 'portrait';
        const immersiveAvailable = Boolean(def.Touch)
          && def.meta.supportsImmersive[orientationKey];
        const ctxWidget = touch.ctxMenu.widget;
        const ctxPoint = { x: touch.ctxMenu.x, y: touch.ctxMenu.y };
        // "Add to desktop" always pins another floating overlay copy; multiple
        // same-type instances coexist, each with its own config. "Remove from
        // desktop" deletes every instance of the type.
        const onDesktopSurface = embedded && surface === 'desktop';
        const overlayMatches = onDesktopSurface
          ? overlayWidgets.filter(o => o.type === ctxWidget.type)
          : [];
        const desktopAddAvailable = onDesktopSurface;
        const desktopRemoveAvailable = onDesktopSurface && overlayMatches.length > 0;

        // Sidebar pin toggle, only for pinnable types (isPinnableAppKey):
        // "Pin to Sidebar" when not pinned, "Unpin from Sidebar" when pinned.
        const pinnableKey = isPinnableAppKey(ctxWidget.type) ? ctxWidget.type : null;
        const sidebarPinnable = onDesktopSurface && pinnableKey !== null;
        const alreadyPinned = sidebarPinnable && pinnedTail.includes(pinnableKey);
        const pinAvailable = sidebarPinnable && !alreadyPinned;
        const unpinAvailable = sidebarPinnable && alreadyPinned;
        return (
          <WidgetContextMenu
            x={ctxPoint.x}
            y={ctxPoint.y}
            currentSize={ctxWidget.size}
            sizes={sizesForSurface(def.meta, surface)}
            hasConfig
            surface={surface}
            themeMode={resolvedThemeMode}
            themeStyle={webkitSafePanelScale != null ? { ...panelThemeVars, '--panel-scale': webkitSafePanelScale } as CSSProperties : panelThemeVars}
            onResize={size => resizeWidget(ctxWidget.id, size, { animateFromContextMenu: true })}
            onEdit={() => openWidgetSettings(ctxWidget, ctxPoint)}
            onRemove={() => removeWidget(ctxWidget.id)}
            onImmersive={!embedded && immersiveAvailable ? () => enterImmersive(ctxWidget.id) : undefined}
            onAddToDesktop={desktopAddAvailable ? () => {
              void createOverlayWidget({
                type: ctxWidget.type,
                size: ctxWidget.size,
                config: ctxWidget.config,
              }).then(created => {
                if (created) setOverlayWidgets(prev => [...prev, { id: created.id, type: created.type }]);
              });
            } : undefined}
            onRemoveFromDesktop={desktopRemoveAvailable ? () => {
              const removed = overlayMatches.map(o => o.id);
              for (const id of removed) {
                void deleteOverlayWidget(id);
              }
              // Optimistic update so the next menu open shows "Add to desktop"
              // without waiting for the prefs topic round-trip.
              setOverlayWidgets(prev => prev.filter(o => !removed.includes(o.id)));
            } : undefined}
            onPinToSidebar={pinAvailable && pinnableKey ? () => {
              updateUiSettings({
                pinnedSidebarApps: [...pinnedTail, pinnableKey],
              });
            } : undefined}
            onUnpinFromSidebar={unpinAvailable && pinnableKey ? () => {
              updateUiSettings({
                pinnedSidebarApps: pinnedTail.filter(k => k !== pinnableKey),
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
        const def = lookupApp(w.type);
        const Comp = def?.Touch;
        if (!Comp) return null;
        // key forces a fresh mount each open/close so overlay internal state
        // (mountState, swipe offset) never carries across sessions.
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
          deviceId={deviceId}
          deviceTouch={deviceTouch}
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
          onThemeBackgroundEffectStatePreview={panelTheme.previewBackgroundEffectState}
          onThemeBackgroundEffectStateCommit={panelTheme.commitBackgroundEffectState}
          onThemeBackgroundOpacityPreview={panelTheme.previewBackgroundOpacity}
          onThemeBackgroundOpacityCommit={panelTheme.commitBackgroundOpacity}
          onThemeBackgroundMediaCommit={panelTheme.commitBackgroundMedia}
          showMediaTab={surface === 'y70' || surface === 'q60'}
          deviceAspect={typeof window !== 'undefined' ? window.innerWidth / window.innerHeight : undefined}
          deviceW={surface === 'q60' ? 720 : (typeof window !== 'undefined' ? Math.round(window.innerWidth * window.devicePixelRatio) : undefined)}
          deviceH={surface === 'q60' ? 1280 : (typeof window !== 'undefined' ? Math.round(window.innerHeight * window.devicePixelRatio) : undefined)}
          onThemeWidgetOpacityPreview={panelTheme.previewWidgetOpacity}
          onThemeWidgetOpacityCommit={panelTheme.commitWidgetOpacity}
          onThemeWidgetLabelsCommit={panelTheme.commitWidgetLabels}
          onThemeWidgetBlurCommit={panelTheme.commitWidgetBlur}
          machineName={machineName}
          showHostName={connectionIdentityVisible}
          onMachineNameCommit={onMachineNameCommit}
          onAdd={addWidget}
          onResize={resizeWidget}
          onUpdate={updateWidgetConfig}
          onRemove={removeWidget}
          selectedMonitoringSlot={selectedMonitoringSlot}
          onSelectedMonitoringSlotChange={setSelectedMonitoringSlot}
          editView={deckEditView}
          onEditViewChange={setDeckEditView}
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
          relayDisabled={multiplex?.relayDisabled ?? false}
          sessionRevoked={multiplex?.sessionRevoked ?? false}
          sessionEnded={multiplex?.sessionEnded ?? false}
          onRetry={handleRetry}
          onOpenNativePairing={nativeSettings.open}
        />
      )}
      {kioskBehavior && surface === 'phone' && (
        <ConfirmModal
          open={(multiplex?.directUpgradeFailed ?? false) && multiplex?.transport === 'relay'}
          title={t('connection.directFailed.title')}
          message={t('connection.directFailed.message')}
          cancelLabel={t('connection.directFailed.useRelay')}
          confirmLabel={t('connection.directFailed.disconnect')}
          onCancel={() => multiplex?.dismissDirectUpgradePrompt()}
          onConfirm={() => multiplex?.disconnectSession()}
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
            // panelRootStyle paints the surface bg on the wrapper, but the
            // DragOverlay is portaled to body - a solid wrapper bg makes the
            // clone an opaque rectangle, layering its translucent .panel-card
            // and backdrop-filter over flat colour instead of the real surface
            // (shader, gradient). Force transparent so the clone matches the
            // in-grid cell.
            // eslint-disable-next-line i18next/no-literal-string -- css color value
            background: 'transparent',
            // eslint-disable-next-line i18next/no-literal-string -- css color value
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
              showLabels={effectiveTheme.widgetLabels}
            />
          );
        })()}
      </DragOverlay>
    </DndContext>
  );
}
