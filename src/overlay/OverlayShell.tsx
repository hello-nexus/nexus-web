import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  listOverlayWidgets,
  patchOverlayWidget,
  deleteOverlayWidget,
  type OverlayWidgetDto,
} from '../api/overlay';
import { fetchService, postService } from '../api/service';
import { useTopicCallback } from '../hooks/useMultiplexSocket';
import { sizesForSurface, WIDGET_REGISTRY } from '../panel/widgets/registry';
import { normalizePanelWidgetSize, type PanelConfigValue, type PanelWidget, type PanelWidgetSize } from '../panel/types';
import { buildEmbeddedPanelThemeVars } from '../panel/PanelApp';
import { applyAccentColor, applyThemeMode, type ThemeMode } from '../lib/settings';
import { WidgetContextMenu } from '../panel/widgets/common/WidgetContextMenu';
import { WidgetEditSheet } from '../panel/widgets/common/WidgetEditSheet';
import { postToHost } from './hostBridge';
import styles from './OverlayShell.module.scss';

// Server-side prefs fields the desktop overlay consumes.
interface ServerPrefs {
  accentColor?: string;
  themeMode?: string;
  overlayWidgetsAlwaysOnTop?: boolean;
  overlayWidgetScale?: number;
  overlayWidgetOpacity?: number;
  overlayWidgetsMonitor?: number;
}

function normalizeOpacity(raw: number | undefined): number {
  if (typeof raw !== 'number' || !Number.isFinite(raw)) return 1;
  return Math.min(Math.max(raw, 0), 1);
}

// Base cell size at 100% scale. The user-configurable
// UiSettings.OverlayWidgetScale (50-200) multiplies this to give the
// runtime cell px applied to both layout and content.
const BASE_CELL_PX = 86;
// Visual inset on each side of the cell footprint, matching the panel's
// widget-card margins. 6px = panel's --panel-widget-card-margin-x default.
const WIDGET_INSET_PX = 6;
// How far the cursor must travel before a pointerdown is treated as a
// drag rather than a click. Below this, the widget gets the click event
// (calculator buttons, slider thumbs, etc).
const DRAG_THRESHOLD_PX = 5;
// Drag positioning grid is 4x finer than the widget sizing grid - users
// can place a widget at quarter-cell increments while widget sizes
// remain whole-cell (1x1, 2x2, 4x2, 4x4).
const DRAG_STEP = 0.25;

interface MonitorParams {
  monitor: number;
}

function readMonitorParams(): MonitorParams {
  const params = new URLSearchParams(window.location.search);
  const monitorRaw = params.get('monitor');
  const monitor = monitorRaw !== null && Number.isFinite(Number(monitorRaw))
    ? Math.max(0, Math.floor(Number(monitorRaw)))
    : 0;
  return { monitor };
}

function snapToStep(value: number): number {
  return Math.max(0, Math.round(value / DRAG_STEP) * DRAG_STEP);
}

function clampCell(value: number, max: number): number {
  return Math.max(0, Math.min(max, value));
}

function widthCells(size: string): number {
  return size === '4x2' || size === '4x4' ? 4 : size === '1x1' ? 1 : 2;
}

function heightCells(size: string): number {
  return size === '4x4' || size === '2x4' ? 4 : size === '1x1' ? 1 : 2;
}

interface ContextMenuState {
  x: number;
  y: number;
  widgetId: string | null;
}

interface DragOverride {
  id: string;
  col: number;
  row: number;
}

function reportLayoutToHost(rects: { id: string; x: number; y: number; w: number; h: number }[]) {
  postToHost({ type: 'reportLayout', widgets: rects });
}

function reportLayoutWithPopover(
  rects: { id: string; x: number; y: number; w: number; h: number }[],
  popover: { x: number; y: number; w: number; h: number },
) {
  postToHost({ type: 'reportLayout', widgets: rects, popover });
}

