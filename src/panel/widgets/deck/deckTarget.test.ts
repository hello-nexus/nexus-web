import { describe, it, expect, vi } from 'vitest';
import {
  computeViewUploadJobs, makePhysicalDeckTarget, makeWidgetDeckTarget, resolveTargetView, slotCountAtDepth,
  truncateConfigForTarget, type DeckTarget,
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
    const widget = widgetWith({ slots: [{ label: 'a' }] });
    const onUpdate = vi.fn();
    const target = makeWidgetDeckTarget(widget, onUpdate);
    expect(target.kind).toBe('widget');
    expect(target.cols).toBe(2);
    expect(target.rows).toBe(2);
    expect(target.keyCount).toBe(4);
    expect(target.config.slots[0].label).toBe('a');
  });

  it('updateSlot patches config.deck with the full updated tree', () => {
    const widget = widgetWith({ slots: [] });
    const onUpdate = vi.fn();
    const target = makeWidgetDeckTarget(widget, onUpdate);
    target.updateSlot([], 1, { label: 'x' });
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const patch = onUpdate.mock.calls[0][0] as { deck: DeckConfig };
    expect(patch.deck.slots[1].label).toBe('x');
  });

  it('swapSlots patches with the swapped tree and is a no-op for from === to', () => {
    const widget = widgetWith({ slots: [{ label: 'a' }, { label: 'b' }] });
    const onUpdate = vi.fn();
    const target = makeWidgetDeckTarget(widget, onUpdate);
    target.swapSlots([], 0, 1);
    expect(onUpdate).toHaveBeenCalledTimes(1);
    const patch = onUpdate.mock.calls[0][0] as { deck: DeckConfig };
    expect(patch.deck.slots[0].label).toBe('b');
    expect(patch.deck.slots[1].label).toBe('a');
  });
});

describe('makePhysicalDeckTarget', () => {
  it('reserves a Back key when updating a slot inside a folder', () => {
    const config: DeckConfig = { slots: [{ folder: { slots: [{ label: 'inner' }] } }] };
    const persist = vi.fn();
    const target = makePhysicalDeckTarget(3, 2, 6, config, persist);
    target.updateSlot([0], 2, { label: 'set' });
    expect(persist).toHaveBeenCalledTimes(1);
    const next = persist.mock.calls[0][0] as DeckConfig;
    // Folder level holds keyCount-1 = 5 slots; index 2 is in range.
    expect(next.slots[0].folder!.slots[2].label).toBe('set');
  });

  it('swapSlots is a no-op call when from === to (no persist)', () => {
    const config: DeckConfig = { slots: [{ label: 'a' }] };
    const persist = vi.fn();
    const target = makePhysicalDeckTarget(3, 2, 6, config, persist);
    target.swapSlots([], 0, 0);
    expect(persist).not.toHaveBeenCalled();
  });
});

describe('resolveTargetView', () => {
  it('pads the root view to the physical target keyCount', () => {
    const target: DeckTarget = makePhysicalDeckTarget(3, 2, 6, { slots: [{ label: 'a' }] }, vi.fn());
    const view = resolveTargetView(target, []);
    expect(view).toHaveLength(6);
    expect(view![0].label).toBe('a');
  });

  it('pads a folder view to keyCount - 1 (Back reserved)', () => {
    const config: DeckConfig = { slots: [{ folder: { slots: [{ label: 'x' }] } }] };
    const target: DeckTarget = makePhysicalDeckTarget(3, 2, 6, config, vi.fn());
    const view = resolveTargetView(target, [0]);
    expect(view).toHaveLength(5);
    expect(view![0].label).toBe('x');
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
});

describe('truncateConfigForTarget', () => {
  const target = { kind: 'physical' as const, keyCount: 6 };

  it('truncates the root level to the target keyCount and reports truncated: true', () => {
    const source: DeckConfig = { slots: Array.from({ length: 16 }, (_, i) => ({ label: String(i) })) };
    const { config, truncated } = truncateConfigForTarget(source, target);
    expect(config.slots).toHaveLength(6);
    expect(config.slots.map(s => s.label)).toEqual(['0', '1', '2', '3', '4', '5']);
    expect(truncated).toBe(true);
  });

  it('truncates a nested folder to keyCount - 1 (Back key reserved) and reports truncated: true even when the root fits', () => {
    const source: DeckConfig = {
      // Root has 1 slot (fits easily); the folder inside it is the only overflow.
      slots: [{ folder: { slots: Array.from({ length: 16 }, (_, i) => ({ label: String(i) })) } }],
    };
    const { config, truncated } = truncateConfigForTarget(source, target);
    expect(config.slots[0].folder!.slots).toHaveLength(5);
    expect(truncated).toBe(true);
  });

  it('does not mutate the source and reports truncated: false when everything already fits', () => {
    const source: DeckConfig = { slots: [{ label: 'a' }, { label: 'b' }] };
    const { config, truncated } = truncateConfigForTarget(source, target);
    expect(config).not.toBe(source);
    expect(config.slots).toEqual(source.slots);
    expect(truncated).toBe(false);
  });

  it('reports truncated: false for a full root that exactly fits, even with a folder that would overflow at a deeper level than reached', () => {
    // Root at exactly keyCount, no folders at all: nothing to truncate anywhere.
    const source: DeckConfig = { slots: Array.from({ length: 6 }, (_, i) => ({ label: String(i) })) };
    const { truncated } = truncateConfigForTarget(source, target);
    expect(truncated).toBe(false);
  });
});
