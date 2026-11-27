import { describe, expect, it } from 'vitest';
import { cardCell, cardFontSize, FILL_GAP_PX, listFontSize, MAX_FONT_PX, MIN_FONT_PX } from './reminderFit';

const fit = (width: number, height: number, columns: number, rows: number, layout: 'row' | 'stack', labels: boolean) =>
  cardFontSize({ width, height, columns, rows, layout, labels });

describe('card fit', () => {
  it('shares the measured box between the 1fr tracks, gaps taken out', () => {
    const cell = cardCell(300, 200, 3, 2);
    expect(cell.w).toBeCloseTo((300 - 2 * FILL_GAP_PX) / 3);
    expect(cell.h).toBeCloseTo((200 - FILL_GAP_PX) / 2);
  });

  it('grows the contents with the tile, so a bigger widget reads larger', () => {
    expect(fit(400, 200, 3, 2, 'stack', true)).toBeGreaterThan(fit(200, 100, 3, 2, 'stack', true));
    expect(fit(300, 300, 2, 3, 'stack', false)).toBeGreaterThan(fit(150, 150, 2, 3, 'stack', false));
  });

  it('never lets the content overflow its cell, on either axis', () => {
    for (const [w, h, c, r, layout, labels] of [
      [140, 140, 2, 3, 'stack', false], [320, 150, 3, 2, 'stack', true], [160, 320, 1, 6, 'row', true], [320, 160, 3, 2, 'stack', true],
    ] as const) {
      const font = fit(w, h, c, r, layout, labels);
      const { w: cw, h: ch } = cardCell(w, h, c, r);
      const heightEm = 1.1 + 1.7 + (layout === 'stack' && labels ? 1.2 : 0);
      if (font > MIN_FONT_PX) expect(font * heightEm).toBeLessThanOrEqual(ch + 0.001);
      expect(font).toBeLessThanOrEqual(cw / 1.4 + 0.001);
    }
  });

  it('drops the name row at 2x2, so its icons come out larger than the labeled version of the same cell', () => {
    expect(fit(150, 150, 2, 3, 'stack', false)).toBeGreaterThan(fit(150, 150, 2, 3, 'stack', true));
  });

  it('keeps the 4x4 top block the same as 4x2 when both measure the same box', () => {
    expect(fit(320, 150, 3, 2, 'stack', true)).toBe(fit(320, 150, 3, 2, 'stack', true));
  });

  it('clamps to a readable range', () => {
    expect(fit(20, 20, 2, 3, 'stack', true)).toBe(MIN_FONT_PX);
    expect(fit(4000, 4000, 3, 2, 'stack', true)).toBe(MAX_FONT_PX);
  });

  it('sizes My Lists rows from their share of the height and the width', () => {
    expect(listFontSize(300, 150, 3)).toBeGreaterThan(listFontSize(300, 75, 3));
    expect(listFontSize(120, 400, 2)).toBeLessThan(listFontSize(400, 400, 2));
    expect(listFontSize(300, 150, 0)).toBe(MIN_FONT_PX);
  });
});
