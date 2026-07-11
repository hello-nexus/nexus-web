import { describe, it, expect, vi } from 'vitest';
import {
  computeViewUploadJobs, makePhysicalDeckTarget, makeWidgetDeckTarget, resolveTargetView, slotCountAtDepth,
  type DeckTarget,
} from './deckTarget';
import type { PanelWidget } from '../types';
import type { DeckConfig } from './types';

describe('slotCountAtDepth', () => {
  it('widget targets hold the same count at every depth', () => {
    const t = { kind: 'widget' as const, keyCount: 8 };
    expect(slotCountAtDepth(t, 0)).toBe(8);
    expect(slotCountAtDepth(t, 1)).toBe(8);
    expect(slotCountAtDepth(t, 2)).toBe(8);
  });

  it('physical targets reserve a Back key at every depth >= 1', () => {
    const t = { kind: 'physical' as const, keyCount: 6 };
    expect(slotCountAtDepth(t, 0)).toBe(6);
    expect(slotCountAtDepth(t, 1)).toBe(5);
    expect(slotCountAtDepth(t, 2)).toBe(5);
  });

  it('clamps at zero for a 1-key physical deck (Pedal-class, no images anyway)', () => {
    expect(slotCountAtDepth({ kind: 'physical', keyCount: 1 }, 1)).toBe(0);
  });
});

describe('makeWidgetDeckTarget', () => {
  function widgetWith(deck: DeckConfig): PanelWidget {
    return { id: 'w1', type: 'deck', size: '2x2', config: { deck: deck as unknown } } as unknown as PanelWidget;
  }

  it('reads the widget config and exposes the size-derived grid', () => {
    const widget = widgetWith({ pages: [{ slots: [{ label: 'a' }] }] });
    const onUpdate = vi.fn();
    const target = makeWidgetDeckTarget(widget, onUpdate);
    expect(target.kind).toBe('widget');
    expect(target.cols).toBe(2);
    expect(target.rows).toBe(2);
    expect(target.keyCount).toBe(4);
    expect(target.config.pages[0].slots[0].label).toBe('a');
  });

  it('updateSlot patches config.deck with the full updated tree', () => {
    const widget = widgetWith({ pages: [{ slots: [] }] });
    const onUpdate = vi.fn();
    const target = makeWidgetDeckTarget(widget, onUpdate);
    target.updateSlot(0, [], 1, { label: 'x' });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const patch = onUpdate.mock.calls[0][0] as { deck: DeckConfig };
    expect(patch.deck.pages[0].slots[1].label).toBe('x');
  });

  it('updateSlot writes into the given page only', () => {
    const widget = widgetWith({ pages: [{ slots: [{ label: 'p0' }] }, { slots: [] }] });
    const onUpdate = vi.fn();
    const target = makeWidgetDeckTarget(widget, onUpdate);
    target.updateSlot(1, [], 0, { label: 'p1' });
    const patch = onUpdate.mock.calls[0][0] as { deck: DeckConfig };
    expect(patch.deck.pages[0].slots[0].label).toBe('p0');
    expect(patch.deck.pages[1].slots[0].label).toBe('p1');
  });

  it('swapSlots patches with the swapped tree and is a no-op for from === to', () => {
    const widget = widgetWith({ pages: [{ slots: [{ label: 'a' }, { label: 'b' }] }] });
    const onUpdate = vi.fn();
    const target = makeWidgetDeckTarget(widget, onUpdate);
    target.swapSlots(0, [], 0, 1);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const patch = onUpdate.mock.calls[0][0] as { deck: DeckConfig };
    expect(patch.deck.pages[0].slots[0].label).toBe('b');
    expect(patch.deck.pages[0].slots[1].label).toBe('a');
  });

  it('addPage patches config.deck with an appended empty page', () => {
    const widget = widgetWith({ pages: [{ slots: [{ label: 'a' }] }] });
    const onUpdate = vi.fn();
    const target = makeWidgetDeckTarget(widget, onUpdate);
    target.addPage();
    const patch = onUpdate.mock.calls[0][0] as { deck: DeckConfig };
    expect(patch.deck.pages).toHaveLength(2);
    expect(patch.deck.pages[1]).toEqual({ slots: [] });
  });

  it('removePage patches config.deck with the page removed', () => {
    const widget = widgetWith({ pages: [{ slots: [{ label: 'a' }] }, { slots: [{ label: 'b' }] }] });
    const onUpdate = vi.fn();
    const target = makeWidgetDeckTarget(widget, onUpdate);
    target.removePage(0);
    const patch = onUpdate.mock.calls[0][0] as { deck: DeckConfig };
    expect(patch.deck.pages).toHaveLength(1);
    expect(patch.deck.pages[0].slots[0].label).toBe('b');
  });
});

