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

function layout(widgets: PanelWidget[], dock?: PanelWidget[]): PanelLayout {
  return {
    layoutSchemaVersion: 2,
    surface: 'y70',
    pages: [{ id: 'p1', widgets }],
    dock: dock ? { enabled: true, widgets: dock } : undefined,
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
    // cooling is supported on y70/phone but NOT q60
    const result = normalizePanelLayout(
      layout([widget({ id: 'a', type: 'cooling', size: '2x2' })]),
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

  it('filters dock widgets but preserves their stored size', () => {
    const result = normalizePanelLayout(
      layout(
        [],
        [
          widget({ id: 'd1', type: 'cooling', size: '1x1' }),
          widget({ id: 'd2', type: 'does-not-exist', size: '1x1' }),
        ],
      ),
      'y70',
    );
    expect(result.dock?.widgets.map(w => w.id)).toEqual(['d1']);
    expect(result.dock?.widgets[0].size).toBe('1x1');
  });
});
