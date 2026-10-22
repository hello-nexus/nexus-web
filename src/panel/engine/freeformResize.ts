import {
  isFreeformWidgetSize,
  type PanelWidgetSize,
} from '../types';
import { sizeToSpan, snapStride, type GridSpan } from './grid';
import { dominantScale } from '../../lib/aspectResize';

// Spans are cols x rows, as in grid.ts.

export interface FreeformRect { col: number; row: number; cols: number; rows: number; }
/** Whether a rect can really be placed (pushed widgets all have room on the page); candidates it refuses are skipped. */
export type PlaceCheck = (rect: FreeformRect) => boolean;

export interface FreeformBounds { cols: number; rows: number; }
export type FreeformCorner = 'tl' | 'tr' | 'bl' | 'br';

const FREEFORM_MIN_SIDE = 4;

export function spanToSize(span: GridSpan): PanelWidgetSize {
  return `${span.cols}x${span.rows}`;
}

// A moved origin must land on the regular drag's stride grid; an origin that does not move is left as it is.
function originOnStride(start: FreeformRect, col: number, row: number, span: GridSpan): boolean {
  return (col === start.col || col % snapStride(span.cols) === 0)
    && (row === start.row || row % snapStride(span.rows) === 0);
}

/** Declared sizes, plus (withEvenSpans) every span with both sides even and at least FREEFORM_MIN_SIDE, capped by the grid; the round mask is not a span. */
export function freeformSnapSpans(
  declared: readonly PanelWidgetSize[],
  bounds: FreeformBounds,
  withEvenSpans = true,
): GridSpan[] {
  const spans = new Map<string, GridSpan>();
  const add = (span: GridSpan) => {
    if (span.cols > bounds.cols || span.rows > bounds.rows) return;
    spans.set(`${span.cols}x${span.rows}`, span);
  };
  for (const size of declared) {
    if (size !== '2x2round') add(sizeToSpan(size));
  }
  for (let cols = FREEFORM_MIN_SIDE; withEvenSpans && cols <= bounds.cols; cols += 2) {
    for (let rows = FREEFORM_MIN_SIDE; rows <= bounds.rows; rows += 2) add({ cols, rows });
  }
  return [...spans.values()];
}

function distance(a: GridSpan, cols: number, rows: number): number {
  return Math.hypot(a.cols - cols, a.rows - rows);
}

/** Cells a ratio-locked drag must travel before the size may change. */
const LOCK_DEAD_ZONE = 0.25;

/** Drags one corner by (dCols, dRows) cells with the opposite corner fixed; picks the nearest snap span that fits the grid, smaller on a tie.
 *  With lockRatio the drag becomes one uniform scale of the start span, capped to the room the anchored corner has. A drag within LOCK_DEAD_ZONE cells of the start keeps it;
 *  otherwise the nearest span keeping the start ratio wins, and when none qualifies the nearest span of any ratio does, least ratio error breaking ties. */
export function resizeRectFromCorner(
  start: FreeformRect,
  corner: FreeformCorner,
  dCols: number,
  dRows: number,
  snapSpans: readonly GridSpan[],
  bounds: FreeformBounds,
  canPlace?: PlaceCheck,
  lockRatio = false,
): FreeformRect {
  const fromLeft = corner === 'tl' || corner === 'bl';
  const fromTop = corner === 'tl' || corner === 'tr';
  const right = start.col + start.cols;
  const bottom = start.row + start.rows;
  let rawCols = fromLeft ? start.cols - dCols : start.cols + dCols;
  let rawRows = fromTop ? start.rows - dRows : start.rows + dRows;
  if (lockRatio) {
    const kMax = Math.min((fromLeft ? right : bounds.cols - start.col) / start.cols, (fromTop ? bottom : bounds.rows - start.row) / start.rows);
    const k = Math.max(0, Math.min(kMax, dominantScale(rawCols / start.cols, rawRows / start.rows)));
    rawCols = start.cols * k;
    rawRows = start.rows * k;
  }

  const search = (accept: (span: GridSpan) => boolean, scoreOf: (span: GridSpan) => number): FreeformRect | null => {
    let best: FreeformRect | null = null;
    let bestScore = Infinity;
    let bestArea = Infinity;
    for (const span of snapSpans) {
      if (!accept(span)) continue;
      const col = fromLeft ? right - span.cols : start.col;
      const row = fromTop ? bottom - span.rows : start.row;
      if (col < 0 || row < 0 || col + span.cols > bounds.cols || row + span.rows > bounds.rows) continue;
      if (!originOnStride(start, col, row, span)) continue;
      const score = scoreOf(span);
      const area = span.cols * span.rows;
      if (!(score < bestScore || (score === bestScore && area < bestArea))) continue;
      const rect = { col, row, cols: span.cols, rows: span.rows };
      if (canPlace && !canPlace(rect)) continue;
      best = rect;
      bestScore = score;
      bestArea = area;
    }
    return best;
  };
  const byDistance = (span: GridSpan) => distance(span, rawCols, rawRows);

  if (!lockRatio) return search(() => true, byDistance) ?? start;

  if (distance(start, rawCols, rawRows) < LOCK_DEAD_ZONE) return start;
  const matches = (span: GridSpan) => span.cols * start.rows === span.rows * start.cols;
  const matched = search(matches, byDistance);
  if (matched) return matched;
  const startRatio = start.cols / start.rows;
  const ratioError = (span: GridSpan) => Math.abs(Math.log(span.cols / span.rows / startRatio));
  return search(() => true, span => byDistance(span) + ratioError(span) * 1e-6) ?? start;
}

