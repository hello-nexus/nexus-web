import { useCallback, useRef, useState } from 'react';
import type { PanelLayout, PanelWidget } from '../types';
import { findWidgetById } from './panelLayoutHelpers';
import { sizeToSpan, type GridSpan } from './grid';
import { tryResizeWidget } from './panelLayoutOps';
import type { PaginateCapacity } from './paginate';
import {
  moveRect,
  resizeRectFromCorner,
  sameRect,
  spanToSize,
  stepRectFromCorner,
  clampFreeformSize,
  type FreeformCorner,
  type FreeformRect,
} from './freeformResize';

export type FreeformGesture = 'move' | FreeformCorner;

interface Session { base: PanelLayout; start: FreeformRect; }

/** Every update re-derives the draft from the layout the gesture began on, so dragging back restores pushed widgets; `end` commits. */
export function useFreeformResize({
  widgetId,
  layout,
  capacity,
  snapSpans,
  maxPages,
  onCommit,
  onReject,
}: {
  widgetId: string | null;
  layout: PanelLayout;
  capacity: PaginateCapacity;
  snapSpans: readonly GridSpan[];
  maxPages: number;
  onCommit: (next: PanelLayout) => void;
  onReject: (widgetId: string) => void;
}) {
  const [draft, setDraft] = useState<PanelLayout | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const draftRef = useRef<PanelLayout | null>(null);
  // A rejected target flashes once; the next accepted target or gesture re-arms it.
  const rejectArmedRef = useRef(true);
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
    rejectArmedRef.current = true;
    sessionRef.current = { base: layout, start: { col: widget.col, row: widget.row, cols: span.cols, rows: span.rows } };
    return true;
  }, [layout, widgetId, boundCols, boundRows]);

  const applyTarget = useCallback((session: Session, target: FreeformRect) => {
    if (!widgetId) return;
    if (sameRect(target, session.start)) {
      rejectArmedRef.current = true;
      setBoth(null);
      return;
    }
    const next = tryResizeWidget(
      session.base,
      widgetId,
      spanToSize(target),
      capacity,
      maxPages,
      { col: target.col, row: target.row },
    );
    if (next) {
      rejectArmedRef.current = true;
      setBoth(next === session.base ? null : next);
    } else if (rejectArmedRef.current) {
      rejectArmedRef.current = false;
      onReject(widgetId);
    }
  }, [capacity, maxPages, onReject, setBoth, widgetId]);

  const update = useCallback((gesture: FreeformGesture, dCols: number, dRows: number) => {
    const session = sessionRef.current;
    if (!session) return;
    const bounds = { cols: boundCols, rows: boundRows };
    applyTarget(session, gesture === 'move'
      ? moveRect(session.start, dCols, dRows, bounds)
      : resizeRectFromCorner(session.start, gesture, dCols, dRows, snapSpans, bounds));
  }, [applyTarget, boundCols, boundRows, snapSpans]);

  const step = useCallback((corner: FreeformCorner, stepCols: number, stepRows: number) => {
    const session = sessionRef.current;
    if (!session) return;
    applyTarget(session, stepRectFromCorner(session.start, corner, stepCols, stepRows, snapSpans, { cols: boundCols, rows: boundRows }));
  }, [applyTarget, boundCols, boundRows, snapSpans]);

  const end = useCallback(() => {
    const next = draftRef.current;
    sessionRef.current = null;
    setBoth(null);
    if (next) onCommit(next);
  }, [onCommit, setBoth]);

  return { draft, begin, update, step, end };
}
