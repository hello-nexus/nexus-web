// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import { makePresetDeckTarget, resolveTargetView, slotCountAtDepth, slotPathAt, type DeckTarget } from './deckTarget';
import type { DeckPresetFull } from '../../../api/deck';
import type { DeckConfig } from './types';

function preset(deck: DeckConfig, cols = 3, rows = 2): DeckPresetFull {
  return { id: 'p1', name: 'Preset', cols, rows, pageCount: deck.pages.length, deck };
}

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

describe('slotPathAt', () => {
  it('joins the folder chain and index with dots', () => {
    expect(slotPathAt([], 3)).toBe('3');
    expect(slotPathAt([2, 1], 5)).toBe('2.1.5');
  });
});

describe('makePresetDeckTarget', () => {
  it('exposes the preset authored grid regardless of any instance grid', () => {
    const target = makePresetDeckTarget(preset({ pages: [{ slots: [{ label: 'a' }] }] }), 'widget', vi.fn());
    expect(target.kind).toBe('widget');
    expect(target.cols).toBe(3);
    expect(target.rows).toBe(2);
    expect(target.keyCount).toBe(6);
    expect(target.config.pages[0].slots[0].label).toBe('a');
  });

  it('updateSlot saves the full updated tree (widget kind)', () => {
    const save = vi.fn();
    const target = makePresetDeckTarget(preset({ pages: [{ slots: [] }] }), 'widget', save);
    target.updateSlot(0, [], 1, { label: 'x' });
    expect(save).toHaveBeenCalledTimes(1);
    const next = save.mock.calls[0][0] as DeckConfig;
    expect(next.pages[0].slots[1].label).toBe('x');
  });

  it('updateSlot writes into the given page only', () => {
    const save = vi.fn();
    const target = makePresetDeckTarget(preset({ pages: [{ slots: [{ label: 'p0' }] }, { slots: [] }] }), 'widget', save);
    target.updateSlot(1, [], 0, { label: 'p1' });
    const next = save.mock.calls[0][0] as DeckConfig;
    expect(next.pages[0].slots[0].label).toBe('p0');
    expect(next.pages[1].slots[0].label).toBe('p1');
  });

  it('swapSlots saves the swapped tree and is a no-op for from === to', () => {
    const save = vi.fn();
    const target = makePresetDeckTarget(preset({ pages: [{ slots: [{ label: 'a' }, { label: 'b' }] }] }), 'widget', save);
    target.swapSlots(0, [], 0, 1);
    expect(save).toHaveBeenCalledTimes(1);
    const next = save.mock.calls[0][0] as DeckConfig;
    expect(next.pages[0].slots[0].label).toBe('b');
    expect(next.pages[0].slots[1].label).toBe('a');
  });

  it('swapSlots is a no-op call when from === to (no save)', () => {
    const save = vi.fn();
    const target = makePresetDeckTarget(preset({ pages: [{ slots: [{ label: 'a' }] }] }), 'physical', save);
    target.swapSlots(0, [], 0, 0);
    expect(save).not.toHaveBeenCalled();
  });

  it('addPage saves an appended empty page', () => {
    const save = vi.fn();
    const target = makePresetDeckTarget(preset({ pages: [{ slots: [{ label: 'a' }] }] }), 'widget', save);
    target.addPage();
    const next = save.mock.calls[0][0] as DeckConfig;
    expect(next.pages).toHaveLength(2);
    expect(next.pages[1]).toEqual({ slots: [] });
  });

  it('removePage saves the deck with that page removed', () => {
    const save = vi.fn();
    const target = makePresetDeckTarget(preset({ pages: [{ slots: [{ label: 'a' }] }, { slots: [{ label: 'b' }] }] }), 'widget', save);
    target.removePage(0);
    const next = save.mock.calls[0][0] as DeckConfig;
    expect(next.pages).toHaveLength(1);
    expect(next.pages[0].slots[0].label).toBe('b');
  });

  it('setTitleDefault saves the deck-wide default title style', () => {
    const save = vi.fn();
    const target = makePresetDeckTarget(preset({ pages: [{ slots: [] }] }), 'widget', save);
    target.setTitleDefault({ show: true, bold: true });
    const next = save.mock.calls[0][0] as DeckConfig;
    expect(next.defaultTitleStyle).toEqual({ show: true, bold: true });
  });

  it('reserves a Back key when updating a slot inside a folder (physical kind)', () => {
    const config: DeckConfig = { pages: [{ slots: [{ folder: { slots: [{ label: 'inner' }] } }] }] };
    const save = vi.fn();
    const target = makePresetDeckTarget(preset(config), 'physical', save);
    target.updateSlot(0, [0], 2, { label: 'set' });
    expect(save).toHaveBeenCalledTimes(1);
    const next = save.mock.calls[0][0] as DeckConfig;
    // Folder level holds keyCount-1 = 5 slots (6-key authored grid); index 2 is in range.
    expect(next.pages[0].slots[0].folder!.slots[2].label).toBe('set');
  });
});

describe('resolveTargetView', () => {
  it('pads the root view to the physical target keyCount', () => {
    const target: DeckTarget = makePresetDeckTarget(preset({ pages: [{ slots: [{ label: 'a' }] }] }), 'physical', vi.fn());
    const view = resolveTargetView(target, 0, []);
    expect(view).toHaveLength(6);
    expect(view![0].label).toBe('a');
  });

  it('pads a folder view to keyCount - 1 (Back reserved)', () => {
    const config: DeckConfig = { pages: [{ slots: [{ folder: { slots: [{ label: 'x' }] } }] }] };
    const target: DeckTarget = makePresetDeckTarget(preset(config), 'physical', vi.fn());
    const view = resolveTargetView(target, 0, [0]);
    expect(view).toHaveLength(5);
    expect(view![0].label).toBe('x');
  });

  it('resolves the view for a non-zero page', () => {
    const config: DeckConfig = { pages: [{ slots: [{ label: 'p0' }] }, { slots: [{ label: 'p1' }] }] };
    const target: DeckTarget = makePresetDeckTarget(preset(config), 'physical', vi.fn());
    const view = resolveTargetView(target, 1, []);
    expect(view![0].label).toBe('p1');
  });
});
