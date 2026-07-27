import { createPortal } from 'react-dom';
import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import type { CSSProperties } from 'react';
import { sizeToSpan } from '../engine/grid';
import { lookupApp } from '../widgets/registry';
import type { DeckEditView } from '../widgets/types';
import { WidgetCellLabel } from '../widgets/common/WidgetCellLabel';
import { PanelPreviewProvider } from '../widgets/common/PanelPreviewContext';
import { ErrorBoundary } from '../../components/common/ErrorBoundary/ErrorBoundary';
import { useTranslation } from '../../lib/i18n';
import type { PanelLayout, PanelSurface, PanelWidget, PanelConfigValue } from '../types';
import { findWidgetById, readCellMetrics, type DashboardSectionNavigate } from '../engine/panelLayoutHelpers';
import type { EditorDockMotion } from '../editor/panelEditorDock';
import type { ResolvedPanelThemeMode } from '../editor/PanelThemeSettings';
import styles from '../PanelApp.module.scss';

// Highlights the cells the dragged widget would land on if dropped now.
// Reads currentOverIdRef + the active widget's size to compute the
// (col, row, colSpan, rowSpan) rect on the current page. Accent-tinted;
// `invalid` switches to the bad tint so a refused drop telegraphs
// before release instead of silently snapping back.
export function DragTargetHighlight({
  pageId,
  activeWidgetId,
  paginatedLayout,
  overIdSignal,
  overIdRef,
  invalid = false,
}: {
  pageId: string;
  activeWidgetId: string;
  paginatedLayout: PanelLayout;
  overIdSignal: number;
  overIdRef: { current: string | null };
  invalid?: boolean;
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

  const tint = invalid ? 'var(--bad)' : 'var(--accent)';
  return (
    <div
      aria-hidden="true"
      style={{
        gridColumn: `${targetCol + 1} / span ${span.cols}`,
        gridRow: `${targetRow + 1} / span ${span.rows}`,
        pointerEvents: 'none',
        background: `color-mix(in srgb, ${tint} 18%, transparent)`,
        outline: `2px dashed color-mix(in srgb, ${tint} 80%, transparent)`,
        outlineOffset: '-2px',
        borderRadius: 'var(--radius)',
        zIndex: 1,
      }}
    />
  );
}

export function EmptyCellDroppable({ pageId, col, row }: { pageId: string; col: number; row: number }) {
  // Invisible 1x1 drop target at the empty cell. Pointer-events stay enabled
  // for the collision detector; feedback comes from the DragOverlay clone.
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
  deviceTouch,
  rearranging,
  pressHint = false,
  dimmed = false,
  editorDockMotion = null,
  editorDockPortal = null,
  flash = false,
  entrance = false,
  isDragSource = false,
  resizeMotion = false,
  selectedSlot,
  onSelectSlot,
  editView,
  onEditViewChange,
  onUpdate,
  clickthrough = false,
  onContextMenu,
  cellPointers,
  onSimulatorClick,
  previewLayout = null,
  onSectionNavigate,
  onConfigureWidget,
}: {
  widget: PanelWidget;
  surface?: PanelSurface;
  deviceTouch?: boolean;
  rearranging: boolean;
  pressHint?: boolean;
  dimmed?: boolean;
  editorDockMotion?: EditorDockMotion | null;
  editorDockPortal?: HTMLElement | null;
  flash?: boolean;
  entrance?: boolean;
  isDragSource?: boolean;
  resizeMotion?: boolean;
  selectedSlot?: number;
  onSelectSlot?: (slot: number) => void;
  editView?: DeckEditView;
  onEditViewChange?: (view: DeckEditView) => void;
  onUpdate?: (config: Record<string, PanelConfigValue>) => void;
  clickthrough?: boolean;
  onContextMenu: (e: React.MouseEvent) => void;
  cellPointers: {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
  };
  onSimulatorClick?: () => void;
  previewLayout?: PanelLayout | null;
  onSectionNavigate?: DashboardSectionNavigate;
  onConfigureWidget?: (widget: PanelWidget) => void;
}) {
  const { t } = useTranslation();
  const def = lookupApp(widget.type);
  const span = sizeToSpan(widget.size);
  // dnd-kit must already be tracking pointerdowns when the long-press fires,
  // or a hold+drag can't convert to a sort-drag (it only tracks via its own
  // onPointerDown). Disable only during transitional motion states where a
  // drag would fight the in-flight animation.
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

  // State-based drag projection. PanelContent recomputes previewLayout when
  // the over target moves; each cell looks up its preview position, computes
  // the pixel delta from its committed (col, row), and translates via inline
  // style (CSS transition animates the slide). Not dnd-kit's strategy/transform
  // path - the over is a non-sortable empty-cell droppable that useSortable's
  // memoization doesn't re-fire for.
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
    // usePanelLayout's reconciler drops orphan marketplace widgets once the
    // registry loads, so reaching here means (a) the registry is still loading
    // at app start, or (b) a built-in type was renamed/removed mid-session.
    // Render a blank placeholder, not a "unknown:" box; the layout self-heals
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

  const Comp = def.Widget;
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
        className={`${styles.cellWrap} ${dimmed ? styles.cellContextDimmed : ''} ${isDragSource ? styles.cellDragSource : ''} ${flash ? styles.cellFlash : ''} ${entrance ? styles.cellEntrance : ''}`}
        style={{
          ...wrapStyle,
          // Make-room transform comes from previewLayout, not from dnd-kit's
          // strategy. The transition animates the slide WHILE a drag is live;
          // on drop previewLayout clears, so the transform snaps to 0 (no
          // transition) in the same paint the committed (col,row) lands.
          // Otherwise the base jumps to the new slot while the stale transform
          // animates back to 0, overshooting past the cell (the drag flinch).
          transform: !isDragging ? previewTransform : undefined,
          transition: previewLayout ? previewTransition : 'none',
          zIndex: isDragging ? 50 : undefined,
        } as CSSProperties}
        onContextMenu={onContextMenu}
        {...attributes}
        {...listeners}
      >
        <div className={`panel-card ${styles.cell}`} data-size={widget.size}>
          <div className={styles.cellScaler} style={{ pointerEvents: 'none' }}>
            <Comp widget={widget} surface={surface} deviceTouch={deviceTouch} />
          </div>
        </div>
        <div className={styles.cellLabelStrip}>
          <WidgetCellLabel label={labelText} />
        </div>
      </div>
    );
  }

  // Compose cellPointers (tap + long-press menu + press feedback) with
  // dnd-kit's onPointerDown so one press fires both: cellPointers arms the
  // menu's long-press timer, dnd-kit's PointerSensor arms the drag-activation
  // delay. Intent (tap / long-press / long-press-then-drag) is disambiguated
  // by which timer fires and whether movement follows.
  const dragMotionActive = Boolean(editorDockMotion) || Boolean(resizeMotion);
  const composedPointerHandlers = dragMotionActive ? {} : {
    ...cellPointers,
    onPointerDown: (e: React.PointerEvent) => {
      cellPointers.onPointerDown(e);
      // Skip dnd-kit activation in scroll regions inside widgets (cellPointers
      // already bails there). Else a 500ms hold inside a scroll list would
      // start a sort-drag.
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
      className={`${styles.cellWrap} ${editorDockMotion ? styles.cellEditorDocked : ''} ${resizeMotion ? styles.cellResizeMotion : ''} ${editorDockMotion?.phase === 'closing' ? styles.cellEditorDockClosing : ''} ${dimmed ? styles.cellContextDimmed : ''} ${flash ? styles.cellFlash : ''} ${entrance ? styles.cellEntrance : ''}`}
      style={{
        ...wrapStyle,
        // Make-room transform comes from previewLayout, not dnd-kit's strategy.
        // The DragOverlay floats the active widget; this shifts displaced
        // siblings aside (transition animates the slide). previewLayout clears
        // on drop, so the transform snaps to 0 (transition 'none') in the same
        // paint the committed (col,row) lands. Otherwise the base jumps while
        // the stale transform animates back, overshooting (the drag flinch).
        transform: !dragMotionActive && !isDragging ? previewTransform : undefined,
        transition: dragMotionActive ? undefined : previewLayout ? previewTransition : 'none',
        // Hold the z-index bump until rearrange visuals are on. dnd-kit sets
        // isDragging=true at the long-press mark before any movement; popping
        // the cell above the context menu then would fight that menu.
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
            deviceTouch={deviceTouch}
            selectedSlot={selectedSlot}
            onSelectSlot={onSelectSlot}
            editView={editView}
            onEditViewChange={onEditViewChange}
            onUpdate={onUpdate}
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
    // `position: fixed` anchors to the viewport, not the pager track. The
    // track's transform on non-first pages would otherwise be the containing
    // block and offset the cell offscreen by the page translation.
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

// Non-interactive panel cell for the add-widget catalog. Reuses the exact
// grid placement, card, content scaler, and label-strip the live panel uses,
// so the catalog inherits the panel's scaling and label sizing instead of a
// bespoke preview. Placed by (col, row) the catalog packs via appendWidget.
export function PanelCatalogCell({
  widget,
  surface,
  deviceTouch,
  label,
  selected = false,
  disabled = false,
  onClick,
  showLabel = true,
}: {
  widget: PanelWidget;
  surface?: PanelSurface;
  deviceTouch?: boolean;
  label: string;
  selected?: boolean;
  /** No room on the target grid: dimmed, unactivatable, out of the tab order. */
  disabled?: boolean;
  onClick?: () => void;
  /** Presentational mounts (marketing phone mock) drop the name strip. */
  showLabel?: boolean;
}) {
  const def = lookupApp(widget.type);
  const span = sizeToSpan(widget.size);
  if (!def) return null;
  // Prefer a static preview facet so streaming-data tiles (monitoring) show
  // frozen mock data in the catalog instead of animating live.
  const Comp = def.Preview ?? def.Widget;
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (onClick && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      onClick();
    }
  };
  return (
    <div
      data-panel-widget-id={widget.id}
      className={[
        styles.cellWrap,
        styles.catalogCell,
        selected ? styles.catalogCellSelected : '',
        disabled ? styles.catalogCellDisabled : '',
      ].filter(Boolean).join(' ')}
      style={{
        gridColumn: `${widget.col + 1} / span ${span.cols}`,
        gridRow: `${widget.row + 1} / span ${span.rows}`,
        '--panel-span-cols': span.cols,
        '--panel-span-rows': span.rows,
      } as CSSProperties}
      // Presentational mounts (no onClick, e.g. the marketing phone mock)
      // must not put a focusable no-op button in the tab order. A disabled
      // card keeps role=button so aria-disabled reads as a real disabled
      // control, but leaves the tab order and drops its handlers.
      role={onClick ? 'button' : undefined}
      tabIndex={onClick && !disabled ? 0 : -1}
      aria-label={label}
      aria-pressed={selected || undefined}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
      onKeyDown={disabled ? undefined : onKeyDown}
    >
      <div className={`panel-card ${styles.cell}`} data-size={widget.size}>
        <div className={styles.cellScaler} style={{ pointerEvents: 'none' }}>
          <ErrorBoundary label={widget.type}>
            <PanelPreviewProvider value={true}>
              <Comp widget={widget} surface={surface} deviceTouch={deviceTouch} />
            </PanelPreviewProvider>
          </ErrorBoundary>
        </div>
      </div>
      {showLabel && (
        <div className={styles.cellLabelStrip}>
          <WidgetCellLabel label={label} />
        </div>
      )}
    </div>
  );
}

// Renders inside @dnd-kit's DragOverlay (portaled to body). Carries the panel
// CSS context so theme tokens + the panel-card class chain apply to the clone.
export function PanelDragOverlayCell({
  widget,
  surface,
  deviceTouch,
  themeStyle,
  themeMode,
  fixedWidth,
  fixedHeight,
  showLabels = true,
}: {
  widget: PanelWidget;
  surface?: PanelSurface;
  deviceTouch?: boolean;
  themeStyle: CSSProperties;
  themeMode: ResolvedPanelThemeMode;
  fixedWidth?: number;
  fixedHeight?: number;
  showLabels?: boolean;
}) {
  const { t } = useTranslation();
  const def = lookupApp(widget.type);
  const span = sizeToSpan(widget.size);
  if (!def) return null;
  const Comp = def.Widget;
  const labelText = t(def.meta.i18nKey) || widget.type;
  return (
    <div
      className={`panel-root ${styles.dragOverlayHost}`}
      data-theme={themeMode}
      data-surface={surface}
      // Portaled to body, so it can't inherit the panel root's labels-off state
      // - mirror it here or the dragged clone shows a label the grid hides.
      data-show-widget-labels={showLabels ? 'true' : 'false'}
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
            <Comp widget={widget} surface={surface} deviceTouch={deviceTouch} />
          </div>
        </div>
        <div className={styles.cellLabelStrip}>
          <WidgetCellLabel label={labelText} />
        </div>
      </div>
    </div>
  );
}
