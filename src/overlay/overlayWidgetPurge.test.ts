// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { purgePanelOnlyOverlayWidgets } from './overlayWidgetPurge';
import type { OverlayWidgetDto } from '../api/overlay';

function entry(id: string, type: string): OverlayWidgetDto {
  return { id, type, size: '2x2', monitor: 0, col: 0, row: 0 };
}

describe('purgePanelOnlyOverlayWidgets', () => {
  it('unpins panel-only widgets pinned before they became panel-only', () => {
    const removed: string[] = [];
    const kept = purgePanelOnlyOverlayWidgets(
      [entry('a', 'clock'), entry('b', 'snake'), entry('c', 'blocks')],
      id => removed.push(id),
    );
    expect(kept.map(w => w.id)).toEqual(['a']);
    expect(removed).toEqual(['b', 'c']);
  });

  it('keeps types the registry does not know (marketplace apps)', () => {
    const removed: string[] = [];
    const kept = purgePanelOnlyOverlayWidgets(
      [entry('a', 'app:com.example.thing')],
      id => removed.push(id),
    );
    expect(kept.map(w => w.id)).toEqual(['a']);
    expect(removed).toEqual([]);
  });

  it('keeps widgets that are desktop-unavailable for any other reason', () => {
    // Only panelOnly is inert once pinned. A remote-only widget cannot be
    // pinned from the desktop in the first place, and deleting one would take
    // its config with it, so the purge leaves every other type alone.
    const removed: string[] = [];
    const kept = purgePanelOnlyOverlayWidgets(
      [entry('a', 'transfer'), entry('b', 'camera')],
      id => removed.push(id),
    );
    expect(kept.map(w => w.id)).toEqual(['a', 'b']);
    expect(removed).toEqual([]);
  });

  it('leaves an all-available layout untouched', () => {
    const removed: string[] = [];
    const input = [entry('a', 'clock'), entry('b', 'calculator')];
    expect(purgePanelOnlyOverlayWidgets(input, id => removed.push(id))).toEqual(input);
    expect(removed).toEqual([]);
  });
});
