import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { Settings2, Trash2, X } from 'lucide-react';
import {
  DndContext, DragOverlay, MeasuringStrategy, PointerSensor,
  useDroppable, useSensor, useSensors,
  type CollisionDetection,
  type DragMoveEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import type { SortingStrategy } from '@dnd-kit/sortable';
import { usePanelLayout } from './engine/usePanelLayout';
import { useDashboardLayout } from './engine/useDashboardLayout';
import { useKioskWatchdog } from './engine/useKioskWatchdog';
import { PANEL_CONTEXT_MENU_TRIGGER_MS, usePanelTouchMode } from './engine/usePanelTouchMode';
import { useLongPress } from './engine/useLongPress';
import { usePanelTextSelectionGuard } from './engine/usePanelTextSelectionGuard';
import { usePanelViewportLock } from './engine/usePanelViewportLock';
import { usePanelSheetSwipe } from './engine/usePanelSheetSwipe';
import { broadcastLayoutChanged, onLayoutChanged } from './engine/panelSync';
import { panelGridCapacityForCanvas, sizeToSpan, snapStride, type PanelGridCapacity } from './engine/grid';
import { paginateCapacityForGrid, repaginatePanelLayout, type PaginateCapacity } from './engine/paginate';
import {
  allCellsForPage,
  appendWidget,
  patchWidgetById,
  previewDrag,
  removeWidgetById,
  setDockEnabled,
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
import { WidgetCellLabel } from './widgets/common/WidgetCellLabel';
import { SIZE_ICONS } from './widgets/common/SizeIcons';
import { WidgetControlGroup } from './widgets/common/WidgetControlGroup';
import { slotCountOptionsForSize, resolvedSlotCountForSize } from './widgets/performance/perfSlots';
import { SlotCountIcon } from './widgets/performance/SlotCountIcons';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { IconLabelButton } from '../components/IconLabelButton/IconLabelButton';
import { Toggle } from '../components/Toggle/Toggle';
import { useMultiplex, useTopic, useTopicCallback } from '../hooks/useMultiplexSocket';
import { useServiceStatus } from '../hooks/useServiceStatus';
import { PanelOfflineOverlay } from './PanelOfflineOverlay';
import { isInsecureBrowserPanel } from './PanelInsecureBanner';
import { useTranslation } from '../lib/i18n';
import {
  applyHtmlChromeTheme, DEFAULT_ACCENT, deriveAccentVars, LANGUAGES, resolveTheme, THEME_MODES,
  type Language, type ThemeMode,
} from '../lib/settings';
import { fetchPreferences, savePreferences } from '../api/profiles';
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
import {
  DEFAULT_PANEL_BACKGROUND_EFFECT,
  DEFAULT_PANEL_BACKGROUND_OPACITY,
  DEFAULT_PANEL_BACKGROUND_TEMPLATE,
  DEFAULT_PANEL_WIDGET_LABELS,
  DEFAULT_PANEL_WIDGET_OPACITY,
  normalizePanelBackgroundEffect,
  normalizePanelBackgroundMode,
  normalizePanelBackgroundOpacity,
  normalizePanelBackgroundTemplate,
  normalizePanelWidgetLabels,
  normalizePanelWidgetOpacity,
  panelBackgroundPair,
  resolvePanelBackground,
  type PanelBackgroundMode,
} from './panelBackground';
import { PanelWidgetCatalog } from './editor/PanelWidgetCatalog';
import {
  PanelThemeSettings,
  type PanelThemeSettingsState,
  type ResolvedPanelThemeMode,
} from './editor/PanelThemeSettings';
import type { SimulatorTheme } from './embed/simulatorProtocol';
import { PanelHostNameSetting } from './editor/PanelHostNameSetting';
import { getPanelGridSizingSettings, PANEL_SIMULATION_CHANGED_EVENT } from '../lib/panelSimulation';
import './styles/tokens.scss';
import styles from './PanelApp.module.scss';

type SheetMode = 'catalog' | 'settings' | 'panelSettings';

const PHONE_PANEL_PWA_KEY = 'qos_phone_panel_pwa';
// Window during which the closing keyframe (or hand-driven swipe glide) plays
// before the editor sheet unmounts. Matches the SETTLE_MS / settling transition
// in usePanelSheetSwipe so a swipe-dismiss completes its glide before the tree
// is removed.
const EDITOR_EXIT_MS = 240;
const WIDGET_RESIZE_MOTION_MS = 220;
const CONNECTION_INTRO_MS = 1700;
const PHONE_WIDGET_REFERENCE_CELL = 90;
const DESKTOP_GRID_COLUMNS = 8;
const DESKTOP_GRID_ROWS = 8;
// Hard cap on how many pages a panel can grow to. The user can drag
// a widget toward the right edge to create a new empty page on
// demand; this stops them at 10 so the pager / persistence don't
// have to deal with unbounded growth.
const MAX_PANEL_PAGES = 10;
const DESKTOP_GRID_PADDING = 16;
const DESKTOP_ACTION_TRAY_HEIGHT = 0;
const DESKTOP_GRID_REFERENCE_CELL = PHONE_WIDGET_REFERENCE_CELL;
const DEFAULT_SURFACE_DPI: Record<PanelSurface, number> = {
  y70: 337,
  q60: 220,
  phone: 460,
  desktop: 144,
};
type PanelThemeState = PanelThemeSettingsState;

interface PanelLayoutState {
  layout: PanelLayout;
  loaded: boolean;
  setLayout: (next: PanelLayout) => void;
}

interface EditorDockMotion {
  widgetId: string;
  phase: 'open' | 'closing';
  style: CSSProperties;
  sourceRect?: EditorDockSourceRect;
}

// Cursor must move this many pixels from the long-press origin before
// any other widget is allowed to shift out of the way. Without this
// floor, the pager and dnd-kit fire onDragMove on the first sub-pixel
// pointer jitter that follows the long-press, the strategy commits a
// new over target, and surrounding widgets visibly twitch even though
// the user has not "started" dragging yet.
const PANEL_DRAG_START_THRESHOLD_PX = 12;

interface DragGestureState {
  // Pointer position at long-press activation. Reset on dragstart.
  startX: number;
  startY: number;
  // Last over id committed for this drag. Drives hysteresis so a tiny
  // jitter near a shared cell boundary does not flip the projection.
  lastOverId: string | null;
}

// Builds the panel collision detector. It must be a closure inside
// PanelContent so it can read mutable refs for the long-press origin
// and last-committed over id - those provide the threshold + hysteresis
// that prevent the surrounding widgets from twitching back and forth.
//
// The pager translates the entire track to switch pages, so dnd-kit's
// cached droppable rects can lag behind the visible state. We compute
// each cell's BASELINE rect (visual rect minus its current INTERPOLATED
// transform via DOMMatrix) so the over selection is anchored to the
// layout, not the in-flight CSS transition.
// Builds a collision detector that reports the grid cell directly
// under the dragged widget's projected top-left. We snap the widget's
// VISUAL top-left to a (col, row) using the page's cell + gap metrics,
// then return either the widget at that cell or the empty-cell
// droppable. This is what iOS Springboard does: where you SEE the
// widget is exactly where it would land. Pointer-coordinate "closest
// by center" was biased toward whatever was nearest the finger,
// which kept yanking the active onto adjacent widgets when the user
// tried to land it in empty space.
function buildPanelCollisionDetection(
  gestureRef: { current: DragGestureState },
  activePageIndexRef: { current: number },
): CollisionDetection {
  return (args) => {
    const { droppableContainers, active, pointerCoordinates } = args;
    if (typeof document === 'undefined') return [];

    // Minimum-movement threshold (cursor distance from press anchor).
    // Below this we still don't pick an over target so a sub-threshold
    // jiggle after long-press doesn't trigger any displacement.
    if (pointerCoordinates) {
      const dx0 = pointerCoordinates.x - gestureRef.current.startX;
      const dy0 = pointerCoordinates.y - gestureRef.current.startY;
      if (dx0 * dx0 + dy0 * dy0 < PANEL_DRAG_START_THRESHOLD_PX * PANEL_DRAG_START_THRESHOLD_PX) {
        return [];
      }
    }

    const translated = active.rect.current.translated;
    if (!translated) return [];

    // Find the panel root via the source cell so we can read CSS metrics.
    const sourceCell = document.querySelector<HTMLElement>(
      `[data-panel-page-index] [data-panel-widget-id="${CSS.escape(String(active.id))}"]`,
    );
    const root = sourceCell?.closest<HTMLElement>('[data-surface]');
    if (!root) return [];
    // Shared DOM-based cell metrics. Works on dashboard (fixed px)
    // AND panel kiosk surfaces (calc() expression) - panel was
    // broken before this because parseFloat('calc(...)') is NaN.
    const metrics = readCellMetrics(root);
    if (!metrics) return [];
    const { cellSize, rowSize, gap } = metrics;
    const stride = cellSize + gap;
    const rowStride = rowSize + gap;
    const rootStyle = window.getComputedStyle(root);
    // Snap rule: 1x1 lands on every cell, every multi-cell widget
    // lands on 2-cell multiples (a 4x4 can sit at col 0 OR col 2).
    // Read the active's span off the source cell so the snap is
    // rendered accurately as the cursor moves.
    const activeColSpan = Math.max(1,
      Number.parseInt(sourceCell?.getAttribute('data-panel-cell-col-span') ?? '1', 10) || 1,
    );
    const activeRowSpan = Math.max(1,
      Number.parseInt(sourceCell?.getAttribute('data-panel-cell-row-span') ?? '1', 10) || 1,
    );
    const activeColStep = snapStride(activeColSpan);
    const activeRowStep = snapStride(activeRowSpan);
    const totalColsRaw = Number.parseFloat(rootStyle.getPropertyValue('--panel-columns'));
    const totalRowsRaw = Number.parseFloat(rootStyle.getPropertyValue('--panel-rows'));
    const totalCols = Number.isFinite(totalColsRaw) && totalColsRaw > 0 ? totalColsRaw : 4;
    const totalRows = Number.isFinite(totalRowsRaw) && totalRowsRaw > 0 ? totalRowsRaw : 4;

    // Always lock the snap target to the CURRENT active page. The
    // pager's edge-advance dwell handles cross-page navigation;
    // here we just clamp the snap into the current page's bounds.
    // This means the highlight stays visible (and correct) even when
    // the dragged widget's translated rect drifts off the viewport
    // - a 4x4 widget grabbed near its center can have a top-left
    // hundreds of pixels off the left edge on a phone surface, and
    // the previous "find page containing translated.left" logic
    // would fail to find any page and clear the highlight.
    const idx = activePageIndexRef.current;
    const pageEl = document.querySelector<HTMLElement>(`[data-panel-page-index="${idx}"]`);
    if (!pageEl) return [];

    const pageRect = pageEl.getBoundingClientRect();
    const pageStyle = window.getComputedStyle(pageEl);
    const padLeft = Number.parseFloat(pageStyle.paddingLeft || '0') || 0;
    const padTop = Number.parseFloat(pageStyle.paddingTop || '0') || 0;
    // Center-based snap: round the widget's top-left cell index to
    // the nearest multiple of the snap stride. Math.round() puts the
    // threshold at the half-stride boundary so the widget jumps once
    // the user has moved it more than half a stride into the new slot.
    const localX = translated.left - pageRect.left - padLeft;
    const localY = translated.top - pageRect.top - padTop;
    const continuousCol = localX / stride;
    const continuousRow = localY / rowStride;
    const snappedCol = Math.round(continuousCol / activeColStep) * activeColStep;
    const snappedRow = Math.round(continuousRow / activeRowStep) * activeRowStep;
    // Clamp into the grid so the highlight stays visible even when
    // the dragged widget is pushed past an edge. Max snap is the
    // largest multiple-of-stride that keeps the rect inside the grid.
    const maxCol = Math.max(0, Math.floor((totalCols - activeColSpan) / activeColStep) * activeColStep);
    const maxRow = Math.max(0, Math.floor((totalRows - activeRowSpan) / activeRowStep) * activeRowStep);
    const col = Math.min(Math.max(0, snappedCol), maxCol);
    const row = Math.min(Math.max(0, snappedRow), maxRow);

    const pageId = pageEl.dataset.panelPageId;
    if (!pageId) return [];

    // Always return the cell droppable at the snapped (col, row).
    // Cell droppables render at every (col, row) during drag, so
    // this lookup never fails for in-bounds positions and the
    // highlight stays visible the entire time. previewDrag handles
    // the "drop where you started" case via a no-op short-circuit.
    const emptyId = `empty:${pageId}:${col}:${row}`;
    const emptyContainer = droppableContainers.find(c => String(c.id) === emptyId);
    if (emptyContainer) {
      gestureRef.current.lastOverId = emptyId;
      return [{ id: emptyContainer.id, data: { droppableContainer: emptyContainer, value: 0 } }];
    }
    return [];
  };
}

interface EditorDockSourceRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

// Inert touch handlers for surfaces that don't accept pointer input (Q60).
// `cellPointers` is shaped like RN's PointerEvent bag and the cell wires
// every callback unconditionally, so we hand back a no-op for each to keep
// the call sites typed without registering listeners that could fire on a
// stray simulated pointer.
const noopMouseHandler = (_e: React.MouseEvent) => { /* no-op on Q60 */ };
const noopPointerHandler = (_e: React.PointerEvent) => { /* no-op on Q60 */ };
const noopCellPointers = {
  onPointerDown: noopPointerHandler,
  onPointerMove: noopPointerHandler,
  onPointerUp: noopPointerHandler,
  onPointerCancel: noopPointerHandler,
};

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

export type DashboardWidgetSection = 'monitoring' | 'lighting' | 'cooling' | 'devices';

export interface DashboardSectionNavigatePayload {
  // Optional deep-link key. Currently used by the devices widget to
  // ask DevicesView to auto-open the modal for a specific device.
  deviceKey?: string;
}

export type DashboardSectionNavigate =
  (section: DashboardWidgetSection, payload?: DashboardSectionNavigatePayload) => void;

const DASHBOARD_CLICKTHROUGH_TYPES = new Set<string>(['monitoring', 'lighting', 'cooling', 'devices']);

interface DragTarget { pageId: string; col: number; row: number; }

// Resolves an over droppable id into the (col, row, pageId) the
// active widget would land at if dropped now. Widget ids resolve to
// the widget's own (col, row); empty-cell ids carry the cell coords
// in the id itself. Returns null if the id can't be resolved (e.g.
// a stale widget id from a previous render).
function parseDragTarget(
  overId: string,
  layout: PanelLayout,
  active: PanelWidget,
): DragTarget | null {
  if (overId === active.id) return null;
  if (overId.startsWith('empty:')) {
    const rest = overId.slice(6);
    const lastColon = rest.lastIndexOf(':');
    if (lastColon < 0) return null;
    const middleColon = rest.lastIndexOf(':', lastColon - 1);
    if (middleColon < 0) return null;
    const pageId = rest.slice(0, middleColon);
    const col = Number.parseInt(rest.slice(middleColon + 1, lastColon), 10);
    const row = Number.parseInt(rest.slice(lastColon + 1), 10);
    if (!Number.isFinite(col) || !Number.isFinite(row)) return null;
    return { pageId, col, row };
  }
  for (const page of layout.pages) {
    const w = page.widgets.find(w => w.id === overId);
    if (w) return { pageId: page.id, col: w.col, row: w.row };
  }
  return null;
}

function findWidgetById(layout: PanelLayout, id: string): PanelWidget | undefined {
  for (const page of layout.pages) {
    const w = page.widgets.find(w => w.id === id);
    if (w) return w;
  }
  return undefined;
}

// Returns a copy of `layout` with trailing empty pages removed,
// keeping at least one page so the renderer never has an empty
// `pages` array. Used after a drop commits so the drag-only phantom
// page doesn't get persisted unless a widget actually landed on it.
function trimTrailingEmptyPages(layout: PanelLayout): PanelLayout {
  const pages = layout.pages.slice();
  while (pages.length > 1 && pages[pages.length - 1].widgets.length === 0) {
    pages.pop();
  }
  if (pages.length === layout.pages.length) return layout;
  return { ...layout, pages };
}

// Reads the panel's cell + row + gap sizes in pixels. Works on every
// surface because it measures a real widget cell's offsetWidth /
// offsetHeight (which is the resolved CSS-computed size, NOT what
// getBoundingClientRect would return after a transform). Falls back
// to parsing --panel-cell-size for the (rare) initial-render case
// when no widget is mounted yet. Single source of truth used by
// both the drag collision detector and the per-cell preview
// translation in PanelTouchCell - panel and dashboard share this.
function readCellMetrics(root: HTMLElement | null): { cellSize: number; rowSize: number; gap: number } | null {
  if (!root) return null;
  const rootStyle = window.getComputedStyle(root);
  const gapRaw = Number.parseFloat(rootStyle.getPropertyValue('--panel-gap'));
  const gap = Number.isFinite(gapRaw) ? gapRaw : 0;

  // Preferred path: measure a real widget cell. data-panel-cell-*
  // attributes give us its span so we can back out cellSize / rowSize.
  // offsetWidth / offsetHeight ignore CSS transforms (the projection's
  // translate doesn't change the layout box) so we always get the
  // pristine grid track size, even mid-drag.
  const sample = root.querySelector<HTMLElement>(
    '[data-panel-widget-id][data-panel-cell-col-span][data-panel-cell-row-span]',
  );
  if (sample) {
    const colSpan = Math.max(1,
      Number.parseInt(sample.getAttribute('data-panel-cell-col-span') ?? '1', 10) || 1,
    );
    const rowSpan = Math.max(1,
      Number.parseInt(sample.getAttribute('data-panel-cell-row-span') ?? '1', 10) || 1,
    );
    const w = sample.offsetWidth;
    const h = sample.offsetHeight;
    const cellSize = (w - (colSpan - 1) * gap) / colSpan;
    const rowSize = (h - (rowSpan - 1) * gap) / rowSpan;
    if (Number.isFinite(cellSize) && cellSize > 0
      && Number.isFinite(rowSize) && rowSize > 0) {
      return { cellSize, rowSize, gap };
    }
  }

  // Fallback: parse the CSS variable directly. This works on the
  // dashboard where --panel-cell-size is set inline as a fixed pixel
  // value, but FAILS on panel kiosk surfaces where the variable is a
  // calc() expression - parseFloat returns NaN there. That is exactly
  // why we prefer the DOM-measurement path above.
  const cellSize = Number.parseFloat(rootStyle.getPropertyValue('--panel-cell-size'));
  if (!Number.isFinite(cellSize) || cellSize <= 0) return null;
  const rowSizeRaw = Number.parseFloat(rootStyle.getPropertyValue('--panel-row-size'));
  const rowSize = Number.isFinite(rowSizeRaw) && rowSizeRaw > 0 ? rowSizeRaw : cellSize;
  return { cellSize, rowSize, gap };
}

function isDashboardClickthroughType(type: string): type is DashboardWidgetSection {
  return DASHBOARD_CLICKTHROUGH_TYPES.has(type);
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
  const editorDockSupported = surface === 'phone' || surface === 'desktop';
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

    if (opts?.animateFromContextMenu) {
      beginResizeMotion(widgetId);
    }

    setLayout(patchWidgetById(
      paginatedLayout,
      widgetId,
      w => ({ ...w, size }),
      capacity,
    ));
    // Keep the editor-dock motion attached to the current widget visual.
    setEditorDockMotion(prev => {
      if (!prev || prev.widgetId !== widgetId) return prev;
      const widgetWithNewSize: PanelWidget = { ...current, size };
      return {
        ...prev,
        style: buildEditorDockMotionStyle(rootRef.current, widgetWithNewSize, prev.sourceRect, surface),
      };
    });
  }, [beginResizeMotion, paginatedLayout, capacity, setLayout, surface, widgetById]);

  const removeWidget = useCallback((widgetId: string) => {
    setLayout(removeWidgetById(paginatedLayout, widgetId, capacity));
    if (editingWidgetId === widgetId) {
      finishSheetClose();
    }
  }, [editingWidgetId, finishSheetClose, paginatedLayout, capacity, setLayout]);

  const openWidgetSettings = useCallback((widget: PanelWidget) => {
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
    setSelectedMonitoringSlot(0);
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
  }, [paginatedLayout, touch, widgetById]);

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
        currentOverIdRef.current = null;
        setActiveDragId(null);
        setDragArmedId(null);
        setDragSnapshot(null);
        setDragExtraPageId(null);
        pendingDragRef.current = null;
        dragGestureRef.current = { startX: 0, startY: 0, lastOverId: null };
        if (touch.rearranging) touch.toggleRearrange();
        touch.handleDragEnd();
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
        const desktopPinAvailable = embedded
          && surface === 'desktop'
          && def.meta.supportedSurfaces.includes('desktop');
        return (
          <WidgetContextMenu
            x={touch.ctxMenu.x}
            y={touch.ctxMenu.y}
            currentSize={ctxWidget.size}
            sizes={sizesForSurface(def.meta, surface)}
            hasConfig
            surface={surface}
            themeMode={resolvedThemeMode}
            themeStyle={panelThemeVars}
            isRearranging={touch.rearranging}
            onResize={size => resizeWidget(ctxWidget.id, size, { animateFromContextMenu: true })}
            onEdit={() => openWidgetSettings(ctxWidget)}
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

// eslint-disable-next-line react-refresh/only-export-components
export function buildEditorDockMotionStyle(
  root: HTMLElement | null,
  widget: PanelWidget,
  sourceRect?: EditorDockSourceRect,
  surface?: PanelSurface,
): CSSProperties {
  const span = sizeToSpan(widget.size);
  const rootStyle = root ? getComputedStyle(root) : null;
  const isDesktop = surface === 'desktop';
  const isLandscape = !isDesktop && window.matchMedia('(orientation: landscape)').matches;
  const gap = Number.parseFloat(rootStyle?.getPropertyValue('--panel-gap') ?? '') || 8;
  const cellSize = readEditorDockCellSize(rootStyle, sourceRect, span, gap, isLandscape);
  const width = span.cols * cellSize + (span.cols - 1) * gap;
  const height = span.rows * cellSize + (span.rows - 1) * gap;
  const viewport = window.visualViewport;
  const viewportWidth = viewport?.width ?? window.innerWidth;
  const viewportHeight = viewport?.height ?? window.innerHeight;
  const safeArea = readSafeAreaInsets();
  const sourceLeft = sourceRect
    ? sourceRect.left - (width - sourceRect.width) / 2
    : (viewportWidth - width) / 2;
  const sourceTop = sourceRect
    ? sourceRect.top - (height - sourceRect.height) / 2
    : (viewportHeight - height) / 2;
  let left: number;
  let top: number;

  if (isDesktop) {
    const rootRect = root?.getBoundingClientRect();
    const hasRootRect = Boolean(rootRect && rootRect.width > 0 && rootRect.height > 0);
    const pagePadding = Number.parseFloat(rootStyle?.getPropertyValue('--panel-page-padding') ?? '') || DESKTOP_GRID_PADDING;
    const sheetWidth = Math.min(440, viewportWidth * 0.92);
    const sheetGap = 24;
    const rootLeft = hasRootRect ? rootRect!.left : safeArea.left;
    const rootRight = hasRootRect ? rootRect!.right : viewportWidth - safeArea.right;
    const rootTop = hasRootRect ? rootRect!.top : safeArea.top;
    const rootBottom = hasRootRect ? rootRect!.bottom : viewportHeight - safeArea.bottom;
    const minLeft = Math.max(safeArea.left, rootLeft + pagePadding);
    const visibleRight = Math.min(rootRight - pagePadding, viewportWidth - sheetWidth - sheetGap);
    const maxLeft = Math.max(minLeft, visibleRight - width);
    const minTop = Math.max(safeArea.top, rootTop + pagePadding);
    const maxTop = Math.max(minTop, rootBottom - pagePadding - height);
    left = clampNumber(sourceLeft, minLeft, maxLeft);
    top = clampNumber(sourceTop, minTop, maxTop);
  } else {
    const minLeft = safeArea.left;
    const minTop = safeArea.top;
    const maxLeft = Math.max(minLeft, viewportWidth - width - safeArea.right);
    const maxTop = Math.max(minTop, viewportHeight - height - safeArea.bottom);
    left = isLandscape
      ? minLeft
      : clampNumber(sourceLeft, minLeft, maxLeft);
    top = isLandscape
      ? clampNumber(sourceTop, minTop, maxTop)
      : minTop;
  }
  const startX = sourceRect ? sourceRect.left - left : 0;
  const startY = sourceRect ? sourceRect.top - top : 0;
  const startScaleX = sourceRect ? sourceRect.width / width : 1;
  const startScaleY = sourceRect ? sourceRect.height / height : 1;
  const widgetScale = rootStyle?.getPropertyValue('--panel-widget-scale').trim() || '1';

  return {
    '--panel-editor-dock-left': `${Math.round(left)}px`,
    '--panel-editor-dock-top': `${Math.round(top)}px`,
    '--panel-editor-dock-width': `${Math.round(width)}px`,
    '--panel-editor-dock-height': `${Math.round(height)}px`,
    '--panel-editor-dock-start-x': `${Math.round(startX)}px`,
    '--panel-editor-dock-start-y': `${Math.round(startY)}px`,
    '--panel-editor-dock-start-scale-x': startScaleX.toFixed(4),
    '--panel-editor-dock-start-scale-y': startScaleY.toFixed(4),
    '--panel-widget-scale': widgetScale,
  } as CSSProperties;
}

function readEditorDockCellSize(
  rootStyle: CSSStyleDeclaration | null,
  sourceRect: EditorDockSourceRect | undefined,
  span: { cols: number; rows: number },
  gap: number,
  isLandscape: boolean,
) {
  const cssCellSize = Number.parseFloat(rootStyle?.getPropertyValue('--panel-cell-size') ?? '');
  if (Number.isFinite(cssCellSize) && cssCellSize > 0) return cssCellSize;

  if (rootStyle) {
    const viewportCellSize = readPhoneGridCellSize(rootStyle, gap, gap, isLandscape);
    if (Number.isFinite(viewportCellSize) && viewportCellSize > 0) return viewportCellSize;
  }

  if (sourceRect) {
    const cellWidth = (sourceRect.width - gap * (span.cols - 1)) / span.cols;
    const cellHeight = (sourceRect.height - gap * (span.rows - 1)) / span.rows;
    const sourceCellSize = Math.min(cellWidth, cellHeight);
    if (Number.isFinite(sourceCellSize) && sourceCellSize > 0) return sourceCellSize;
  }

  return PHONE_WIDGET_REFERENCE_CELL;
}

function toEditorDockSourceRect(rect?: DOMRect): EditorDockSourceRect | undefined {
  return rect
    ? { left: rect.left, top: rect.top, width: rect.width, height: rect.height }
    : undefined;
}

function readEditorDockSlotRect(root: HTMLElement | null, widgetId: string): EditorDockSourceRect | undefined {
  if (!root) return undefined;
  const slots = Array.from(root.querySelectorAll<HTMLElement>('[data-panel-widget-slot-id]'));
  const slot = slots.find(el => el.dataset.panelWidgetSlotId === widgetId);
  const rect = slot?.getBoundingClientRect();
  if (!rect || rect.width <= 0 || rect.height <= 0) return undefined;
  return toEditorDockSourceRect(rect);
}

function readSafeAreaInsets() {
  if (typeof document === 'undefined') {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }

  const probe = document.createElement('div');
  probe.style.position = 'fixed';
  probe.style.pointerEvents = 'none';
  probe.style.visibility = 'hidden';
  probe.style.top = 'env(safe-area-inset-top)';
  probe.style.right = 'env(safe-area-inset-right)';
  probe.style.bottom = 'env(safe-area-inset-bottom)';
  probe.style.left = 'env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const style = getComputedStyle(probe);
  const insets = {
    top: Number.parseFloat(style.top) || 0,
    right: Number.parseFloat(style.right) || 0,
    bottom: Number.parseFloat(style.bottom) || 0,
    left: Number.parseFloat(style.left) || 0,
  };
  probe.remove();
  return insets;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function usePanelPageScrollLock(enabled = true) {
  useEffect(() => {
    if (!enabled) return undefined;
    const html = document.documentElement;
    const body = document.body;
    const root = document.getElementById('root');
    const previous = {
      htmlOverflow: html.style.overflow,
      htmlHeight: html.style.height,
      bodyOverflow: body.style.overflow,
      bodyHeight: body.style.height,
      rootHeight: root?.style.height ?? '',
    };

    html.style.overflow = 'hidden';
    html.style.height = '100%';
    body.style.overflow = 'hidden';
    body.style.height = '100%';
    if (root) root.style.height = '100%';

    return () => {
      html.style.overflow = previous.htmlOverflow;
      html.style.height = previous.htmlHeight;
      body.style.overflow = previous.bodyOverflow;
      body.style.height = previous.bodyHeight;
      if (root) root.style.height = previous.rootHeight;
    };
  }, [enabled]);
}

function useRuntimePanelGrid(
  surface: PanelSurface,
  rootRef?: RefObject<HTMLElement | null>,
  simulator = false,
): PanelGridCapacity {
  const [metrics, setMetrics] = useState(() => readRuntimePanelGrid(surface, rootRef?.current ?? null, simulator));

  useEffect(() => {
    const update = () => setMetrics(readRuntimePanelGrid(surface, rootRef?.current ?? null, simulator));
    update();
    const observed = rootRef?.current ?? null;
    const observer = observed && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(update)
      : null;
    if (observed && observer) observer.observe(observed);
    window.visualViewport?.addEventListener('resize', update);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.addEventListener(PANEL_SIMULATION_CHANGED_EVENT, update);
    return () => {
      window.visualViewport?.removeEventListener('resize', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.removeEventListener(PANEL_SIMULATION_CHANGED_EVENT, update);
      observer?.disconnect();
    };
  }, [surface, rootRef, simulator]);

  return metrics;
}

function readRuntimePanelGrid(surface: PanelSurface, root?: HTMLElement | null, simulator = false): PanelGridCapacity {
  if (typeof window === 'undefined') {
    return panelGridCapacityForCanvas(682, 2560, {
      surface,
      dpi: DEFAULT_SURFACE_DPI[surface],
      sizing: getPanelGridSizingSettings(),
    });
  }

  if (surface === 'desktop') {
    // Desktop dashboard uses a fixed widget cell size so resizing the
    // window does not rescale widgets. The grid clips past its container
    // bounds rather than shrinking widget chrome.
    return {
      columns: DESKTOP_GRID_COLUMNS,
      rows: DESKTOP_GRID_ROWS,
      cellSize: DESKTOP_GRID_REFERENCE_CELL,
      rowSize: DESKTOP_GRID_REFERENCE_CELL,
      contentScale: DESKTOP_GRID_REFERENCE_CELL,
    };
  }

  // In simulator mode the iframe is sized at the device's native pixel
  // dimensions (e.g. 682x2560 for Y70); the host browser's DPR would
  // inflate the physical-size calc and trip the 4-to-8 column jump on
  // Retina hosts, so treat cssWidth/cssHeight as device pixels directly.
  const dpr = simulator
    ? 1
    : Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
      ? window.devicePixelRatio
      : 1;
  const rect = root?.getBoundingClientRect();
  const cssWidth = Math.max(1, Math.round(rect?.width ?? window.innerWidth));
  const cssHeight = Math.max(1, Math.round(rect?.height ?? window.innerHeight));
  const width = Math.max(1, Math.round(cssWidth * dpr));
  const height = Math.max(1, Math.round(cssHeight * dpr));
  return panelGridCapacityForCanvas(width, height, {
    surface,
    dpi: estimateRuntimePanelDpi(surface),
    sizing: getPanelGridSizingSettings(),
  });
}

function estimateRuntimePanelDpi(surface: PanelSurface): number {
  if (surface !== 'phone') return DEFAULT_SURFACE_DPI[surface];
  const dpr = Number.isFinite(window.devicePixelRatio) && window.devicePixelRatio > 0
    ? window.devicePixelRatio
    : 1;
  const shortSideCss = Math.min(window.innerWidth, window.innerHeight);
  if (shortSideCss >= 700 && dpr <= 2.25) return 264;
  if (dpr >= 2.75) return 460;
  if (dpr >= 1.75) return 326;
  return 160;
}

function normalizePanelThemeMode(value?: string | null): ThemeMode {
  return THEME_MODES.includes(value as ThemeMode) ? value as ThemeMode : 'system';
}

function normalizePanelDesktopSync(value?: boolean | null): boolean {
  return value !== false;
}

export function useResolvedPanelThemeMode(mode: ThemeMode): ResolvedPanelThemeMode {
  const [resolved, setResolved] = useState<ResolvedPanelThemeMode>(() => resolveTheme(mode));

  useEffect(() => {
    const update = () => setResolved(resolveTheme(mode));
    update();
    if (mode !== 'system' || typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    if (media.addEventListener) {
      media.addEventListener('change', update);
    } else {
      media.addListener(update);
    }
    return () => {
      if (media.removeEventListener) {
        media.removeEventListener('change', update);
      } else {
        media.removeListener(update);
      }
    };
  }, [mode]);

  return resolved;
}

function useDocumentResolvedThemeMode(enabled: boolean): ResolvedPanelThemeMode {
  const readTheme = useCallback((): ResolvedPanelThemeMode => {
    if (typeof document === 'undefined') return 'dark';
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }, []);
  const [resolved, setResolved] = useState<ResolvedPanelThemeMode>(() => readTheme());

  useEffect(() => {
    if (!enabled || typeof document === 'undefined') return undefined;
    const update = () => setResolved(readTheme());
    update();
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, [enabled, readTheme]);

  return resolved;
}

export function buildEmbeddedPanelThemeVars(appAccentColor: string | undefined, resolvedThemeMode: ResolvedPanelThemeMode): CSSProperties {
  const accentVars = deriveAccentVars(appAccentColor || DEFAULT_ACCENT, resolvedThemeMode);
  return {
    ...accentVars,
    '--panel-card-bg': 'var(--bg-card)',
    '--panel-card-bg-opacity': '100%',
    '--panel-accent': accentVars['--accent'],
    '--panel-accent-glow': accentVars['--accent-glow'],
    '--panel-accent-soft': accentVars['--accent-soft'],
    '--panel-accent-shadow': accentVars['--accent-glow-shadow'],
  } as CSSProperties;
}

export function buildPanelThemeVars(theme: PanelThemeState, resolvedThemeMode: ResolvedPanelThemeMode): CSSProperties {
  const accentColor = theme.accentSyncWithDesktop
    ? theme.appAccentColor
    : theme.accentColor || theme.appAccentColor;
  const accentVars = deriveAccentVars(accentColor || DEFAULT_ACCENT, resolvedThemeMode);
  // Widget surface alpha. Replaces the implicit shader-mode softening with a
  // user-controlled slider; .panel-card in tokens.scss applies the alpha via
  // color-mix so only the background fades, not the contents.
  const widgetOpacityPct = Math.round(normalizePanelWidgetOpacity(theme.widgetOpacity) * 100);
  const vars: Record<string, string> = {
    ...accentVars,
    '--panel-card-bg': 'var(--bg-card)',
    '--panel-card-bg-opacity': `${widgetOpacityPct}%`,
    '--panel-accent': accentVars['--accent'],
    '--panel-accent-glow': accentVars['--accent-glow'],
    '--panel-accent-soft': accentVars['--accent-soft'],
    '--panel-accent-shadow': accentVars['--accent-glow-shadow'],
  };
  return vars as CSSProperties;
}

// Panel browsers (kiosk Edge, iOS WKWebView, other tabs) have their own
// localStorage; without this fetch they'd never see the desktop app's
// language choice. Mirrors the fetch-and-apply shape of usePanelTheme.
function usePanelLanguageSync(enabled = true) {
  const { language, setLanguage } = useTranslation();
  const languageRef = useRef(language);
  useEffect(() => { languageRef.current = language; }, [language]);

  const syncLanguage = useCallback(() => {
    if (!enabled) return;
    fetchPreferences().then(prefs => {
      const next = prefs?.theme?.language;
      if (typeof next !== 'string') return;
      if (!(LANGUAGES as readonly string[]).includes(next)) return;
      if (next === languageRef.current) return;
      setLanguage(next as Language);
    }).catch(() => { /* keep current language */ });
  }, [enabled, setLanguage]);

  useEffect(() => {
    if (!enabled) return undefined;
    syncLanguage();
    return onLayoutChanged(syncLanguage);
  }, [enabled, syncLanguage]);
}

export function usePanelTheme(enabled = true, persist = true) {
  const [theme, setTheme] = useState<PanelThemeState>({
    appThemeMode: 'system',
    themeSyncWithDesktop: true,
    themeMode: 'system',
    appAccentColor: DEFAULT_ACCENT,
    accentSyncWithDesktop: true,
    accentColor: '',
    backgroundColor: '',
    backgroundColorLight: '',
    backgroundMode: 'solid',
    backgroundEffect: DEFAULT_PANEL_BACKGROUND_EFFECT,
    backgroundTemplate: DEFAULT_PANEL_BACKGROUND_TEMPLATE,
    backgroundOpacity: DEFAULT_PANEL_BACKGROUND_OPACITY,
    widgetOpacity: DEFAULT_PANEL_WIDGET_OPACITY,
    widgetLabels: DEFAULT_PANEL_WIDGET_LABELS,
  });
  const resolvedMode = useResolvedPanelThemeMode(
    theme.themeSyncWithDesktop ? theme.appThemeMode : theme.themeMode,
  );
  const resolvedModeRef = useRef<ResolvedPanelThemeMode>(resolvedMode);
  useEffect(() => { resolvedModeRef.current = resolvedMode; }, [resolvedMode]);
  const themeRef = useRef(theme);
  useEffect(() => { themeRef.current = theme; }, [theme]);

  const fetchTheme = useCallback(() => {
    if (!enabled) return;
    fetchPreferences().then(prefs => {
      const t = prefs?.theme;
      const p = prefs?.panel;
      setTheme({
        appThemeMode: normalizePanelThemeMode(t?.themeMode),
        themeSyncWithDesktop: normalizePanelDesktopSync(p?.themeSyncWithDesktop),
        themeMode: normalizePanelThemeMode(p?.themeMode),
        appAccentColor: t?.accentColor || DEFAULT_ACCENT,
        accentSyncWithDesktop: normalizePanelDesktopSync(p?.accentSyncWithDesktop),
        accentColor: p?.accentColor ?? '',
        backgroundColor: p?.backgroundColor ?? '',
        backgroundColorLight: p?.backgroundColorLight ?? '',
        backgroundMode: normalizePanelBackgroundMode(p?.backgroundMode),
        backgroundEffect: normalizePanelBackgroundEffect(p?.backgroundEffect),
        backgroundTemplate: normalizePanelBackgroundTemplate(p?.backgroundTemplate),
        backgroundOpacity: normalizePanelBackgroundOpacity(p?.backgroundOpacity),
        widgetOpacity: normalizePanelWidgetOpacity(p?.widgetOpacity),
        widgetLabels: normalizePanelWidgetLabels(p?.widgetLabels),
      });
    }).catch(() => { /* keep local theme */ });
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return undefined;
    fetchTheme();
    return onLayoutChanged(fetchTheme);
  }, [enabled, fetchTheme]);
  // Cross-device prefs push: any /preferences mutation publishes 'prefs'.
  useTopicCallback('prefs', enabled, fetchTheme);

  // `persist=false` (e.g. simulator test devices) keeps every change
  // local-only - the preview reacts but no /preferences write is made.
  const persistPatch = useCallback((patch: Parameters<typeof savePreferences>[0]) => {
    if (!persist) return;
    savePreferences(patch)
      .then(() => broadcastLayoutChanged())
      .catch(() => {});
  }, [persist]);

  const commitThemeSync = useCallback((synced: boolean) => {
    setTheme(prev => ({ ...prev, themeSyncWithDesktop: synced }));
    persistPatch({ panel: { themeSyncWithDesktop: synced } });
  }, [persistPatch]);

  const commitThemeMode = useCallback((mode: ThemeMode) => {
    const nextMode = normalizePanelThemeMode(mode);
    setTheme(prev => ({ ...prev, themeMode: nextMode }));
    persistPatch({ panel: { themeMode: nextMode } });
  }, [persistPatch]);

  const commitAccentSync = useCallback((synced: boolean) => {
    const current = themeRef.current;
    const nextAccent = !synced && !current.accentColor
      ? current.appAccentColor || DEFAULT_ACCENT
      : current.accentColor;
    setTheme(prev => ({
      ...prev,
      accentSyncWithDesktop: synced,
      accentColor: !synced && !prev.accentColor ? prev.appAccentColor || DEFAULT_ACCENT : prev.accentColor,
    }));
    persistPatch({
      panel: {
        accentSyncWithDesktop: synced,
        ...(!synced ? { accentColor: nextAccent || DEFAULT_ACCENT } : {}),
      },
    });
  }, [persistPatch]);

  const commitAccent = useCallback((hex: string) => {
    setTheme(prev => ({ ...prev, accentColor: hex }));
    persistPatch({ panel: { accentColor: hex } });
  }, [persistPatch]);

  const commitBackground = useCallback((hex: string) => {
    // Always set both theme slots from the same column so dark/light stay
    // paired in the picked hue family. Custom (non-preset) hex falls back to
    // the same value for both since no counterpart can be derived.
    const { dark, light } = panelBackgroundPair(hex);
    setTheme(prev => ({ ...prev, backgroundColor: dark, backgroundColorLight: light }));
    persistPatch({ panel: { backgroundColor: dark, backgroundColorLight: light } });
  }, [persistPatch]);

  const commitBackgroundMode = useCallback((mode: PanelBackgroundMode) => {
    setTheme(prev => ({ ...prev, backgroundMode: mode }));
    persistPatch({ panel: { backgroundMode: mode } });
  }, [persistPatch]);

  const commitBackgroundEffect = useCallback((effect: string) => {
    const nextEffect = normalizePanelBackgroundEffect(effect);
    setTheme(prev => ({ ...prev, backgroundEffect: nextEffect }));
    persistPatch({ panel: { backgroundEffect: nextEffect } });
  }, [persistPatch]);

  const commitBackgroundTemplate = useCallback((template: number) => {
    const nextTemplate = normalizePanelBackgroundTemplate(template);
    setTheme(prev => ({ ...prev, backgroundTemplate: nextTemplate }));
    persistPatch({ panel: { backgroundTemplate: nextTemplate } });
  }, [persistPatch]);

  const commitBackgroundOpacity = useCallback((opacity: number) => {
    const nextOpacity = normalizePanelBackgroundOpacity(opacity);
    setTheme(prev => ({ ...prev, backgroundOpacity: nextOpacity }));
    persistPatch({ panel: { backgroundOpacity: nextOpacity } });
  }, [persistPatch]);

  const commitWidgetOpacity = useCallback((opacity: number) => {
    const nextOpacity = normalizePanelWidgetOpacity(opacity);
    setTheme(prev => ({ ...prev, widgetOpacity: nextOpacity }));
    persistPatch({ panel: { widgetOpacity: nextOpacity } });
  }, [persistPatch]);

  const commitWidgetLabels = useCallback((enabled: boolean) => {
    const next = normalizePanelWidgetLabels(enabled);
    setTheme(prev => ({ ...prev, widgetLabels: next }));
    persistPatch({ panel: { widgetLabels: next } });
  }, [persistPatch]);

  return {
    theme,
    commitThemeSync,
    commitThemeMode,
    commitAccentSync,
    previewAccent: (hex: string) => setTheme(prev => ({ ...prev, accentColor: hex })),
    commitAccent,
    previewBackground: (hex: string) => setTheme(prev => (
      resolvedModeRef.current === 'light'
        ? { ...prev, backgroundColorLight: hex }
        : { ...prev, backgroundColor: hex }
    )),
    commitBackground,
    commitBackgroundMode,
    commitBackgroundEffect,
    commitBackgroundTemplate,
    previewBackgroundOpacity: (opacity: number) => setTheme(prev => (
      { ...prev, backgroundOpacity: normalizePanelBackgroundOpacity(opacity) }
    )),
    commitBackgroundOpacity,
    previewWidgetOpacity: (opacity: number) => setTheme(prev => (
      { ...prev, widgetOpacity: normalizePanelWidgetOpacity(opacity) }
    )),
    commitWidgetOpacity,
    commitWidgetLabels,
  };
}

function PanelEditorSheet({
  mode,
  surface,
  editingWidget,
  panelTheme,
  gridColumns,
  gridRows,
  resolvedThemeMode,
  panelThemeStyle,
  closing,
  onClose,
  onThemeSyncCommit,
  onThemeModeCommit,
  onThemeAccentSyncCommit,
  onThemeAccentPreview,
  onThemeAccentCommit,
  onThemeBackgroundPreview,
  onThemeBackgroundCommit,
  onThemeBackgroundModeCommit,
  onThemeBackgroundEffectCommit,
  onThemeBackgroundTemplateCommit,
  onThemeBackgroundOpacityPreview,
  onThemeBackgroundOpacityCommit,
  onThemeWidgetOpacityPreview,
  onThemeWidgetOpacityCommit,
  onThemeWidgetLabelsCommit,
  machineName,
  onMachineNameCommit,
  onAdd,
  onResize,
  onUpdate,
  onRemove,
  selectedMonitoringSlot,
  onSelectedMonitoringSlotChange,
  dockSupported,
  dockEnabled,
  onDockToggle,
}: {
  mode: SheetMode;
  surface: PanelSurface;
  editingWidget: PanelWidget | null;
  panelTheme: PanelThemeState;
  gridColumns: number;
  gridRows: number;
  resolvedThemeMode: ResolvedPanelThemeMode;
  panelThemeStyle: CSSProperties;
  closing: boolean;
  onClose: () => void;
  onThemeSyncCommit: (synced: boolean) => void;
  onThemeModeCommit: (mode: ThemeMode) => void;
  onThemeAccentSyncCommit: (synced: boolean) => void;
  onThemeAccentPreview: (hex: string) => void;
  onThemeAccentCommit: (hex: string) => void;
  onThemeBackgroundPreview: (hex: string) => void;
  onThemeBackgroundCommit: (hex: string) => void;
  onThemeBackgroundModeCommit: (mode: PanelBackgroundMode) => void;
  onThemeBackgroundEffectCommit: (effect: string) => void;
  onThemeBackgroundTemplateCommit: (template: number) => void;
  onThemeBackgroundOpacityPreview: (opacity: number) => void;
  onThemeBackgroundOpacityCommit: (opacity: number) => void;
  onThemeWidgetOpacityPreview: (opacity: number) => void;
  onThemeWidgetOpacityCommit: (opacity: number) => void;
  onThemeWidgetLabelsCommit: (enabled: boolean) => void;
  machineName: string;
  onMachineNameCommit: (next: string) => void;
  onAdd: (type: string, size: PanelWidgetSize) => void;
  onResize: (widgetId: string, size: PanelWidgetSize) => void;
  onUpdate: (widgetId: string, config: Record<string, PanelConfigValue>) => void;
  onRemove: (widgetId: string) => void;
  selectedMonitoringSlot: number;
  onSelectedMonitoringSlotChange: (slot: number) => void;
  dockSupported: boolean;
  dockEnabled: boolean;
  onDockToggle: () => void;
}) {
  const { t } = useTranslation();
  const def = editingWidget ? lookupWidget(editingWidget.type) : undefined;
  const title = mode === 'panelSettings'
    ? 'Settings'
    : mode === 'settings' && editingWidget && def
    ? t(def.meta.i18nKey) || editingWidget.type
    : 'Add a widget';
  const Settings = def?.SettingsComponent;
  const isMonitoringWidget = editingWidget?.type === 'monitoring';
  const widgetSizes = editingWidget && def ? sizesForSurface(def.meta, surface) : [];
  const slotCountOptions = editingWidget && isMonitoringWidget ? slotCountOptionsForSize(editingWidget.size) : [];
  const slotCount = editingWidget && isMonitoringWidget
    ? resolvedSlotCountForSize(editingWidget.size, editingWidget.config?.slotCount as number | undefined)
    : 0;
  const editingSpan = editingWidget ? sizeToSpan(editingWidget.size) : null;
  const editorStyle = {
    ...panelThemeStyle,
    '--panel-columns': gridColumns,
    '--panel-rows': gridRows,
    '--panel-editor-dock-cols': editingSpan?.cols ?? 4,
    '--panel-editor-dock-rows': editingSpan?.rows ?? 4,
  } as CSSProperties;
  const sheetRef = useRef<HTMLElement | null>(null);
  const swipe = usePanelSheetSwipe({
    enabled: !closing,
    sheetRef,
    onDismiss: onClose,
  });
  // Esc closes the sheet. The desktop modals (DeviceModal, ConfirmModal)
  // get this through Overlay; the panel editor sheet keeps its bespoke
  // swipe + dock-motion lifecycle, so we wire the keyboard handler
  // inline rather than wrap the sheet in Overlay (which would conflict
  // with the entry/closing animation states).
  useEffect(() => {
    if (closing) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [closing, onClose]);
  // scale(var(--panel-ui-zoom, 1)) keeps the monitor-panel chrome scale
  // during a swipe-to-dismiss drag; the var falls back to 1 on phone /
  // desktop so it's a no-op there.
  const sheetTransform = swipe.state === 'idle' && swipe.offset === 0
    ? undefined
    : { transform: `translateY(${swipe.offset}px) scale(var(--panel-ui-zoom, 1))` };
  // [data-entered] suppresses the entry keyframe after it has played, so
  // toggling [data-drag] at the end of a snap-back doesn't re-trigger the
  // slide-up. The fallback timer covers the no-interaction case; the
  // state-driven effect flips the flag synchronously the moment the user
  // starts dragging, before [data-drag] ever toggles back off.
  const [didEnter, setDidEnter] = useState(false);
  useEffect(() => {
    if (swipe.state !== 'idle') setDidEnter(true);
  }, [swipe.state]);
  useEffect(() => {
    const t = window.setTimeout(() => setDidEnter(true), 320);
    return () => window.clearTimeout(t);
  }, []);

  const handleResize = (size: PanelWidgetSize) => {
    if (!editingWidget) return;
    const nextSlotCount = resolvedSlotCountForSize(size, editingWidget.config?.slotCount as number | undefined);
    onSelectedMonitoringSlotChange(Math.min(selectedMonitoringSlot, nextSlotCount - 1));
    onResize(editingWidget.id, size);
  };

  const handleSlotCount = (n: number) => {
    if (!editingWidget) return;
    onSelectedMonitoringSlotChange(Math.min(selectedMonitoringSlot, n - 1));
    onUpdate(editingWidget.id, { slotCount: n });
  };

  return (
    <div
      className={`panel-root ${styles.editorBackdrop}`}
      data-mode={mode}
      data-state={closing ? 'closing' : 'open'}
      data-surface={surface}
      data-theme={resolvedThemeMode}
      style={editorStyle}
      onClick={onClose}
    >
      <aside
        ref={sheetRef}
        className={styles.editorSheet}
        data-drag={swipe.state === 'idle' ? undefined : swipe.state}
        data-entered={didEnter ? 'true' : undefined}
        style={sheetTransform}
        onClick={e => e.stopPropagation()}
        onWheel={e => e.stopPropagation()}
      >
        <span className={styles.editorSheetGrabber} aria-hidden="true" />
        <header className={styles.editorHeader}>
          <div className={styles.editorTitle}>{title}</div>
          <button type="button" className={styles.editorIconButton} onClick={onClose} aria-label="Close">
            <X size={17} />
          </button>
        </header>

        {mode === 'catalog' && (
          <PanelWidgetCatalog
            surface={surface}
            onAdd={onAdd}
          />
        )}

        {mode === 'settings' && editingWidget && def && (
          <>
            <div className={styles.editorActions}>
              {(widgetSizes.length > 1 || slotCountOptions.length > 1) && (
                <div className={styles.controlPicker}>
                  {widgetSizes.length > 1 && (
                    <WidgetControlGroup title={isMonitoringWidget ? 'Layout' : 'Size'}>
                      {widgetSizes.map(size => {
                        const SizeIcon = SIZE_ICONS[size];
                        return (
                          <IconLabelButton
                            key={size}
                            className={styles.editorControlButton}
                            active={size === editingWidget.size}
                            icon={SizeIcon ? <SizeIcon aria-hidden="true" /> : undefined}
                            ariaLabel={`${isMonitoringWidget ? 'Layout' : 'Size'} ${size}`}
                            onPress={() => handleResize(size)}
                            title={size}
                          />
                        );
                      })}
                    </WidgetControlGroup>
                  )}
                  {isMonitoringWidget && slotCountOptions.length > 0 && (
                    <WidgetControlGroup title="Slots">
                      {slotCountOptions.map(n => (
                        <IconLabelButton
                          key={n}
                          className={styles.editorControlButton}
                          active={n === slotCount}
                          icon={<SlotCountIcon count={n} size={editingWidget.size} aria-hidden="true" />}
                          ariaLabel={`${n} ${n === 1 ? 'slot' : 'slots'}`}
                          title={`${n} ${n === 1 ? 'slot' : 'slots'}`}
                          onPress={() => handleSlotCount(n)}
                        />
                      ))}
                    </WidgetControlGroup>
                  )}
                </div>
              )}
              <button
                type="button"
                className={styles.removeButton}
                onClick={() => onRemove(editingWidget.id)}
                aria-label="Remove widget"
              >
                <Trash2 size={15} />
              </button>
            </div>
            {Settings ? (
              <div className={styles.settingsBody}>
                <Settings
                  widget={editingWidget}
                  onUpdate={config => onUpdate(editingWidget.id, config)}
                  onResize={handleResize}
                  selectedSlot={isMonitoringWidget ? selectedMonitoringSlot : undefined}
                  onSelectedSlotChange={isMonitoringWidget ? onSelectedMonitoringSlotChange : undefined}
                />
              </div>
            ) : (
              <div className={styles.settingsEmpty}>
                <Settings2 size={18} />
                <span>No settings</span>
              </div>
            )}
          </>
        )}

        {mode === 'panelSettings' && (
          <div className={`${styles.settingsBody} ${styles.panelSettingsStack}`}>
            <PanelHostNameSetting
              machineName={machineName}
              onCommit={onMachineNameCommit}
            />
            {dockSupported && (
              <div className={styles.dockSection}>
                <div className={styles.dockSectionTitle}>Dock</div>
                <div className={styles.dockToggleRow}>
                  <span className={styles.dockToggleHint}>
                    Pin up to 4 shortcuts that stay visible across pages.
                  </span>
                  <Toggle
                    checked={dockEnabled}
                    onChange={onDockToggle}
                    ariaLabel="Dock"
                  />
                </div>
              </div>
            )}
            <PanelThemeSettings
              theme={panelTheme}
              resolvedThemeMode={resolvedThemeMode}
              onThemeSyncCommit={onThemeSyncCommit}
              onThemeModeCommit={onThemeModeCommit}
              onAccentSyncCommit={onThemeAccentSyncCommit}
              onAccentPreview={onThemeAccentPreview}
              onAccentCommit={onThemeAccentCommit}
              onBackgroundPreview={onThemeBackgroundPreview}
              onBackgroundCommit={onThemeBackgroundCommit}
              onBackgroundModeCommit={onThemeBackgroundModeCommit}
              onBackgroundEffectCommit={onThemeBackgroundEffectCommit}
              onBackgroundTemplateCommit={onThemeBackgroundTemplateCommit}
              onBackgroundOpacityPreview={onThemeBackgroundOpacityPreview}
              onBackgroundOpacityCommit={onThemeBackgroundOpacityCommit}
              onWidgetOpacityPreview={onThemeWidgetOpacityPreview}
              onWidgetOpacityCommit={onThemeWidgetOpacityCommit}
              onWidgetLabelsCommit={onThemeWidgetLabelsCommit}
            />
          </div>
        )}
      </aside>
    </div>
  );
}

function usePhonePanelManifest(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    localStorage.setItem(PHONE_PANEL_PWA_KEY, '1');

    const manifest = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const previousManifest = manifest?.getAttribute('href');
    if (manifest) manifest.href = '/panel-phone.webmanifest';

    const appleTitle = document.querySelector<HTMLMetaElement>('meta[name="apple-mobile-web-app-title"]');
    const previousAppleTitle = appleTitle?.getAttribute('content');
    if (appleTitle) appleTitle.content = 'Qos Panel';

    const title = document.title;
    document.title = 'Qos Panel';

    return () => {
      if (manifest && previousManifest) manifest.href = previousManifest;
      if (appleTitle && previousAppleTitle) appleTitle.content = previousAppleTitle;
      document.title = title;
    };
  }, [enabled]);
}

function useIsLandscape(surface: PanelSurface): boolean {
  // Y70 + Q60 are physically fixed orientations and don't flip; only
  // 'phone' surface honours `(orientation: landscape)`.
  const [isLandscape, setIsLandscape] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (surface !== 'phone') {
      setIsLandscape(false);
      return;
    }
    const mq = window.matchMedia('(orientation: landscape)');
    const update = () => setIsLandscape(mq.matches);
    update();
    if (mq.addEventListener) {
      mq.addEventListener('change', update);
      return () => mq.removeEventListener('change', update);
    }
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, [surface]);
  return isLandscape;
}

function usePhoneContentScale(enabled: boolean, rootRef: RefObject<HTMLDivElement | null>) {
  useEffect(() => {
    if (!enabled) return;
    const root = rootRef.current;
    if (!root) return;

    const update = () => {
      const grid = root.querySelector<HTMLElement>(`.${styles.grid}`);
      if (!grid) return;

      const scale = readPhoneWidgetScale(root, grid);
      if (Number.isFinite(scale) && scale > 0) {
        root.style.setProperty('--panel-widget-scale', scale.toFixed(4));
      }
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(root);
    const grid = root.querySelector<HTMLElement>(`.${styles.grid}`);
    if (grid) observer.observe(grid);
    window.visualViewport?.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);

    return () => {
      observer.disconnect();
      window.visualViewport?.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [enabled, rootRef]);
}

function readPhoneWidgetScale(root: HTMLElement, grid: HTMLElement) {
  const rootStyle = getComputedStyle(root);
  const gridStyle = getComputedStyle(grid);
  const columnGap = Number.parseFloat(gridStyle.columnGap) || 0;
  const rowGap = Number.parseFloat(gridStyle.rowGap) || columnGap;
  const isLandscape = window.matchMedia('(orientation: landscape)').matches;
  const measuredScale = readMeasuredPhoneWidgetScale(grid, columnGap, rowGap, isLandscape);
  if (measuredScale !== undefined) return measuredScale;

  const cellSize = readPhoneGridCellSize(rootStyle, columnGap, rowGap, isLandscape);
  return cellSize / PHONE_WIDGET_REFERENCE_CELL;
}

function readPhoneGridCellSize(
  rootStyle: CSSStyleDeclaration,
  columnGap: number,
  rowGap: number,
  isLandscape: boolean,
) {
  const cssCellSize = Number.parseFloat(rootStyle.getPropertyValue('--panel-cell-size'));
  if (Number.isFinite(cssCellSize) && cssCellSize > 0) return cssCellSize;

  const viewport = window.visualViewport;
  const viewportWidth = isLandscape
    ? Math.max(window.innerWidth, viewport?.width ?? 0)
    : viewport?.width ?? window.innerWidth;
  const viewportHeight = isLandscape
    ? Math.max(window.innerHeight, viewport?.height ?? 0)
    : viewport?.height ?? window.innerHeight;
  const safeArea = readSafeAreaInsets();
  const safeTop = Math.max(8, safeArea.top);
  const safeRight = Math.max(8, safeArea.right);
  const safeBottom = isLandscape ? safeTop : Math.max(8, safeArea.bottom);
  const safeLeft = Math.max(8, safeArea.left);

  if (isLandscape) {
    const rows = Number.parseInt(rootStyle.getPropertyValue('--panel-rows'), 10) || 4;
    return (viewportHeight - safeTop - safeBottom - (rows - 1) * rowGap) / rows;
  }

  const columns = Number.parseInt(rootStyle.getPropertyValue('--panel-columns'), 10) || 4;
  return (viewportWidth - safeLeft - safeRight - (columns - 1) * columnGap) / columns;
}

function readMeasuredPhoneWidgetScale(grid: HTMLElement, columnGap: number, rowGap: number, isLandscape: boolean) {
  // Skip hoisted cells - fixed-position motion wrappers don't reflect the
  // grid's actual cell size and would skew the global widget scale.
  const cells = Array.from(grid.querySelectorAll<HTMLElement>('[data-panel-widget-id]'))
    .filter(cell => !cell.classList.contains(styles.cellEditorDocked) && !cell.classList.contains(styles.cellResizeMotion));
  const scales = cells
    .map(cell => {
      const cellStyle = getComputedStyle(cell);
      const columnSpan = readGridSpan(cell.style.gridColumn, cellStyle.gridColumnEnd, cellStyle.gridColumn) ?? 1;
      const rowSpan = readGridSpan(cell.style.gridRow, cellStyle.gridRowEnd, cellStyle.gridRow) ?? 1;
      if (!isLandscape) {
        const width = (cell.offsetWidth - (columnSpan - 1) * columnGap) / columnSpan;
        const height = (cell.offsetHeight - (rowSpan - 1) * rowGap) / rowSpan;
        const cellSize = Math.min(width, height);
        return cellSize / PHONE_WIDGET_REFERENCE_CELL;
      }

      const widthScale = cell.offsetWidth / (columnSpan * PHONE_WIDGET_REFERENCE_CELL);
      const heightScale = cell.offsetHeight / (rowSpan * PHONE_WIDGET_REFERENCE_CELL);
      return Math.min(widthScale, heightScale);
    })
    .filter(scale => Number.isFinite(scale) && scale > 0);
  return scales.length ? Math.max(...scales) : undefined;
}

function readGridSpan(...values: string[]) {
  for (const value of values) {
    const match = /span\s+(\d+)/.exec(value);
    if (!match) continue;
    const span = Number.parseInt(match[1], 10);
    if (Number.isFinite(span) && span > 0) return span;
  }
  return undefined;
}

interface NativeSettingsWindow extends Window {
  qosNative?: {
    openSettings?: () => void;
  };
  webkit?: {
    messageHandlers?: {
      qosNativeSettings?: {
        postMessage?: (message: string) => void;
      };
    };
  };
}

function hasNativeSettingsBridge() {
  const nativeWindow = window as NativeSettingsWindow;
  return typeof nativeWindow.qosNative?.openSettings === 'function'
    || typeof nativeWindow.webkit?.messageHandlers?.qosNativeSettings?.postMessage === 'function';
}

function useNativeSettingsBridge(enabled: boolean) {
  const [available, setAvailable] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const update = () => setAvailable(hasNativeSettingsBridge());
    update();
    window.addEventListener('qos:native-ready', update);
    return () => window.removeEventListener('qos:native-ready', update);
  }, [enabled]);

  const open = useCallback(() => {
    const nativeWindow = window as NativeSettingsWindow;
    if (typeof nativeWindow.qosNative?.openSettings === 'function') {
      nativeWindow.qosNative.openSettings();
      return;
    }
    nativeWindow.webkit?.messageHandlers?.qosNativeSettings?.postMessage?.('open');
  }, []);

  return { available: enabled && available, open };
}

// Visualises the cells the dragged widget would commit to if it
// were dropped right now. Reads currentOverIdRef + the active
// widget's size to compute the (col, row, colSpan, rowSpan) rect on
// the current page. Tinted with the panel accent so it reads as
// "this is where it lands" feedback rather than a debug overlay.
function DragTargetHighlight({
  pageId,
  activeWidgetId,
  paginatedLayout,
  overIdSignal,
  overIdRef,
}: {
  pageId: string;
  activeWidgetId: string;
  paginatedLayout: PanelLayout;
  overIdSignal: number;
  overIdRef: { current: string | null };
}) {
  void overIdSignal;
  const overId = overIdRef.current;
  if (!overId) return null;
  // Find active widget for its size.
  let active: PanelWidget | undefined;
  for (const p of paginatedLayout.pages) {
    const w = p.widgets.find(w => w.id === activeWidgetId);
    if (w) { active = w; break; }
  }
  if (!active) return null;
  const span = sizeToSpan(active.size);

  // Resolve the over id to a target (col, row, pageId).
  let targetCol = -1;
  let targetRow = -1;
  let targetPageId: string | null = null;
  if (overId.startsWith('empty:')) {
    const rest = overId.slice(6);
    const lastColon = rest.lastIndexOf(':');
    if (lastColon < 0) return null;
    const middleColon = rest.lastIndexOf(':', lastColon - 1);
    if (middleColon < 0) return null;
    targetPageId = rest.slice(0, middleColon);
    targetCol = Number.parseInt(rest.slice(middleColon + 1, lastColon), 10);
    targetRow = Number.parseInt(rest.slice(lastColon + 1), 10);
  } else {
    for (const p of paginatedLayout.pages) {
      const w = p.widgets.find(w => w.id === overId);
      if (w) { targetPageId = p.id; targetCol = w.col; targetRow = w.row; break; }
    }
  }
  if (targetPageId !== pageId) return null;
  if (!Number.isFinite(targetCol) || !Number.isFinite(targetRow)) return null;
  if (targetCol < 0 || targetRow < 0) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        gridColumn: `${targetCol + 1} / span ${span.cols}`,
        gridRow: `${targetRow + 1} / span ${span.rows}`,
        pointerEvents: 'none',
        background: 'color-mix(in srgb, var(--accent) 18%, transparent)',
        outline: '2px dashed color-mix(in srgb, var(--accent) 80%, transparent)',
        outlineOffset: '-2px',
        borderRadius: '12px',
        zIndex: 1,
      }}
    />
  );
}

function EmptyCellDroppable({ pageId, col, row }: { pageId: string; col: number; row: number }) {
  // 1x1 drop target rendered into the grid at the empty cell.
  // Pointer-events stay enabled so the collision detector can pick it
  // up; the element itself is invisible. Visual feedback during drag
  // comes from the floating DragOverlay clone.
  const id = `empty:${pageId}:${col}:${row}`;
  const { setNodeRef } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      data-panel-empty-cell-id={id}
      aria-hidden="true"
      style={{
        gridColumn: `${col + 1} / span 1`,
        gridRow: `${row + 1} / span 1`,
        pointerEvents: 'none',
      }}
    />
  );
}

