import { describe, expect, it } from 'vitest';
import {
  PICKER_SEGMENT_COLS, PICKER_SEGMENT_ROWS, SEGMENT_SWATCHES,
  pickerHexAt, pickerPointFor, sameSwatch, segmentCellAt, segmentCellFor, segmentHexAt, snapToSegment,
} from './staticPickerField';
import { hexToHsv } from '../../../../lib/settings';

describe('staticPickerField', () => {
  it('places a colour back where the field drew it', () => {
    for (const x of [0, 0.17, 0.5, 0.83, 1]) {
      for (const y of [0.1, 0.3, 0.5, 0.7, 0.9]) {
        const p = pickerPointFor(pickerHexAt(x, y));
        // Hue wraps: the field's left and right edges are the same red.
        const dx = Math.abs(p.x - x);
        expect(Math.min(dx, 1 - dx)).toBeLessThan(0.01);
        expect(Math.abs(p.y - y)).toBeLessThan(0.01);
        expect(p.offField).toBe(false);
      }
    }
  });

  it('marks a muted colour as off the fully saturated field', () => {
    expect(pickerPointFor('#8a7f6d').offField).toBe(true);
    // Black and white are the field's own edges, not off it.
    expect(pickerPointFor('#000000').offField).toBe(false);
    expect(pickerPointFor('#ffffff').offField).toBe(false);
  });

  it('snaps a press onto a swatch the segmented view actually draws', () => {
    for (const x of [0.02, 0.34, 0.66, 0.99]) {
      for (const y of [0.02, 0.41, 0.99]) {
        const p = snapToSegment(x, y);
        expect(SEGMENT_SWATCHES).toContain(pickerHexAt(p.x, p.y));
      }
    }
  });

  // The stops are uneven, so an even split of the axis cannot reach the row
  // whose stop falls outside its own band - the darkest one.
  it('bins every swatch back onto the cell that drew it', () => {
    for (let row = 0; row < PICKER_SEGMENT_ROWS; row++) {
      for (let col = 0; col < PICKER_SEGMENT_COLS; col++) {
        const swatch = SEGMENT_SWATCHES[row * PICKER_SEGMENT_COLS + col];
        const p = pickerPointFor(swatch);
        const cell = segmentCellFor(p.x, p.y);
        expect({ ...cell, swatch }).toEqual({ col, row, swatch });
        expect(sameSwatch(swatch, SEGMENT_SWATCHES[cell.row * PICKER_SEGMENT_COLS + cell.col])).toBe(true);
      }
    }
  });

  it('offers pure red and the other five primaries in the vivid row', () => {
    const vivid = SEGMENT_SWATCHES.slice(3 * PICKER_SEGMENT_COLS, 4 * PICKER_SEGMENT_COLS);
    expect(vivid[0]).toBe('#ff0000');
    const step = PICKER_SEGMENT_COLS / 6;
    expect([0, 1, 2, 3, 4, 5].map(i => vivid[i * step])).toEqual(
      ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff'],
    );
  });

  it('wraps a hue just short of red onto column 0 and lands the snap on its swatch', () => {
    const p = pickerPointFor('#ff0020');
    expect(segmentCellFor(p.x, p.y).col).toBe(0);
    expect(segmentCellFor(350 / 360, 0.5).col).toBe(0);
    expect(segmentCellFor(1, 0.5).col).toBe(0);
    expect(segmentCellFor(16 / 360, 0.5).col).toBe(1);
    expect(snapToSegment(350 / 360, 0.5)).toEqual({ x: 0, y: 0.5 });
    expect(pickerHexAt(0, 0.5)).toBe('#ff0000');
  });

  it('reaches the darkest row from a press at the bottom edge', () => {
    expect(segmentCellFor(0.5, 1).row).toBe(PICKER_SEGMENT_ROWS - 1);
    expect(segmentCellFor(0.5, 0).row).toBe(0);
  });

  it('hit-tests by the drawn even rows and columns, including where the stops would pick a neighbor', () => {
    for (let row = 0; row < PICKER_SEGMENT_ROWS; row++) {
      for (let col = 0; col < PICKER_SEGMENT_COLS; col++) {
        for (const [fx, fy] of [[0.02, 0.02], [0.5, 0.5], [0.98, 0.98]]) {
          const x = (col + fx) / PICKER_SEGMENT_COLS;
          const y = (row + fy) / PICKER_SEGMENT_ROWS;
          expect(segmentCellAt(x, y)).toEqual({ col, row });
          expect(segmentHexAt(x, y)).toBe(SEGMENT_SWATCHES[row * PICKER_SEGMENT_COLS + col]);
        }
      }
    }
    // The bottom edge and right edge clamp onto the last cell.
    expect(segmentCellAt(1, 1)).toEqual({ col: PICKER_SEGMENT_COLS - 1, row: PICKER_SEGMENT_ROWS - 1 });
    // This band sits in row 1 as drawn, yet the nearest stop is row 0's.
    const y = 1.2 / PICKER_SEGMENT_ROWS;
    expect(segmentCellFor(0.5, y).row).toBe(0);
    expect(segmentCellAt(0.5, y).row).toBe(1);
  });

  it('keeps the swatch ramp clear of white and black, which an LED cannot show', () => {
    const rows = Array.from({ length: PICKER_SEGMENT_ROWS }, (_, r) =>
      hexToHsv(SEGMENT_SWATCHES[r * PICKER_SEGMENT_COLS]));
    // Top row keeps real colour rather than washing out; bottom stays lit.
    expect(rows[0].s).toBeGreaterThan(25);
    expect(rows[rows.length - 1].v).toBeGreaterThan(30);
  });

  it('reads a service round-trip as the same swatch, a real difference as not', () => {
    // The pick returns as float hue/saturation, so a channel can land a step off.
    expect(sameSwatch('#2a76ff', '#2b76ff')).toBe(true);
    expect(sameSwatch('#2a76ff', '#2a76e0')).toBe(false);
  });
});
