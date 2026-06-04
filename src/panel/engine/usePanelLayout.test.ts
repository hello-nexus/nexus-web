import { describe, it, expect } from 'vitest';
import { normalizePanelLayout } from './usePanelLayout';
import type { PanelLayout, PanelWidget } from '../types';

function widget(overrides: Partial<PanelWidget> & Pick<PanelWidget, 'id' | 'type' | 'size'>): PanelWidget {
  return {
    col: 0,
    row: 0,
    ...overrides,
  };
}

function layout(widgets: PanelWidget[]): PanelLayout {
  return {
    layoutSchemaVersion: 2,
    surface: 'y70',
    pages: [{ id: 'p1', widgets }],
  };
}

describe('normalizePanelLayout registry reconciliation', () => {
  it('drops widgets whose type is not in the registry', () => {
    const result = normalizePanelLayout(
      layout([
        widget({ id: 'a', type: 'cooling', size: '2x2' }),
        widget({ id: 'b', type: 'does-not-exist', size: '2x2' }),
      ]),
      'y70',
    );
    expect(result.pages[0].widgets.map(w => w.id)).toEqual(['a']);
  });

  it('drops widgets that are not supported on the current surface', () => {
    // lighting is touch-only, so it's never available on q60 (q60 has
    // 2x4 but is not touch). Canonical "unsupported on q60" example.
    const result = normalizePanelLayout(
      layout([widget({ id: 'a', type: 'lighting', size: '2x2' })]),
      'q60',
    );
    expect(result.pages[0].widgets).toHaveLength(0);
  });

  it('snaps a widget whose size is not in meta.sizes to the nearest allowed size', () => {
    // timer allows ['2x2', '4x2'] - 4x4 should snap down to 4x2 (same area).
    const result = normalizePanelLayout(
      layout([widget({ id: 'a', type: 'timer', size: '4x4' })]),
      'y70',
    );
    expect(result.pages[0].widgets[0].size).toBe('4x2');
  });

  it('preserves a widget whose size is already in meta.sizes', () => {
    const result = normalizePanelLayout(
      layout([widget({ id: 'a', type: 'cooling', size: '2x2' })]),
      'y70',
    );
    expect(result.pages[0].widgets[0].size).toBe('2x2');
    // Stable ref means the auto-persist effect won't churn unnecessarily
    expect(result.pages[0].widgets[0].id).toBe('a');
  });

  it('is idempotent: re-normalizing produces the same layout shape', () => {
    const once = normalizePanelLayout(
      layout([
        widget({ id: 'a', type: 'cooling', size: '4x4' }),
        widget({ id: 'b', type: 'does-not-exist', size: '2x2' }),
      ]),
      'y70',
    );
    const twice = normalizePanelLayout(once, 'y70');
    expect(twice.pages[0].widgets).toEqual(once.pages[0].widgets);
  });

  it('re-flows row-major when a size snap introduces overlap with siblings', () => {
    // monitoring at 2x4 sits at (0, 0); a 2x2 sibling at (2, 0) fits
    // beside it without overlap. On y70 the 2x4 size is reserved for
    // single-widget surfaces, so reconcile snaps it to 4x2, which
    // overlaps the sibling at cols 2-3 / rows 0-1. The post-reconcile
    // re-flow detects the overlap and re-packs both widgets row-major.
    const result = normalizePanelLayout(
      layout([
        widget({ id: 'mon', type: 'monitoring', size: '2x4', col: 0, row: 0 }),
        widget({ id: 'sib', type: 'cooling',    size: '2x2', col: 2, row: 0 }),
      ]),
      'y70',
    );
    const sizes = result.pages[0].widgets.map(w => ({ id: w.id, size: w.size, col: w.col, row: w.row }));
    // monitoring snapped to 4x2; both widgets fit without overlap.
    expect(sizes.find(s => s.id === 'mon')?.size).toBe('4x2');
    expect(sizes.find(s => s.id === 'sib')?.size).toBe('2x2');
    const rects = result.pages[0].widgets.map(w => {
      const cols = w.size === '2x2' ? 2 : 4;
      const rows = w.size === '2x2' ? 2 : 2;
      return { left: w.col, right: w.col + cols, top: w.row, bottom: w.row + rows };
    });
    for (let i = 0; i < rects.length; i++) {
      for (let j = i + 1; j < rects.length; j++) {
        const a = rects[i], b = rects[j];
        const overlap = a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;
        expect(overlap, `widgets ${i} and ${j} overlap`).toBe(false);
      }
    }
  });

  it('strips a legacy dock field but keeps pages, widgets, and active page intact', () => {
    // A config saved before the dock feature was removed still carries a
    // `dock` block. Loading it must drop the dock entirely and leave the
    // rest of the layout untouched (the same graceful path as a widget that
    // is suddenly no longer available).
    const stored = {
      layoutSchemaVersion: 2,
      surface: 'y70',
      activePageId: 'p1',
      pages: [{ id: 'p1', widgets: [widget({ id: 'a', type: 'cooling', size: '2x2' })] }],
      dock: { enabled: true, widgets: [widget({ id: 'd1', type: 'cooling', size: '1x1' })] },
    } as unknown as PanelLayout;
    const result = normalizePanelLayout(stored, 'y70');
    expect((result as Record<string, unknown>).dock).toBeUndefined();
    expect(result.pages[0].widgets.map(w => w.id)).toEqual(['a']);
    expect(result.activePageId).toBe('p1');
  });
});
