// iOS Home Screen-style explicit cell placement.
//
// Each widget stores `col` and `row`: the top-left cell of its rect on
// the page grid. We do NOT walk a flat order or compute placements
// from a cursor. The user is allowed to leave gaps anywhere on the
// grid; `layoutPage` reads positions verbatim. Spans come from the
// widget's size, clamped to the grid's column count.
//
// During drag, PanelApp's projection strategy may animate the swap
// pair, but the storage shape is the source of truth.

import type { PanelWidget } from '../types';
import { sizeToSpan } from './grid';

export interface Placement {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
}

export interface PageLayout {
  placements: Map<string, Placement>;
  rowsUsed: number;
}

export function layoutPage(widgets: PanelWidget[], gridCols: number): PageLayout {
  const cols = Math.max(1, gridCols);
  const placements = new Map<string, Placement>();
  let rowsUsed = 0;

  for (const w of widgets) {
    const span = sizeToSpan(w.size);
    const colSpan = Math.max(1, Math.min(span.cols, cols));
    const rowSpan = Math.max(1, span.rows);
    // Clamp into the grid: a widget whose stored col would push it
    // past the right edge slides left to fit; out-of-range rows are
    // accepted as-is so the renderer can clip if the grid shrank
    // below the saved layout.
    const col = Math.max(0, Math.min(w.col, cols - colSpan));
    const row = Math.max(0, w.row);

    placements.set(w.id, { row, col, rowSpan, colSpan });
    const bottom = row + rowSpan;
    if (bottom > rowsUsed) rowsUsed = bottom;
  }

  return { placements, rowsUsed };
}
