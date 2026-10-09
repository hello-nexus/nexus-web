import { describe, it, expect } from 'vitest';
import { DESKTOP_GRID_COLUMNS, desktopAutoArrangeColumns, readRuntimePanelGrid, DESKTOP_GRID_REFERENCE_CELL } from './panelGrid';
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
      expect(flush.contentGap).toBeCloseTo(stock.gap, 10);
      expect(flush.cellSize).toBeCloseTo((window.innerHeight - 2 * flush.padding - (flush.rows - 1) * flush.gap) / flush.rows, 6);
    } finally {
      Object.defineProperty(window, 'devicePixelRatio', { value: saved, configurable: true });
    }
  });
});

describe('desktopAutoArrangeColumns', () => {
  const pitch = DESKTOP_GRID_REFERENCE_CELL + 10;

  it('counts whole cells that fit, rounded down to even', () => {
    expect(desktopAutoArrangeColumns(10 * pitch - 10, 10)).toBe(10);
    expect(desktopAutoArrangeColumns(11 * pitch - 10, 10)).toBe(10);
    expect(desktopAutoArrangeColumns(12 * pitch - 11, 10)).toBe(10);
    expect(desktopAutoArrangeColumns(12 * pitch - 10, 10)).toBe(12);
  });

  it('never drops below the widest widget span', () => {
    expect(desktopAutoArrangeColumns(100, 10)).toBe(4);
  });

  it('caps at the manual grid width however wide the page', () => {
    expect(DESKTOP_GRID_COLUMNS).toBe(16);
    expect(desktopAutoArrangeColumns(16 * pitch - 10, 10)).toBe(16);
    expect(desktopAutoArrangeColumns(40 * pitch, 10)).toBe(16);
    expect(desktopAutoArrangeColumns(40 * DESKTOP_GRID_REFERENCE_CELL, 0)).toBe(16);
  });
});

describe('readRuntimePanelGrid in a streamed panel render', () => {
  const at = (dpr: number, search: string) => {
    const saved = { dpr: window.devicePixelRatio, w: window.innerWidth, h: window.innerHeight, url: window.location.href };
    Object.defineProperty(window, 'devicePixelRatio', { value: dpr, configurable: true });
    Object.defineProperty(window, 'innerWidth', { value: 2288, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, configurable: true });
    window.history.replaceState(null, '', `/panel/p1${search}`);
    try {
      const { columns, rows, cellSize } = readRuntimePanelGrid('monitor', null, false, 210);
      return { columns, rows, cellSize };
    } finally {
      Object.defineProperty(window, 'devicePixelRatio', { value: saved.dpr, configurable: true });
      Object.defineProperty(window, 'innerWidth', { value: saved.w, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: saved.h, configurable: true });
      window.history.replaceState(null, '', saved.url);
    }
  };

  it('keeps the native grid when the stream renders at a lower resolution', () => {
    expect(at(0.5, '?streamFps=30')).toEqual(at(1, '?streamFps=30'));
    expect(at(0.5, '')).not.toEqual(at(1, ''));
  });
});