export default function OverlayShell() {
  const { monitor } = useMemo(readMonitorParams, []);
  const [scale, setScale] = useState(100);
  const scaleFactor = useMemo(() => scale / 100, [scale]);
  const cellPx = useMemo(() => Math.round(BASE_CELL_PX * scaleFactor), [scaleFactor]);
  const [layout, setLayout] = useState<OverlayWidgetDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [widgetOpacity, setWidgetOpacity] = useState(1);
  const [menu, setMenu] = useState<ContextMenuState | null>(null);
  // Effective rendered rect of the open context menu, populated by the
  // menu component once it has measured itself and clamped to viewport
  // edges. Cleared on close. Drives the host's popover carve-out so the
  // mask follows the menu's *visible* position rather than the click.
  const [menuRect, setMenuRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const [dragOverride, setDragOverride] = useState<DragOverride | null>(null);
  const [editingWidgetId, setEditingWidgetId] = useState<string | null>(null);
  // Slot index the user is targeting in the monitoring widget edit flow.
  // Mirrors PanelApp's pattern: the slot picker dotted border renders on
  // the live widget tile, the user clicks a slot to choose which to swap,
  // and the sensor list inside the edit sheet acts on that slot. State
  // lives here so both consumers (tile and sheet) read the same source.
  const [selectedMonitoringSlot, setSelectedMonitoringSlot] = useState(0);
  // The edit sheet measures and reports its rendered rect; the host carves
  // out this rect (plus widget rects) so the rest of the screen stays
  // see-through and click-through to the desktop.
  const [editingSheetRect, setEditingSheetRect] = useState<
    { x: number; y: number; w: number; h: number } | null
  >(null);

  const reload = useCallback(async () => {
    const result = await listOverlayWidgets();
    setLayout(result);
    setLoading(false);
  }, []);

  const [accentColor, setAccentColor] = useState<string | null>(null);
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');

  // Tracks the last monitor index we pushed to the host via webMessage.
  // Initialized to a sentinel that never matches a real index (or -1)
  // so the first prefs sync after mount always emits a setMonitor -
  // the launch URL's ?monitor param may not agree with the persisted
  // pref (different process / stale schtask invocation) and the host
  // needs an authoritative initial state.
  const lastSentMonitorRef = useRef<number>(Number.NaN);

  // Mirror the app theme from /preferences (profile-scoped). The desktop
  // overlay's WebView2 has its own localStorage so the dashboard's theme
  // doesn't propagate via that path; the server's /preferences is the
  // source of truth, and the prefs WS broadcast keeps us in sync when
  // the user changes theme / scale elsewhere.
  const refreshPrefs = useCallback(async () => {
    const prefs = await fetchService<ServerPrefs>('/preferences');
    if (!prefs) return;
    if (typeof prefs.overlayWidgetsAlwaysOnTop === 'boolean') {
      setAlwaysOnTop(prefs.overlayWidgetsAlwaysOnTop);
    }
    if (typeof prefs.overlayWidgetScale === 'number') {
      setScale(Math.max(50, Math.min(200, Math.round(prefs.overlayWidgetScale))));
    }
    setWidgetOpacity(normalizeOpacity(prefs.overlayWidgetOpacity));
    if (prefs.accentColor) {
      applyAccentColor(prefs.accentColor);
      setAccentColor(prefs.accentColor);
    }
    if (prefs.themeMode) {
      applyThemeMode(prefs.themeMode as ThemeMode);
      setThemeModeState(prefs.themeMode as ThemeMode);
    }
    if (typeof prefs.overlayWidgetsMonitor === 'number'
        && prefs.overlayWidgetsMonitor !== lastSentMonitorRef.current) {
      // Push the move to the host immediately via the same webMessage
      // bridge we use for setAlwaysOnTop. The host moves the existing
      // window (no teardown/respawn) and the prefs poll's 5 s slow path
      // becomes a no-op for this transition.
      lastSentMonitorRef.current = prefs.overlayWidgetsMonitor;
      postToHost({ type: 'setMonitor', value: prefs.overlayWidgetsMonitor });
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    listOverlayWidgets().then(result => {
      if (cancelled) return;
      setLayout(result);
      setLoading(false);
    });
    void refreshPrefs();
    return () => { cancelled = true; };
  }, [refreshPrefs]);

  useTopicCallback('prefs', true, () => { void reload(); void refreshPrefs(); });

  useEffect(() => {
    const onContextMenu = (event: MouseEvent) => event.preventDefault();
    window.addEventListener('contextmenu', onContextMenu);
    return () => window.removeEventListener('contextmenu', onContextMenu);
  }, []);


  const themeStyle = useMemo<CSSProperties>(() => {
    // applyThemeMode resolves "system" -> dark/light and writes data-theme;
    // re-read after each refreshPrefs run so themeStyle picks up the right
    // resolved mode for the panel-card color tokens.
    const resolvedMode = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
    // --panel-cell-size stays at the base value so widget content lays out
    // at its native size; CSS zoom on the widget body multiplies that by
    // scaleFactor visually. The container around the widget uses cellPx
    // (already scaled) so the rendered size matches.
    return {
      ...buildEmbeddedPanelThemeVars(accentColor ?? undefined, resolvedMode as 'light' | 'dark'),
      '--panel-cell-size': `${BASE_CELL_PX}px`,
      '--panel-row-size': `${BASE_CELL_PX}px`,
      // Drives panel-card surface alpha (same token the panel UI uses).
      // Both desktop overlay hosts composite per-pixel alpha against the
      // wallpaper, so this takes visible effect immediately.
      '--panel-card-bg-opacity': `${Math.round(widgetOpacity * 100)}%`,
    } as CSSProperties;
  }, [accentColor, themeMode, widgetOpacity]);

  // Single-monitor model: render every widget regardless of its
  // legacy `monitor` field. The overlay process now runs on exactly
  // one user-chosen monitor (set via the popup dropdown); the per-widget
  // monitor index is vestigial data that we don't filter on anymore.
  // Keeps existing layouts visible after a monitor switch.
  void monitor; // suppresses unused-binding lint; still read above for URL parsing
  const monitorWidgets = layout;

  // Server-side scale changes preserve visual position but don't know the
  // monitor size, so a widget close to the right/bottom edge can end up
  // partly off-screen after scaling up. Check every commit; if anything's
  // out of bounds, PATCH it with the clamped value. Run-once via a ref'd
  // lookup so we don't fight ourselves while the PATCH is in flight.
  const reconciledRef = useRef(new Set<string>());
  useEffect(() => {
    const maxCol = window.innerWidth / cellPx;
    const maxRow = window.innerHeight / cellPx;
    for (const entry of monitorWidgets) {
      const w = widthCells(entry.size);
      const h = heightCells(entry.size);
      const clampedCol = clampCell(entry.col, Math.max(0, maxCol - w));
      const clampedRow = clampCell(entry.row, Math.max(0, maxRow - h));
      // Snap clamped values back onto the drag grid so the persisted
      // position is at a 0.25-cell increment.
      const colTarget = snapToStep(clampedCol);
      const rowTarget = snapToStep(clampedRow);
      if (colTarget === entry.col && rowTarget === entry.row) {
        reconciledRef.current.delete(entry.id);
        continue;
      }
      const key = `${entry.id}:${colTarget}:${rowTarget}`;
      if (reconciledRef.current.has(key)) continue;
      reconciledRef.current.add(key);
      void patchOverlayWidget(entry.id, { col: colTarget, row: rowTarget });
    }
  }, [monitorWidgets, cellPx]);

  const renderedWidgets = useMemo(() => {
    if (!dragOverride) return monitorWidgets;
    return monitorWidgets.map(entry => entry.id === dragOverride.id
      ? { ...entry, col: dragOverride.col, row: dragOverride.row }
      : entry);
  }, [monitorWidgets, dragOverride]);

  // Compute the rect that the host should make hit-testable for each widget.
  // We use the visible (inset) rect rather than the full cell footprint so
  // there's a real input gap between widgets - clicks in the gap fall through
  // to the desktop instead of into a widget you didn't aim at.
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const widgetRects = renderedWidgets.map(entry => ({
        id: entry.id,
        x: entry.col * cellPx + WIDGET_INSET_PX,
        y: entry.row * cellPx + WIDGET_INSET_PX,
        w: widthCells(entry.size) * cellPx - WIDGET_INSET_PX * 2,
        h: heightCells(entry.size) * cellPx - WIDGET_INSET_PX * 2,
      }));
      // Edit sheet rect takes priority over the context menu rect when both
      // happen to be open (e.g. quick reopen). With neither, we report just
      // widget rects so the rest of the WebView2 stays click-through.
      const popover = editingSheetRect ?? menuRect;
      if (popover) {
        reportLayoutWithPopover(widgetRects, popover);
      } else {
        reportLayoutToHost(widgetRects);
      }
    });
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [renderedWidgets, cellPx, menuRect, editingSheetRect]);

  const handleToggleAlwaysOnTop = useCallback(async () => {
    const next = !alwaysOnTop;
    setAlwaysOnTop(next);
    // Push the change to the host bridge synchronously so the Z-order
    // flips immediately. POST /preferences in parallel for persistence;
    // the prefs WS broadcast that follows will be a no-op.
    postToHost({ type: 'setAlwaysOnTop', value: next });
    await postService('/preferences', { overlayWidgetsAlwaysOnTop: next });
    setMenu(null);
  }, [alwaysOnTop]);

  const handleUnpin = useCallback(async (widgetId: string) => {
    setMenu(null);
    const ok = await deleteOverlayWidget(widgetId);
    if (ok) await reload();
  }, [reload]);

  const handleDragCommit = useCallback(async (id: string, col: number, row: number) => {
    setDragOverride(null);
    setLayout(prev => prev.map(entry => entry.id === id ? { ...entry, col, row } : entry));
    await patchOverlayWidget(id, { col, row });
  }, []);

  const handleResize = useCallback(async (id: string, size: PanelWidgetSize) => {
    setLayout(prev => prev.map(entry => entry.id === id ? { ...entry, size } : entry));
    await patchOverlayWidget(id, { size });
  }, []);

  const handleUpdateConfig = useCallback(async (
    id: string,
    config: Record<string, PanelConfigValue>,
  ) => {
    let merged: Record<string, PanelConfigValue> | undefined;
    setLayout(prev => prev.map(entry => {
      if (entry.id !== id) return entry;
      merged = { ...entry.config, ...config };
      return { ...entry, config: merged };
    }));
    if (merged) await patchOverlayWidget(id, { config: merged });
  }, []);

  const handleRemoveFromEditor = useCallback(async (id: string) => {
    setEditingWidgetId(null);
    const ok = await deleteOverlayWidget(id);
    if (ok) await reload();
  }, [reload]);

  // While either the context menu or the edit sheet is open, force the
  // desktop overlay always-on-top so the popover can't slip behind another
  // window. We read the user's value out of a ref at cleanup time so prefs
  // broadcasts arriving during the interaction don't re-fire this effect
  // (which would briefly flip the host back to the user's value before
  // re-asserting `true`). No POST to /preferences here - the persisted
  // setting is unchanged.
  const alwaysOnTopRef = useRef(alwaysOnTop);
  useEffect(() => { alwaysOnTopRef.current = alwaysOnTop; }, [alwaysOnTop]);
  const popoverOpen = menu !== null || editingWidgetId !== null;
  useEffect(() => {
    if (!popoverOpen) return;
    postToHost({ type: 'setAlwaysOnTop', value: true });
    return () => {
      postToHost({ type: 'setAlwaysOnTop', value: alwaysOnTopRef.current });
    };
  }, [popoverOpen]);

  // Reset the slot picker any time we open the editor on a new widget,
  // matching PanelApp's expected starting state (slot 0).
  useEffect(() => {
    if (editingWidgetId) setSelectedMonitoringSlot(0);
  }, [editingWidgetId]);

  // Mirror data-theme on the .panel-root container so panel-card token
  // overrides (`.panel-root[data-theme='light']`) resolve correctly. Other
  // panel surfaces (PanelApp, WidgetEditSheet, etc) already do this; the
  // overlay shell historically relied on documentElement's data-theme,
  // which doesn't reach panel-card scoped tokens.
  const resolvedThemeAttr = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';

  if (loading) return <div className={`panel-root ${styles.root}`} aria-hidden style={themeStyle} />;

  return (
    <div
      className={`panel-root ${styles.root}`}
      style={themeStyle}
      data-surface="desktop"
      data-theme={resolvedThemeAttr}
    >
      {renderedWidgets.map(entry => {
        const editingThis = editingWidgetId === entry.id && entry.type === 'monitoring';
        return (
          <OverlayWidgetTile
            key={entry.id}
            entry={entry}
            cellPx={cellPx}
            contentZoom={scaleFactor}
            isDragging={dragOverride?.id === entry.id}
            selectedSlot={editingThis ? selectedMonitoringSlot : undefined}
            onSelectSlot={editingThis ? setSelectedMonitoringSlot : undefined}
            onContextMenu={(x, y) => setMenu({ x, y, widgetId: entry.id })}
            onDragMove={(col, row) => setDragOverride({ id: entry.id, col, row })}
            onDragEnd={(col, row) => { void handleDragCommit(entry.id, col, row); }}
          />
        );
      })}
      {menu && (() => {
        const entry = menu.widgetId ? layout.find(w => w.id === menu.widgetId) : undefined;
        const def = entry ? WIDGET_REGISTRY[entry.type] : undefined;
        const sizes = entry && def ? sizesForSurface(def.meta, 'desktop') : [];
        const currentSize = entry
          ? normalizePanelWidgetSize(entry.size) as PanelWidgetSize
          : '2x2';
        const resolvedMode = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
        const hasConfig = Boolean(def?.SettingsComponent);
        return (
          <WidgetContextMenu
            x={menu.x}
            y={menu.y}
            currentSize={currentSize}
            sizes={sizes}
            hasConfig={hasConfig}
            themeMode={resolvedMode}
            themeStyle={themeStyle}
            removeLabel="Unpin"
            alwaysOnTop={alwaysOnTop}
            onToggleAlwaysOnTop={handleToggleAlwaysOnTop}
            onBoundsChange={setMenuRect}
            onResize={size => { if (entry) void handleResize(entry.id, size); }}
            onEdit={() => { if (entry) setEditingWidgetId(entry.id); }}
            onRemove={() => { if (entry) void handleUnpin(entry.id); }}
            onClose={() => setMenu(null)}
          />
        );
      })()}
      {editingWidgetId && (() => {
        const entry = layout.find(w => w.id === editingWidgetId);
        if (!entry) return null;
        const def = WIDGET_REGISTRY[entry.type];
        if (!def) return null;
        const widget: PanelWidget = {
          id: entry.id,
          type: entry.type,
          size: normalizePanelWidgetSize(entry.size) as PanelWidgetSize,
          col: 0,
          row: 0,
          config: entry.config,
        };
        const resolvedMode = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
        // Tile rect drives the popover anchor, computed the same way the
        // tile renders itself: cell origin shifted by the widget inset so
        // the sheet aligns visually flush with the widget edges.
        const anchorRect = {
          x: entry.col * cellPx + WIDGET_INSET_PX,
          y: entry.row * cellPx + WIDGET_INSET_PX,
          w: widthCells(entry.size) * cellPx - WIDGET_INSET_PX * 2,
          h: heightCells(entry.size) * cellPx - WIDGET_INSET_PX * 2,
        };
        return (
          <WidgetEditSheet
            widget={widget}
            surface="desktop"
            themeMode={resolvedMode}
            themeStyle={themeStyle}
            anchorRect={anchorRect}
            onBoundsChange={setEditingSheetRect}
            onResize={handleResize}
            onUpdate={handleUpdateConfig}
            onRemove={handleRemoveFromEditor}
            onClose={() => setEditingWidgetId(null)}
            selectedSlot={entry.type === 'monitoring' ? selectedMonitoringSlot : undefined}
            onSelectedSlotChange={entry.type === 'monitoring' ? setSelectedMonitoringSlot : undefined}
            keepOpenOnTarget={(target) => {
              if (!(target instanceof Element)) return false;
              const tile = target.closest<HTMLElement>('[data-widget-id]');
              return tile?.dataset.widgetId === entry.id;
            }}
          />
        );
      })()}
    </div>
  );
}