describe('makePhysicalDeckTarget', () => {
  it('reserves a Back key when updating a slot inside a folder', () => {
    const config: DeckConfig = { pages: [{ slots: [{ folder: { slots: [{ label: 'inner' }] } }] }] };
    const persist = vi.fn();
    const target = makePhysicalDeckTarget(3, 2, 6, config, persist);
    target.updateSlot(0, [0], 2, { label: 'set' });
    expect(persist).toHaveBeenCalledTimes(1);
    const next = persist.mock.calls[0][0] as DeckConfig;
    // Folder level holds keyCount-1 = 5 slots; index 2 is in range.
    expect(next.pages[0].slots[0].folder!.slots[2].label).toBe('set');
  });

  it('swapSlots is a no-op call when from === to (no persist)', () => {
    const config: DeckConfig = { pages: [{ slots: [{ label: 'a' }] }] };
    const persist = vi.fn();
    const target = makePhysicalDeckTarget(3, 2, 6, config, persist);
    target.swapSlots(0, [], 0, 0);
    expect(persist).not.toHaveBeenCalled();
  });

  it('addPage persists an appended empty page', () => {
    const config: DeckConfig = { pages: [{ slots: [{ label: 'a' }] }] };
    const persist = vi.fn();
    const target = makePhysicalDeckTarget(3, 2, 6, config, persist);
    target.addPage();
    const next = persist.mock.calls[0][0] as DeckConfig;
    expect(next.pages).toHaveLength(2);
  });

  it('removePage persists the deck with that page removed', () => {
    const config: DeckConfig = { pages: [{ slots: [{ label: 'a' }] }, { slots: [{ label: 'b' }] }] };
    const persist = vi.fn();
    const target = makePhysicalDeckTarget(3, 2, 6, config, persist);
    target.removePage(1);
    const next = persist.mock.calls[0][0] as DeckConfig;
    expect(next.pages).toHaveLength(1);
    expect(next.pages[0].slots[0].label).toBe('a');
  });
});

describe('resolveTargetView', () => {
  it('pads the root view to the physical target keyCount', () => {
    const target: DeckTarget = makePhysicalDeckTarget(3, 2, 6, { pages: [{ slots: [{ label: 'a' }] }] }, vi.fn());
    const view = resolveTargetView(target, 0, []);
    expect(view).toHaveLength(6);
    expect(view![0].label).toBe('a');
  });

  it('pads a folder view to keyCount - 1 (Back reserved)', () => {
    const config: DeckConfig = { pages: [{ slots: [{ folder: { slots: [{ label: 'x' }] } }] }] };
    const target: DeckTarget = makePhysicalDeckTarget(3, 2, 6, config, vi.fn());
    const view = resolveTargetView(target, 0, [0]);
    expect(view).toHaveLength(5);
    expect(view![0].label).toBe('x');
  });

  it('resolves the view for a non-zero page', () => {
    const config: DeckConfig = { pages: [{ slots: [{ label: 'p0' }] }, { slots: [{ label: 'p1' }] }] };
    const target: DeckTarget = makePhysicalDeckTarget(3, 2, 6, config, vi.fn());
    const view = resolveTargetView(target, 1, []);
    expect(view![0].label).toBe('p1');
  });
});

describe('computeViewUploadJobs', () => {
  it('emits one job per non-toggle slot at state 0', () => {
    const slots = [{ label: 'a' }, {}];
    const jobs = computeViewUploadJobs(slots, []);
    expect(jobs).toEqual([
      { slotPath: '0', state: 0, slot: slots[0] },
      { slotPath: '1', state: 0, slot: slots[1] },
    ]);
  });

  it('emits both states for a toggle slot, each resolved to its branch', () => {
    const toggleSlot = {
      action: {
        type: 'toggle' as const,
        on: { type: 'system' as const, action: { op: 'muteToggle' as const } },
        off: { type: 'system' as const, action: { op: 'muteToggle' as const } },
        state: { kind: 'mute' as const },
      },
    };
    const jobs = computeViewUploadJobs([toggleSlot], [2]);
    expect(jobs).toHaveLength(2);
    expect(jobs[0]).toMatchObject({ slotPath: '2.0', state: 0 });
    expect(jobs[1]).toMatchObject({ slotPath: '2.0', state: 1 });
    // Both states get an auto icon/color derived from the (identical) branches.
    expect(jobs[0].slot.icon).toBeTruthy();
    expect(jobs[1].slot.icon).toBeTruthy();
  });

  it('joins nested folder paths with dots', () => {
    const jobs = computeViewUploadJobs([{}], [2, 5]);
    expect(jobs[0].slotPath).toBe('2.5.0');
  });

  it('skips monitoring slots entirely (the service renders those keys itself)', () => {
    const monitoringSlot = {
      action: { type: 'monitoring' as const, category: 'cpu' as const, sensor: 'x', style: 'line' as const },
    };
    const jobs = computeViewUploadJobs([{ label: 'a' }, monitoringSlot, {}], []);
    expect(jobs).toEqual([
      { slotPath: '0', state: 0, slot: { label: 'a' } },
      { slotPath: '2', state: 0, slot: {} },
    ]);
  });
});
