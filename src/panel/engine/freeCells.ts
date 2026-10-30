import type { PanelWidget } from '../types';
import { sizeToSpan } from './grid';

export interface FreeCell { col: number; row: number; }

/** Grid cells on a page that no widget covers, in reading order. */
export function freeCells(widgets: readonly PanelWidget[], cols: number, rows: number): FreeCell[] {
  const width = Math.max(1, cols);
  const height = Math.max(1, rows);
  const taken = new Set<string>();
  for (const w of widgets) {
    const span = sizeToSpan(w.size);
    for (let r = w.row; r < w.row + span.rows; r++) {
      for (let c = w.col; c < w.col + span.cols; c++) taken.add(`${c}:${r}`);
    }
  }
  const out: FreeCell[] = [];
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      if (!taken.has(`${c}:${r}`)) out.push({ col: c, row: r });
    }
  }
  return out;
}

/**
 * How a single widget's hover notice splits between "Edit widget" and "Edit
 * background": stacked (widget on top) unless the tile is wider than tall.
 */
export function splitOrientation(cols: number, rows: number): 'stacked' | 'side' {
  return cols > rows ? 'side' : 'stacked';
}