/** One keyboard step: the nearest snap span past the current one on the stepped axis (outward grows, inward shrinks), kept inside the grid. */
export function stepRectFromCorner(
  start: FreeformRect,
  corner: FreeformCorner,
  stepCols: number,
  stepRows: number,
  snapSpans: readonly GridSpan[],
  bounds: FreeformBounds,
  canPlace?: PlaceCheck,
): FreeformRect {
  const fromLeft = corner === 'tl' || corner === 'bl';
  const fromTop = corner === 'tl' || corner === 'tr';
  const right = start.col + start.cols;
  const bottom = start.row + start.rows;
  // Outward on an axis grows the span, inward shrinks it.
  const growCols = stepCols === 0 ? 0 : (fromLeft ? -stepCols : stepCols);
  const growRows = stepRows === 0 ? 0 : (fromTop ? -stepRows : stepRows);
  let best: FreeformRect | null = null;
  let bestScore = Infinity;
  for (const span of snapSpans) {
    const dCols = span.cols - start.cols;
    const dRows = span.rows - start.rows;
    if (growCols !== 0 && Math.sign(dCols) !== Math.sign(growCols)) continue;
    if (growRows !== 0 && Math.sign(dRows) !== Math.sign(growRows)) continue;
    const col = fromLeft ? right - span.cols : start.col;
    const row = fromTop ? bottom - span.rows : start.row;
    if (col < 0 || row < 0 || col + span.cols > bounds.cols || row + span.rows > bounds.rows) continue;
    if (!originOnStride(start, col, row, span)) continue;
    // Nearest on the stepped axis first, then least change on the other.
    const score = (growCols !== 0 ? Math.abs(dCols) : Math.abs(dRows)) * 1000 + (growCols !== 0 ? Math.abs(dRows) : Math.abs(dCols));
    if (score >= bestScore) continue;
    const rect = { col, row, cols: span.cols, rows: span.rows };
    if (canPlace && !canPlace(rect)) continue;
    best = rect;
    bestScore = score;
  }
  return best ?? start;
}

/** Whether dragging each corner can reach any other snap span that fits the grid, and can be placed, with the opposite corner fixed. */
export function cornerRoom(
  rect: FreeformRect,
  snapSpans: readonly GridSpan[],
  bounds: FreeformBounds,
  canPlace?: PlaceCheck,
): Record<FreeformCorner, boolean> {
  const right = rect.col + rect.cols;
  const bottom = rect.row + rect.rows;
  const room = (fromLeft: boolean, fromTop: boolean) => snapSpans.some(span => {
    if (span.cols === rect.cols && span.rows === rect.rows) return false;
    const col = fromLeft ? right - span.cols : rect.col;
    const row = fromTop ? bottom - span.rows : rect.row;
    if (col < 0 || row < 0 || col + span.cols > bounds.cols || row + span.rows > bounds.rows) return false;
    if (!originOnStride(rect, col, row, span)) return false;
    return !canPlace || canPlace({ col, row, cols: span.cols, rows: span.rows });
  });
  return { tl: room(true, true), tr: room(false, true), bl: room(true, false), br: room(false, false) };
}

export function sameRect(a: FreeformRect, b: FreeformRect): boolean {
  return a.col === b.col && a.row === b.row && a.cols === b.cols && a.rows === b.rows;
}

/** Shrinks a freeform span to the grid so a layout saved on a larger panel still shows; other sizes pass through. */
export function clampFreeformSize(size: PanelWidgetSize, bounds: FreeformBounds): PanelWidgetSize {
  if (!isFreeformWidgetSize(size)) return size;
  const span = sizeToSpan(size);
  if (span.cols <= bounds.cols && span.rows <= bounds.rows) return size;
  return spanToSize({
    cols: Math.max(1, Math.min(span.cols, bounds.cols)),
    rows: Math.max(1, Math.min(span.rows, bounds.rows)),
  });
}
