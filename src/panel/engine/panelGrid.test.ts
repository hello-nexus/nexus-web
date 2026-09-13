import { describe, it, expect } from 'vitest';
import { readRuntimePanelGrid, DESKTOP_GRID_REFERENCE_CELL } from './panelGrid';
import { panelWidgetPaddingRatio } from './grid';

describe('readRuntimePanelGrid desktop gap', () => {
  it('solves gap directly against the fixed reference cell (desktop cell size is not canvas-derived)', () => {
    const large = panelWidgetPaddingRatio(100);
    const cap = readRuntimePanelGrid('desktop', null, false, undefined, large);
    expect(cap.cellSize).toBe(DESKTOP_GRID_REFERENCE_CELL);
    expect(cap.gap).toBeCloseTo(large * DESKTOP_GRID_REFERENCE_CELL, 10);
    // Padding stays 0 regardless of the setting: the embedded desktop grid
    // sits inside the shared .content wrapper, which already insets it.
    expect(cap.padding).toBe(0);
  });

  it('defaults to zero gap when no widgetPaddingRatio is passed', () => {
    const cap = readRuntimePanelGrid('desktop', null, false);
    expect(cap.gap).toBe(0);
  });
});

describe('readRuntimePanelGrid phone at a real device pixel ratio', () => {
  it('returns every length in CSS px, so the render-scale factor is exactly 1 at the stock padding', () => {
    const saved = window.devicePixelRatio;
    Object.defineProperty(window, 'devicePixelRatio', { value: 3, configurable: true });
    try {
      const stock = readRuntimePanelGrid('phone', null, false, 460, panelWidgetPaddingRatio(100));
      expect(stock.contentScale / stock.cellSize).toBeCloseTo(1, 10);
      const flush = readRuntimePanelGrid('phone', null, false, 460, panelWidgetPaddingRatio(0));
      // Same render scale, bigger live cell (jsdom's viewport is landscape, so
      // the cell is the row): the factor re-bases a measured cell onto the stock one.
      expect(flush.contentScale).toBeCloseTo(stock.contentScale, 10);
      expect(flush.contentScale / flush.cellSize).toBeLessThan(1);
      expect(flush.cellSize).toBeCloseTo((window.innerHeight - 2 * flush.padding - (flush.rows - 1) * flush.gap) / flush.rows, 6);
    } finally {
      Object.defineProperty(window, 'devicePixelRatio', { value: saved, configurable: true });
    }
  });
});
