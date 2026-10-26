// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { firstPageView, foldIntoFirstPage, heldPages, withHeldPages } from './paginate';
import type { PanelLayout, PanelWidget } from '../types';

const w = (id: string, col: number, row: number, size: PanelWidget['size'] = '1x1'): PanelWidget => ({ id, type: 'clock', size, col, row });
const layout = (...pages: PanelWidget[][]): PanelLayout => ({
  layoutSchemaVersion: 2, surface: 'monitor', activePageId: 'p2',
  pages: pages.map((widgets, i) => ({ id: `p${i + 1}`, widgets })),
});
const ids = (l: PanelLayout) => l.pages.flatMap(p => p.widgets.map(x => x.id)).sort();

describe('foldIntoFirstPage', () => {
  it('leaves a single page alone', () => {
    const l = layout([w('a', 0, 0)]);
    expect(foldIntoFirstPage(l, { gridCols: 4, pageRows: 2 })).toEqual({ layout: l, changed: false });
  });

  it('moves later pages onto page 1 at the nearest free cells and activates it', () => {
    const l = layout([w('a', 0, 0)], [w('b', 0, 0), w('c', 1, 0)]);
    const { layout: out, changed } = foldIntoFirstPage(l, { gridCols: 4, pageRows: 2 });
    expect(changed).toBe(true);
    expect(out.pages).toHaveLength(1);
    expect(out.activePageId).toBe('p1');
    expect(ids(out)).toEqual(['a', 'b', 'c']);
    const cells = out.pages[0].widgets.map(x => `${x.col},${x.row}`);
    expect(new Set(cells).size).toBe(3);
  });

  it('never drops a widget that has no free cell: it stays on its stored page', () => {
    const l = layout([w('a', 0, 0), w('b', 1, 0)], [w('c', 0, 0), w('d', 1, 0)]);
    const { layout: out } = foldIntoFirstPage(l, { gridCols: 2, pageRows: 1 });
    expect(ids(out)).toEqual(['a', 'b', 'c', 'd']);
    expect(out.pages[0].widgets.map(x => x.id).sort()).toEqual(['a', 'b']);
    expect(out.pages[1].id).toBe('p2');
    expect(out.pages[1].widgets.map(x => x.id).sort()).toEqual(['c', 'd']);
  });

  it('is idempotent once nothing more fits and restores held widgets when room appears', () => {
    const l = layout([w('a', 0, 0), w('b', 1, 0)], [w('c', 0, 0)]);
    const once = foldIntoFirstPage(l, { gridCols: 2, pageRows: 1 });
    expect(foldIntoFirstPage(once.layout, { gridCols: 2, pageRows: 1 }).changed).toBe(false);
    const roomy = foldIntoFirstPage(once.layout, { gridCols: 4, pageRows: 1 });
    expect(roomy.layout.pages).toHaveLength(1);
    expect(ids(roomy.layout)).toEqual(['a', 'b', 'c']);
  });

  it('drops empty held pages', () => {
    const l = layout([w('a', 0, 0)], []);
    const { layout: out, changed } = foldIntoFirstPage(l, { gridCols: 4, pageRows: 2 });
    expect(changed).toBe(true);
    expect(out.pages).toHaveLength(1);
  });
});

describe('first page view and held pages', () => {
  const l = layout([w('a', 0, 0)], [w('b', 0, 0)]);
  it('renders page 1 only and writes the held pages back with every edit', () => {
    const view = firstPageView(l);
    expect(view.pages).toHaveLength(1);
    const edited = { ...view, pages: [{ ...view.pages[0], widgets: [w('a', 2, 0)] }] };
    const back = withHeldPages(edited, heldPages(l));
    expect(ids(back)).toEqual(['a', 'b']);
    expect(back.pages[0].widgets[0].col).toBe(2);
  });

  it('is the identity for one page', () => {
    const one = layout([w('a', 0, 0)]);
    expect(firstPageView(one)).toBe(one);
    expect(withHeldPages(one, [])).toBe(one);
  });
});