export function PanelTouchCell({
  widget,
  surface,
  rearranging,
  pressHint = false,
  dimmed = false,
  editorDockMotion = null,
  editorDockPortal = null,
  isDragSource = false,
  resizeMotion = false,
  selectedSlot,
  onSelectSlot,
  clickthrough = false,
  onContextMenu,
  onRearrangeTap,
  cellPointers,
  onSimulatorClick,
  previewLayout = null,
  anyDragging = false,
  onSectionNavigate,
  onConfigureWidget,
}: {
  widget: PanelWidget;
  surface?: PanelSurface;
  rearranging: boolean;
  pressHint?: boolean;
  dimmed?: boolean;
  editorDockMotion?: EditorDockMotion | null;
  editorDockPortal?: HTMLElement | null;
  isDragSource?: boolean;
  resizeMotion?: boolean;
  selectedSlot?: number;
  onSelectSlot?: (slot: number) => void;
  clickthrough?: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
  onRearrangeTap: (e: React.MouseEvent) => void;
  cellPointers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
  onSimulatorClick?: () => void;
  previewLayout?: PanelLayout | null;
  anyDragging?: boolean;
  onSectionNavigate?: DashboardSectionNavigate;
  onConfigureWidget?: (widget: PanelWidget) => void;
}) {
  const { t } = useTranslation();
  const def = lookupWidget(widget.type);
  const span = sizeToSpan(widget.size);
  // dnd-kit must already be tracking pointerdowns when the long-press
  // fires; otherwise a hold + drag gesture has no chance to convert into
  // a sort-drag because dnd-kit only starts tracking on its own
  // onPointerDown listener. Disable only during transitional motion
  // states where a drag would fight the in-flight animation.
  const {
    attributes, listeners, setNodeRef,
    isDragging,
  } = useSortable({
    id: widget.id,
    disabled: Boolean(editorDockMotion) || Boolean(resizeMotion),
  });

  // Explicit grid placement: widgets sit at their stored (col, row),
  // gaps are honored. CSS Grid is 1-indexed.
  const gridColumn = `${widget.col + 1} / span ${span.cols}`;
  const gridRow = `${widget.row + 1} / span ${span.rows}`;

  // State-based drag projection. PanelContent recomputes
  // `previewLayout` every time the over target moves to a new cell;
  // each cell looks up its OWN preview position, computes the pixel
  // delta from its committed (col, row), and applies a translate as
  // an inline style. CSS transition animates the slide. We don't use
  // dnd-kit's strategy/transform path because the over target is a
  // non-sortable empty-cell droppable and dnd-kit's useSortable
  // memoization doesn't re-fire for it.
  const previewWidget = previewLayout
    ? findWidgetById(previewLayout, widget.id)
    : null;
  let previewDx = 0;
  let previewDy = 0;
  if (previewWidget && !isDragging
    && (previewWidget.col !== widget.col || previewWidget.row !== widget.row)) {
    const root = typeof document !== 'undefined'
      ? document.querySelector<HTMLElement>('[data-surface]')
      : null;
    const metrics = readCellMetrics(root);
    if (metrics) {
      const stride = metrics.cellSize + metrics.gap;
      const rowStride = metrics.rowSize + metrics.gap;
      previewDx = Math.round((previewWidget.col - widget.col) * stride);
      previewDy = Math.round((previewWidget.row - widget.row) * rowStride);
    }
  }
  const previewTransform = previewDx !== 0 || previewDy !== 0
    ? `translate3d(${previewDx}px, ${previewDy}px, 0)`
    : undefined;
  const previewTransition = 'transform 220ms cubic-bezier(0.25, 1, 0.5, 1)';

  if (!def) {
    // Reconciler in usePanelLayout drops orphan marketplace widgets after
    // the registry has loaded once, so the only path to this branch is
    // either (a) the registry is still loading on app start, or (b) a
    // built-in widget type was renamed/removed mid-session. Render a
    // minimal placeholder rather than a red "unknown:" box — the user
    // shouldn't see internal type strings, and the layout will self-heal
    // on the next normalize pass.
    return (
      <div
        className={styles.cellWrap}
        style={{
          gridColumn,
          gridRow,
          '--panel-span-cols': span.cols,
          '--panel-span-rows': span.rows,
        } as CSSProperties}
      />
    );
  }

  const Comp = def.Component;
  const labelText = t(def.meta.i18nKey) || widget.type;
  const wrapStyle = {
    gridColumn,
    gridRow,
    '--panel-span-cols': span.cols,
    '--panel-span-rows': span.rows,
    '--panel-editor-dock-cols': span.cols,
    '--panel-editor-dock-rows': span.rows,
    ...editorDockMotion?.style,
  } as CSSProperties;

  if (rearranging) {
    return (
      <div
        ref={setNodeRef}
        data-panel-widget-id={widget.id}
        data-panel-cell-col={widget.col}
        data-panel-cell-row={widget.row}
        data-panel-cell-col-span={span.cols}
        data-panel-cell-row-span={span.rows}
        data-clickthrough={clickthrough ? 'true' : undefined}
        className={`${styles.cellWrap} ${dimmed ? styles.cellContextDimmed : ''} ${isDragSource ? styles.cellDragSource : ''}`}
        style={{
          ...wrapStyle,
          // Make-room transform comes from previewLayout, not from
          // dnd-kit's strategy. The transition animates the slide.
          transform: !isDragging ? previewTransform : undefined,
          transition: previewTransition,
          zIndex: isDragging ? 50 : undefined,
        } as CSSProperties}
        onContextMenu={onContextMenu}
        {...attributes}
        {...listeners}
        onClick={onRearrangeTap}
      >
        <div className={`panel-card ${styles.cell} ${anyDragging ? '' : styles.cellRearranging}`} data-size={widget.size}>
          <div className={styles.cellScaler} style={{ pointerEvents: 'none' }}>
            <Comp widget={widget} surface={surface} />
          </div>
        </div>
        <div className={styles.cellLabelStrip}>
          <WidgetCellLabel label={labelText} />
        </div>
      </div>
    );
  }

  // Compose cellPointers (tap + long-press menu + press feedback) with
  // dnd-kit's onPointerDown so both fire on a single press: cellPointers
  // arms its long-press timer for the menu, and dnd-kit's PointerSensor
  // arms its delay timer for drag activation. The user's intent (tap,
  // long-press, or long-press-then-drag) is disambiguated by which
  // timer fires + whether movement follows.
  const dragMotionActive = Boolean(editorDockMotion) || Boolean(resizeMotion);
  const composedPointerHandlers = dragMotionActive ? {} : {
    ...cellPointers,
    onPointerDown: (e: React.PointerEvent) => {
      cellPointers.onPointerDown(e);
      // Skip dnd-kit activation for scrolled regions inside widgets.
      // cellPointers already bails on these (so the long-press menu
      // doesn't open during scroll); arming the drag here would let a
      // 500ms hold inside a scroll list start a sort-drag, which would
      // be inconsistent and confusing.
      const target = e.target;
      if (target instanceof Element && target.closest('[data-panel-scrollable="true"]')) return;
      listeners?.onPointerDown?.(e);
    },
  };
  const cellNode = (
    <div
      ref={dragMotionActive ? undefined : setNodeRef}
      data-panel-widget-id={widget.id}
      data-panel-cell-col={widget.col}
      data-panel-cell-row={widget.row}
      data-panel-cell-col-span={span.cols}
      data-panel-cell-row-span={span.rows}
      data-cell-state={editorDockMotion ? 'docked' : undefined}
      data-clickthrough={clickthrough && !editorDockMotion ? 'true' : undefined}
      className={`${styles.cellWrap} ${editorDockMotion ? styles.cellEditorDocked : ''} ${resizeMotion ? styles.cellResizeMotion : ''} ${editorDockMotion?.phase === 'closing' ? styles.cellEditorDockClosing : ''} ${dimmed ? styles.cellContextDimmed : ''}`}
      style={{
        ...wrapStyle,
        // Make-room transform comes from previewLayout (state-based)
        // not dnd-kit's strategy. The DragOverlay floats the active
        // widget at the cursor; this transform shifts displaced
        // siblings out of the way. The transition animates the slide.
        transform: !dragMotionActive && !isDragging ? previewTransform : undefined,
        transition: !dragMotionActive ? previewTransition : undefined,
        // Hold the z-index bump until rearrange-mode visuals are on. dnd-kit
        // activates at the long-press mark with isDragging=true even before
        // any movement; popping the cell above the context menu in that
        // window would fight the menu the same press just opened.
        zIndex: !dragMotionActive && isDragging && rearranging ? 50 : undefined,
      }}
      onContextMenu={dragMotionActive ? e => e.preventDefault() : onContextMenu}
      onClick={onSimulatorClick}
      {...(dragMotionActive ? {} : attributes)}
      {...composedPointerHandlers}
    >
      <div
        className={`panel-card ${styles.cell} ${pressHint ? styles.cellPressHint : ''}`}
        data-size={widget.size}
      >
        <div className={styles.cellScaler}>
          <Comp
            widget={widget}
            surface={surface}
            selectedSlot={selectedSlot}
            onSelectSlot={onSelectSlot}
            onSectionNavigate={onSectionNavigate}
            onConfigure={onConfigureWidget ? () => onConfigureWidget(widget) : undefined}
          />
        </div>
      </div>
      <div className={styles.cellLabelStrip}>
        <WidgetCellLabel label={labelText} />
      </div>
    </div>
  );

  if (editorDockMotion) {
    // Portal the docked cell into a panel-root-level container so its
    // `position: fixed` anchors to the viewport instead of the pager
    // track. The pager track applies a transform when the active page
    // is not the first one, which would otherwise become the containing
    // block and offset the docked widget by the page-translation
    // distance (i.e. push it offscreen).
    return (
      <>
        {editorDockPortal ? createPortal(cellNode, editorDockPortal) : cellNode}
        <div
          data-panel-widget-slot-id={widget.id}
          className={styles.cellSlotPlaceholder}
          style={{ gridColumn, gridRow }}
          aria-hidden="true"
        />
      </>
    );
  }

  return cellNode;
}