interface TileProps {
  entry: OverlayWidgetDto;
  cellPx: number;
  contentZoom: number;
  isDragging: boolean;
  selectedSlot?: number;
  onSelectSlot?: (slot: number) => void;
  onContextMenu: (x: number, y: number) => void;
  onDragMove: (col: number, row: number) => void;
  onDragEnd: (col: number, row: number) => void;
}

function OverlayWidgetTile({ entry, cellPx, contentZoom, isDragging, selectedSlot, onSelectSlot, onContextMenu, onDragMove, onDragEnd }: TileProps) {
  const def = WIDGET_REGISTRY[entry.type];
  const w = widthCells(entry.size);
  const h = heightCells(entry.size);
  // Max cell origin that still keeps the widget on-screen for this monitor.
  // Computed from the live viewport so multi-monitor (each overlay has
  // its own viewport) and per-monitor DPI / resolution are handled by
  // the same code path. Math.max(...,0) covers the pathological case of
  // a widget bigger than the monitor.
  const maxCol = Math.max(0, window.innerWidth / cellPx - w);
  const maxRow = Math.max(0, window.innerHeight / cellPx - h);
  const left = clampCell(entry.col, maxCol) * cellPx + WIDGET_INSET_PX;
  const top = clampCell(entry.row, maxRow) * cellPx + WIDGET_INSET_PX;
  const width = w * cellPx - WIDGET_INSET_PX * 2;
  const height = h * cellPx - WIDGET_INSET_PX * 2;

  const onContext = (event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    onContextMenu(event.clientX, event.clientY);
  };

  // Drag from anywhere on the widget. Movement-threshold gating means a
  // pointerdown that stays within DRAG_THRESHOLD_PX falls through to inner
  // widget controls (calculator buttons, sliders) as a normal click.
  // Once the threshold is crossed we capture the pointer to the widget
  // container so subsequent moves come to us regardless of which inner
  // element the cursor is over.
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const originCol = entry.col;
    const originRow = entry.row;
    const target = event.currentTarget;
    const pointerId = event.pointerId;
    let dragging = false;

    const dragMaxCol = Math.max(0, window.innerWidth / cellPx - w);
    const dragMaxRow = Math.max(0, window.innerHeight / cellPx - h);

    const onMove = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!dragging) {
        if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
        dragging = true;
        try { target.setPointerCapture(pointerId); } catch { /* ignore */ }
      }
      const col = clampCell(snapToStep(originCol + dx / cellPx), dragMaxCol);
      const row = clampCell(snapToStep(originRow + dy / cellPx), dragMaxRow);
      onDragMove(col, row);
    };

    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
      window.removeEventListener('pointercancel', onUp, true);
      if (dragging) {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        const col = clampCell(snapToStep(originCol + dx / cellPx), dragMaxCol);
        const row = clampCell(snapToStep(originRow + dy / cellPx), dragMaxRow);
        onDragEnd(col, row);
        try { target.releasePointerCapture(pointerId); } catch { /* released */ }
      }
    };

    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
  };

  if (!def) return null;
  const Component = def.Component;

  const widget: PanelWidget = {
    id: entry.id,
    type: entry.type,
    size: normalizePanelWidgetSize(entry.size) as PanelWidgetSize,
    col: 0,
    row: 0,
    config: entry.config,
  };

  return (
    <div
      className={`panel-card ${styles.widget}`}
      style={{ left, top, width, height }}
      data-widget-id={entry.id}
      data-dragging={isDragging ? 'true' : 'false'}
      onContextMenu={onContext}
      onPointerDown={onPointerDown}
    >
      <div
        className={styles.widgetBody}
        // CSS `zoom` is non-standard but supported in Chromium (which is
        // the only renderer for both the dashboard and the desktop overlay).
        // It scales every descendant pixel uniformly, including widgets that
        // hardcode font sizes / paddings instead of reading
        // --panel-cell-size. The container is already sized at cellPx
        // (which equals BASE_CELL_PX * contentZoom), so the body's zoomed
        // content lines up exactly.
        style={{ zoom: contentZoom }}
      >
        <Suspense fallback={null}>
          <Component widget={widget} surface="desktop" selectedSlot={selectedSlot} onSelectSlot={onSelectSlot} />
        </Suspense>
      </div>
    </div>
  );
}

