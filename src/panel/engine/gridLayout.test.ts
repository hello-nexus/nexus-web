import { describe, expect, it } from 'vitest';
import { layoutPage } from './gridLayout';
import type { PanelWidget, PanelWidgetSize } from '../types';

function widget(size: PanelWidgetSize, col: number, row: number, id?: string): PanelWidget {
  return { id: id ?? `w-${col}-${row}`, type: 'clock', size, col, row };
}

const COLS = 4;

describe('layoutPage', () => {
  it('reads (col, row) directly without auto-flow', () => {
    const widgets = [widget('2x2', 0, 0), widget('2x2', 2, 0), widget('2x2', 0, 2)];
    const { placements } = layoutPage(widgets, COLS);
    expect(placements.get('w-0-0')).toEqual({ row: 0, col: 0, rowSpan: 2, colSpan: 2 });
    expect(placements.get('w-2-0')).toEqual({ row: 0, col: 2, rowSpan: 2, colSpan: 2 });
    expect(placements.get('w-0-2')).toEqual({ row: 2, col: 0, rowSpan: 2, colSpan: 2 });
  });

  it('honors gaps between widgets - no compaction or backfill', () => {
    // Two 2x2s on row 0 col 0 and row 4 col 0; the rows in between
    // stay empty and rowsUsed reflects the bottom widget's bottom edge.
    const widgets = [widget('2x2', 0, 0), widget('2x2', 0, 4)];
    const { placements, rowsUsed } = layoutPage(widgets, COLS);
    expect(placements.get('w-0-0')!.row).toBe(0);
    expect(placements.get('w-0-4')!.row).toBe(4);
    expect(rowsUsed).toBe(6);
  });

  it('clamps a widget whose col would push it past the right edge', () => {
    // A 4x2 stored at col=2 cannot fit (4 + 2 > 4); clamp to col=0.
    const w = widget('4x2', 2, 0);
    const { placements } = layoutPage([w], COLS);
    const p = placements.get(w.id)!;
    expect(p.col).toBe(0);
    expect(p.colSpan).toBe(4);
  });

  it('clamps a colSpan greater than gridCols', () => {
    const w = widget('4x2', 0, 0);
    const { placements } = layoutPage([w], 2);
    const p = placements.get(w.id)!;
    expect(p.colSpan).toBe(2);
  });

  it('returns rowsUsed = 0 for empty input', () => {
    const { placements, rowsUsed } = layoutPage([], COLS);
    expect(placements.size).toBe(0);
    expect(rowsUsed).toBe(0);
  });

  it('places multiple widgets with explicit gaps preserved', () => {
    const widgets = [widget('1x1', 0, 0), widget('1x1', 3, 0), widget('1x1', 0, 3)];
    const { placements, rowsUsed } = layoutPage(widgets, COLS);
    expect(placements.get('w-0-0')).toEqual({ row: 0, col: 0, rowSpan: 1, colSpan: 1 });
    expect(placements.get('w-3-0')).toEqual({ row: 0, col: 3, rowSpan: 1, colSpan: 1 });
    expect(placements.get('w-0-3')).toEqual({ row: 3, col: 0, rowSpan: 1, colSpan: 1 });
    expect(rowsUsed).toBe(4);
  });
});