// Renders inside @dnd-kit's DragOverlay (which is portaled to
// document.body). Carries the panel CSS context so theme tokens and
// the panel-card class chain still apply to the floating clone.
function PanelDragOverlayCell({
  widget,
  surface,
  themeStyle,
  themeMode,
  fixedWidth,
  fixedHeight,
}: {
  widget: PanelWidget;
  surface?: PanelSurface;
  themeStyle: CSSProperties;
  themeMode: ResolvedPanelThemeMode;
  fixedWidth?: number;
  fixedHeight?: number;
}) {
  const { t } = useTranslation();
  const def = lookupWidget(widget.type);
  const span = sizeToSpan(widget.size);
  if (!def) return null;
  const Comp = def.Component;
  const labelText = t(def.meta.i18nKey) || widget.type;
  return (
    <div
      className={`panel-root ${styles.dragOverlayHost}`}
      data-theme={themeMode}
      data-surface={surface}
      style={themeStyle}
    >
      <div
        className={`${styles.cellWrap} ${styles.dragOverlayCell}`}
        style={{
          width: fixedWidth ? `${fixedWidth}px` : undefined,
          height: fixedHeight ? `${fixedHeight}px` : undefined,
          '--panel-span-cols': span.cols,
          '--panel-span-rows': span.rows,
        } as CSSProperties}
      >
        <div className={`panel-card ${styles.cell}`} data-size={widget.size}>
          <div className={styles.cellScaler} style={{ pointerEvents: 'none' }}>
            <Comp widget={widget} surface={surface} />
          </div>
        </div>
        <div className={styles.cellLabelStrip}>
          <WidgetCellLabel label={labelText} />
        </div>
      </div>
    </div>
  );
}
