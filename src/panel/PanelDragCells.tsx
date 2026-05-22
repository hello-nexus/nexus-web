import { createPortal } from 'react-dom';
import { useDroppable } from '@dnd-kit/core';
import { useSortable } from '@dnd-kit/sortable';
import type { CSSProperties } from 'react';
import { sizeToSpan } from './engine/grid';
import { lookupWidget } from './widgets/registry';
import { WidgetCellLabel } from './widgets/common/WidgetCellLabel';
import { useTranslation } from '../lib/i18n';
import type { PanelLayout, PanelSurface, PanelWidget } from './types';
import { findWidgetById, readCellMetrics, type DashboardSectionNavigate } from './panelLayoutHelpers';
import type { EditorDockMotion } from './panelEditorDock';
import type { ResolvedPanelThemeMode } from './editor/PanelThemeSettings';
import styles from './PanelApp.module.scss';

// Visualises the cells the dragged widget would commit to if it
// were dropped right now. Reads currentOverIdRef + the active
// widget's size to compute the (col, row, colSpan, rowSpan) rect on
// the current page. Tinted with the panel accent so it reads as
// "this is where it lands" feedback rather than a debug overlay.
export function DragTargetHighlight({
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

export function EmptyCellDroppable({ pageId, col, row }: { pageId: string; col: number; row: number }) {
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
  flash = false,
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
  flash?: boolean;
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
        className={`${styles.cellWrap} ${dimmed ? styles.cellContextDimmed : ''} ${isDragSource ? styles.cellDragSource : ''} ${flash ? styles.cellFlash : ''}`}
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
      className={`${styles.cellWrap} ${editorDockMotion ? styles.cellEditorDocked : ''} ${resizeMotion ? styles.cellResizeMotion : ''} ${editorDockMotion?.phase === 'closing' ? styles.cellEditorDockClosing : ''} ${dimmed ? styles.cellContextDimmed : ''} ${flash ? styles.cellFlash : ''}`}
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
export function PanelDragOverlayCell({
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
  const Comp = def.Widget;
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
