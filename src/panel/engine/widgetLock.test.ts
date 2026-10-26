// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { PanelLayout } from '../types';
import { setAllWidgetsLocked, setWidgetLocked } from './widgetLock';

const layout: PanelLayout = {
  layoutSchemaVersion: 2,
  surface: 'monitor',
  pages: [
    { id: 'p1', widgets: [{ id: 'a', type: 'clock', size: '2x2', col: 0, row: 0 }, { id: 'b', type: 'clock', size: '2x2', col: 2, row: 0, locked: true }] },
    { id: 'p2', widgets: [{ id: 'c', type: 'clock', size: '2x2', col: 0, row: 0 }] },
  ],
};

describe('widget lock', () => {
  it('locks one widget and leaves the rest', () => {
    const next = setWidgetLocked(layout, 'a', true);
    expect(next.pages[0].widgets[0].locked).toBe(true);
    expect(next.pages[0].widgets[1]).toBe(layout.pages[0].widgets[1]);
    expect(next.pages[1]).toBe(layout.pages[1]);
  });

  it('stores no flag once unlocked', () => {
    const next = setWidgetLocked(layout, 'b', false);
    expect('locked' in next.pages[0].widgets[1]).toBe(false);
  });

  it('returns the same layout when nothing changes', () => {
    expect(setWidgetLocked(layout, 'b', true)).toBe(layout);
    expect(setAllWidgetsLocked(setAllWidgetsLocked(layout, true), true).pages[1].widgets[0].locked).toBe(true);
  });

  it('locks and unlocks every page', () => {
    const all = setAllWidgetsLocked(layout, true);
    expect(all.pages.flatMap(p => p.widgets).every(w => w.locked === true)).toBe(true);
    const none = setAllWidgetsLocked(all, false);
    expect(none.pages.flatMap(p => p.widgets).some(w => 'locked' in w)).toBe(false);
  });
});
