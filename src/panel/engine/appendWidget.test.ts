// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { appendWidget, canAppendWidget } from './panelLayoutOps';
import type { PanelLayout, PanelWidget, PanelWidgetSize } from '../types';

const CAPACITY = { gridCols: 4, pageRows: 4 };

function widget(id: string, size: PanelWidgetSize, col: number, row: number, type = 'cooling'): PanelWidget {
  return { id, type, size, col, row };
}

function layout(pages: PanelWidget[][]): PanelLayout {
  return {
    layoutSchemaVersion: 2,
    surface: 'y70',
    pages: pages.map((widgets, i) => ({ id: `p${i + 1}`, widgets })),
  };
}

function pageOf(result: PanelLayout, id: string): string | null {
  for (const page of result.pages) {
    if (page.widgets.some(w => w.id === id)) return page.id;
  }
  return null;
}

describe('appendWidget', () => {
  it('places the widget in the first free slot of the first page', () => {
    const l = layout([[widget('a', '2x2', 0, 0)]]);
    const result = appendWidget(l, widget('n', '2x2', 0, 0), CAPACITY);
    expect(pageOf(result, 'n')).toBe('p1');
    const n = result.pages[0].widgets.find(w => w.id === 'n')!;
    expect(n).toMatchObject({ col: 2, row: 0 });
  });

  it('fills an off-stride hole instead of spilling to a new page', () => {
    // 1x1s pin all four stride-aligned 2x2 anchors; (1, 0) stays free.
    const l = layout([[
      widget('k1', '1x1', 0, 0),
      widget('k2', '1x1', 3, 0),
      widget('k3', '1x1', 0, 3),
      widget('k4', '1x1', 3, 3),
    ]]);
    const result = appendWidget(l, widget('n', '2x2', 0, 0), CAPACITY);
    expect(result.pages).toHaveLength(1);
    const n = result.pages[0].widgets.find(w => w.id === 'n')!;
    expect(n).toMatchObject({ col: 1, row: 0 });
  });

  it('prefers the page the user is looking at when it has room', () => {
    const l = layout([
      [widget('a', '2x2', 0, 0)],
      [widget('b', '2x2', 0, 0)],
    ]);
    const result = appendWidget(l, widget('n', '2x2', 0, 0), CAPACITY, { preferredPageId: 'p2' });
    expect(pageOf(result, 'n')).toBe('p2');
  });

  it('falls back to the first page with room when the preferred page is full', () => {
    const l = layout([
      [widget('a', '2x2', 0, 0)],
      [widget('b', '4x4', 0, 0)],
    ]);
    const result = appendWidget(l, widget('n', '2x2', 0, 0), CAPACITY, { preferredPageId: 'p2' });
    expect(pageOf(result, 'n')).toBe('p1');
  });

  it('ignores an unknown preferredPageId', () => {
    const l = layout([[widget('a', '2x2', 0, 0)]]);
    const result = appendWidget(l, widget('n', '2x2', 0, 0), CAPACITY, { preferredPageId: 'nope' });
    expect(pageOf(result, 'n')).toBe('p1');
  });

  it('creates a new trailing page when every page is full', () => {
    const l = layout([[widget('a', '4x4', 0, 0)]]);
    const result = appendWidget(l, widget('n', '2x2', 0, 0), CAPACITY);
    expect(result.pages).toHaveLength(2);
    const n = result.pages[1].widgets.find(w => w.id === 'n')!;
    expect(n).toMatchObject({ col: 0, row: 0 });
  });

  it('no-ops when full and singlePage is set', () => {
    const l = layout([[widget('a', '4x4', 0, 0)]]);
    expect(appendWidget(l, widget('n', '2x2', 0, 0), CAPACITY, { singlePage: true })).toBe(l);
  });
});

describe('canAppendWidget', () => {
  it('is false only for the size that no longer fits', () => {
    // Leaves a 2x2 hole at (2, 2): a 2x2 lands, a 4x2 cannot.
    const l = layout([[
      widget('a', '4x2', 0, 0),
      widget('b', '2x2', 0, 2),
    ]]);
    const opts = { singlePage: true };
    expect(canAppendWidget(l, '2x2', CAPACITY, opts)).toBe(true);
    expect(canAppendWidget(l, '1x1', CAPACITY, opts)).toBe(true);
    expect(canAppendWidget(l, '4x2', CAPACITY, opts)).toBe(false);
    expect(canAppendWidget(l, '4x4', CAPACITY, opts)).toBe(false);
  });

  it('is false for every size once the page is full', () => {
    const l = layout([[widget('a', '4x4', 0, 0)]]);
    const sizes: PanelWidgetSize[] = ['1x1', '2x2', '4x2', '4x4'];
    for (const size of sizes) {
      expect(canAppendWidget(l, size, CAPACITY, { singlePage: true })).toBe(false);
    }
  });

  it('is true on a full multi-page layout: the widget spills to a new page', () => {
    const l = layout([[widget('a', '4x4', 0, 0)]]);
    expect(canAppendWidget(l, '4x4', CAPACITY)).toBe(true);
  });

  it('agrees with appendWidget and does not mutate the layout', () => {
    const l = layout([[widget('a', '4x2', 0, 0)]]);
    const before = JSON.stringify(l);
    for (const size of ['1x1', '2x2', '4x2', '4x4'] as PanelWidgetSize[]) {
      const predicted = canAppendWidget(l, size, CAPACITY, { singlePage: true });
      const actual = appendWidget(l, widget('n', size, 0, 0), CAPACITY, { singlePage: true }) !== l;
      expect(predicted).toBe(actual);
    }
    expect(JSON.stringify(l)).toBe(before);
  });
});
