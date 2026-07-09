import { describe, expect, it } from 'vitest';
import { patchWidgetById } from './panelLayoutOps';
import type { PanelLayout, PanelWidget, PanelWidgetSize } from '../types';
import { sizeToSpan } from './grid';

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

function expectNoOverlap(result: PanelLayout) {
  for (const page of result.pages) {
    for (let i = 0; i < page.widgets.length; i++) {
      for (let j = i + 1; j < page.widgets.length; j++) {
        const a = page.widgets[i];
        const b = page.widgets[j];
        const sa = sizeToSpan(a.size);
        const sb = sizeToSpan(b.size);
        const overlap = a.col < b.col + sb.cols && b.col < a.col + sa.cols
          && a.row < b.row + sb.rows && b.row < a.row + sa.rows;
        expect(overlap, `${a.id} overlaps ${b.id} on page ${page.id}`).toBe(false);
      }
    }
  }
}

describe('patchWidgetById', () => {
  it('applies a config-only patch without moving anything', () => {
    const l = layout([[widget('a', '2x2', 0, 0), widget('b', '2x2', 2, 0)]]);
    const result = patchWidgetById(l, 'a', w => ({ ...w, config: { x: 1 } }), CAPACITY);
    const a = result.pages[0].widgets.find(w => w.id === 'a')!;
    expect(a.config).toEqual({ x: 1 });
    expect(a).toMatchObject({ col: 0, row: 0 });
    const b = result.pages[0].widgets.find(w => w.id === 'b')!;
    expect(b).toMatchObject({ col: 2, row: 0 });
  });

  it('returns the same layout for an identity patch or unknown id', () => {
    const l = layout([[widget('a', '2x2', 0, 0)]]);
    expect(patchWidgetById(l, 'a', w => w, CAPACITY)).toBe(l);
    expect(patchWidgetById(l, 'missing', w => ({ ...w, config: {} }), CAPACITY)).toBe(l);
  });

  it('cascades siblings when a size patch grows into them', () => {
    const l = layout([[widget('a', '2x2', 0, 0), widget('b', '2x2', 2, 0)]]);
    const result = patchWidgetById(l, 'a', w => ({ ...w, size: '4x2' as PanelWidgetSize }), CAPACITY);
    const a = result.pages[0].widgets.find(w => w.id === 'a')!;
    expect(a.size).toBe('4x2');
    expectNoOverlap(result);
  });

  it('rejects the whole patch when displaced siblings have nowhere to go', () => {
    // Page is a full 2x2 quad; growing a to 4x4 displaces three 2x2s
    // with zero free cells - the patch must come back as the ORIGINAL
    // layout, never one with overlapping rects.
    const l = layout([[
      widget('a', '2x2', 0, 0),
      widget('b', '2x2', 2, 0),
      widget('c', '2x2', 0, 2),
      widget('d', '2x2', 2, 2),
    ]]);
    const result = patchWidgetById(l, 'a', w => ({ ...w, size: '4x4' as PanelWidgetSize }), CAPACITY);
    expect(result).toBe(l);
  });

  it('slides a growing widget back in bounds instead of clipping', () => {
    const l = layout([[widget('a', '2x2', 2, 2)]]);
    const result = patchWidgetById(l, 'a', w => ({ ...w, size: '4x4' as PanelWidgetSize }), CAPACITY);
    const a = result.pages[0].widgets.find(w => w.id === 'a')!;
    expect(a).toMatchObject({ col: 0, row: 0, size: '4x4' });
  });
});
