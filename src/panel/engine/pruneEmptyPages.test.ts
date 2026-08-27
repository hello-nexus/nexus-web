// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { pruneEmptyPages } from './panelLayoutOps';
import type { PanelLayout, PanelWidget, PanelWidgetSize } from '../types';

function widget(id: string, size: PanelWidgetSize, col: number, row: number, type = 'cooling'): PanelWidget {
  return { id, type, size, col, row };
}

function layout(pages: PanelWidget[][], activePageId?: string): PanelLayout {
  return {
    layoutSchemaVersion: 2,
    surface: 'y70',
    pages: pages.map((widgets, i) => ({ id: `p${i + 1}`, widgets })),
    ...(activePageId ? { activePageId } : {}),
  };
}

describe('pruneEmptyPages', () => {
  it('drops an empty middle page', () => {
    const l = layout([[widget('a', '2x2', 0, 0)], [], [widget('b', '2x2', 0, 0)]]);
    const result = pruneEmptyPages(l);
    expect(result.pages.map(p => p.id)).toEqual(['p1', 'p3']);
  });

  it('drops trailing empty pages', () => {
    const l = layout([[widget('a', '2x2', 0, 0)], []]);
    const result = pruneEmptyPages(l);
    expect(result.pages.map(p => p.id)).toEqual(['p1']);
  });

  it('drops an empty first page when later pages have widgets', () => {
    const l = layout([[], [widget('a', '2x2', 0, 0)]]);
    const result = pruneEmptyPages(l);
    expect(result.pages.map(p => p.id)).toEqual(['p2']);
  });

  it('keeps one page when every page is empty', () => {
    const l = layout([[], []]);
    const result = pruneEmptyPages(l);
    expect(result.pages.map(p => p.id)).toEqual(['p1']);
  });

  it('returns the same reference when nothing is empty', () => {
    const l = layout([[widget('a', '2x2', 0, 0)]]);
    expect(pruneEmptyPages(l)).toBe(l);
  });

  it('repoints activePageId at the nearest surviving page', () => {
    const l = layout([[widget('a', '2x2', 0, 0)], [], [widget('b', '2x2', 0, 0)]], 'p2');
    const result = pruneEmptyPages(l);
    // p2 (index 1) was dropped; the clamp lands on the page now at that
    // index, matching the on-device pager's min(oldIndex, lastIndex).
    expect(result.activePageId).toBe('p3');
  });

  it('keeps activePageId when its page survives', () => {
    const l = layout([[widget('a', '2x2', 0, 0)], [], [widget('b', '2x2', 0, 0)]], 'p3');
    const result = pruneEmptyPages(l);
    expect(result.activePageId).toBe('p3');
  });
});
