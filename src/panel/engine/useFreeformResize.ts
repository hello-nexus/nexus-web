import { useCallback, useRef, useState } from 'react';
import type { PanelLayout, PanelWidget } from '../types';
import { canonicalJson } from './usePanelLayout';
import { findWidgetById } from './panelLayoutHelpers';
import { sizeToSpan, type GridSpan } from './grid';
import { tryResizeWidget } from './panelLayoutOps';
import type { PaginateCapacity } from './paginate';
import {
  resizeRectFromCorner,
  sameRect,
  spanToSize,
  stepRectFromCorner,
  clampFreeformSize,
  type FreeformCorner,
  type FreeformRect,
} from './freeformResize';

interface Session { base: PanelLayout; baseKey: string; cols: number; rows: number; start: FreeformRect; }

/** Every update re-derives the draft from the layout the gesture began on, so dragging back restores pushed widgets; `end` commits. */
export function useFreeformResize({
  widgetId,
  layout,
  capacity,
  snapSpans,
  onCommit,
  onReject,
}: {
  widgetId: string | null;
  layout: PanelLayout;
  capacity: PaginateCapacity;
  snapSpans: readonly GridSpan[];
  onCommit: (next: PanelLayout) => void;
  onReject: (widgetId: string) => void;
}) {
  const [draft, setDraft] = useState<PanelLayout | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const draftRef = useRef<PanelLayout | null>(null);
  const boundCols = Math.max(1, capacity.gridCols);
  const boundRows = Math.max(1, capacity.pageRows);

  const setBoth = useCallback((next: PanelLayout | null) => {
    draftRef.current = next;
    setDraft(next);
  }, []);

  const begin = useCallback((): boolean => {
    const widget: PanelWidget | undefined = widgetId ? findWidgetById(layout, widgetId) : undefined;
    if (!widget) return false;
    const span = sizeToSpan(clampFreeformSize(widget.size, { cols: boundCols, rows: boundRows }));
    sessionRef.current = { base: layout, baseKey: canonicalJson(layout), cols: boundCols, rows: boundRows, start: { col: widget.col, row: widget.row, cols: span.cols, rows: span.rows } };
    return true;
  }, [layout, widgetId, boundCols, boundRows]);

  // A target is placeable only when every pushed widget still fits on this page.
  const placeable = useCallback((session: Session) => (rect: FreeformRect) => !widgetId || tryResizeWidget(
    session.base, widgetId, spanToSize(rect), capacity, 1, { col: rect.col, row: rect.row }, { samePage: true },
  ) !== null, [capacity, widgetId]);

  const applyTarget = useCallback((session: Session, target: FreeformRect) => {
    if (!widgetId) return;
    if (sameRect(target, session.start)) {
      setBoth(null);
      return;
    }
    const next = tryResizeWidget(session.base, widgetId, spanToSize(target), capacity, 1, { col: target.col, row: target.row }, { samePage: true });
    // The candidates were already checked as placeable; a null here means the layout moved on, and the end check handles it.
    if (next) setBoth(next === session.base ? null : next);
  }, [capacity, setBoth, widgetId]);

  const update = useCallback((corner: FreeformCorner, dCols: number, dRows: number) => {
    const session = sessionRef.current;
    if (!session) return;
    const bounds = { cols: boundCols, rows: boundRows };
    applyTarget(session, resizeRectFromCorner(session.start, corner, dCols, dRows, snapSpans, bounds, placeable(session)));
  }, [applyTarget, boundCols, boundRows, snapSpans, placeable]);

  const step = useCallback((corner: FreeformCorner, stepCols: number, stepRows: number) => {
    const session = sessionRef.current;
    if (!session) return;
    applyTarget(session, stepRectFromCorner(session.start, corner, stepCols, stepRows, snapSpans, { cols: boundCols, rows: boundRows }, placeable(session)));
  }, [applyTarget, boundCols, boundRows, snapSpans, placeable]);

  // A layout or grid that really changed mid-gesture (a sync, a rotation) leaves the draft on a stale base, so it is dropped with a flash;
  // a same-content record refetch (an echo of our own save) is not a change.
  const end = useCallback(() => {
    const next = draftRef.current;
    const session = sessionRef.current;
    sessionRef.current = null;
    setBoth(null);
    const stale = !session || session.cols !== boundCols || session.rows !== boundRows || session.baseKey !== canonicalJson(layout);
    if (!next) return;
    if (stale) {
      if (widgetId) onReject(widgetId);
      return;
    }
    onCommit(next);
  }, [onCommit, onReject, setBoth, layout, boundCols, boundRows, widgetId]);

  // Drops the gesture without committing, for a frame that goes away while the layout moved on.
  const cancel = useCallback(() => {
    sessionRef.current = null;
    setBoth(null);
  }, [setBoth]);

  return { draft, begin, update, step, end, cancel };
}
