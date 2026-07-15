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
