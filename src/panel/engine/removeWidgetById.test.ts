import { describe, expect, it } from 'vitest';
import { removeWidgetById } from './panelLayoutOps';
import type { PanelLayout, PanelWidget } from '../types';

const CAPACITY = { gridCols: 4, pageRows: 4 };

function widget(id: string, col = 0, row = 0): PanelWidget {
  return { id, type: 'cooling', size: '1x1', col, row };
}

function layout(pages: PanelWidget[][], activePageId?: string): PanelLayout {
  return {
    layoutSchemaVersion: 2,
    surface: 'y70',
    pages: pages.map((widgets, i) => ({ id: `p${i + 1}`, widgets })),
    activePageId,
  };
}

describe('removeWidgetById', () => {
  it('repoints activePageId to the new last page when the active last page is pruned', () => {
    const before = layout([[widget('a')], [widget('b')], [widget('c')]], 'p3');
    const after = removeWidgetById(before, 'c', CAPACITY);
    expect(after.pages.map(p => p.id)).toEqual(['p1', 'p2']);
    expect(after.activePageId).toBe('p2');
  });

  it('leaves activePageId untouched when the removal does not empty its page', () => {
    const before = layout([[widget('a'), widget('b', 1)]], 'p1');
    const after = removeWidgetById(before, 'b', CAPACITY);
    expect(after.pages).toHaveLength(1);
    expect(after.activePageId).toBe('p1');
  });

  it('keeps activePageId valid when a non-active page is pruned', () => {
    const before = layout([[widget('a')], [widget('b')], [widget('c')]], 'p3');
    const after = removeWidgetById(before, 'b', CAPACITY);
    // p2 emptied and dropped; the active page survives and stays resolvable.
    expect(after.pages.map(p => p.id)).toEqual(['p1', 'p3']);
    expect(after.activePageId).toBe('p3');
    expect(after.pages.some(p => p.id === after.activePageId)).toBe(true);
  });

  it('clamps to the previous page when the active middle page is pruned', () => {
    const before = layout([[widget('a')], [widget('b')], [widget('c')]], 'p2');
    const after = removeWidgetById(before, 'b', CAPACITY);
    // p2 (index 1) dropped -> clamp min(1, lastIndex=1) lands on the page now
    // at index 1, matching the on-device index clamp.
    expect(after.pages.map(p => p.id)).toEqual(['p1', 'p3']);
    expect(after.activePageId).toBe('p3');
  });

  it('lands on the new last page when a pre-existing empty page precedes the active one', () => {
    // prevIdx is read against the original pages, but the clamp indexes the
    // pruned array; the pre-existing empty p2 is dropped alongside the emptied
    // active p3, so the clamp must absorb the shift and land on p1.
    const before = layout([[widget('a')], [], [widget('c')]], 'p3');
    const after = removeWidgetById(before, 'c', CAPACITY);
    expect(after.pages.map(p => p.id)).toEqual(['p1']);
    expect(after.activePageId).toBe('p1');
  });

  it('leaves activePageId undefined when the layout never set one', () => {
    const before = layout([[widget('a')], [widget('b')]]);
    const after = removeWidgetById(before, 'b', CAPACITY);
    expect(after.pages.map(p => p.id)).toEqual(['p1']);
    expect(after.activePageId).toBeUndefined();
  });

  it('returns the layout unchanged when the widget id is absent', () => {
    const before = layout([[widget('a')]], 'p1');
    expect(removeWidgetById(before, 'missing', CAPACITY)).toBe(before);
  });
});
