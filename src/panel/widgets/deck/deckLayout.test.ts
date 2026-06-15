import { describe, it, expect } from 'vitest';
import {
  innerGridForSize, normalizeDeckConfig, padSlots, resolveViewSlots, updateSlotAt, swapSlots, emptyDeck,
  defaultDeckConfig, deckConfigPatch,
} from './deckLayout';
import { deckApp } from './index';
import type { DeckConfig } from './types';

describe('defaultDeckConfig', () => {
  it('seeds a new deck with volume up/down + open settings', () => {
    expect(defaultDeckConfig().slots.map(s => s.action)).toEqual([
      { type: 'system', action: { op: 'volumeUp' } },
      { type: 'system', action: { op: 'volumeDown' } },
      { type: 'system', action: { op: 'openSettings' } },
    ]);
  });

  it('manifest defaultConfig returns a fresh deck patch each call', () => {
    const a = deckApp.meta.defaultConfig?.();
    const b = deckApp.meta.defaultConfig?.();
    expect(a).toEqual(deckConfigPatch(defaultDeckConfig()));
    expect(a).not.toBe(b);
  });
});

describe('innerGridForSize', () => {
  it('maps sizes to inner grid counts', () => {
    expect(innerGridForSize('2x2')).toEqual({ cols: 2, rows: 2, count: 4 });
    expect(innerGridForSize('4x2')).toEqual({ cols: 4, rows: 2, count: 8 });
    expect(innerGridForSize('4x4')).toEqual({ cols: 4, rows: 4, count: 16 });
  });
});

describe('normalizeDeckConfig', () => {
  it('returns empty slots for junk input', () => {
    expect(normalizeDeckConfig(undefined).slots).toEqual([]);
    expect(normalizeDeckConfig({}).slots).toEqual([]);
    expect(emptyDeck().slots).toEqual([]);
  });
  it('preserves valid slots', () => {
    const cfg = normalizeDeckConfig({ slots: [{ label: 'x' }] });
    expect(cfg.slots[0].label).toBe('x');
  });
});

describe('padSlots', () => {
  it('pads to count with empty slots', () => {
    expect(padSlots([{ label: 'a' }], 4)).toHaveLength(4);
    expect(padSlots([{ label: 'a' }], 4)[3]).toEqual({});
  });
  it('truncates beyond count', () => {
    expect(padSlots([{}, {}, {}, {}, {}], 4)).toHaveLength(4);
  });
});

describe('resolveViewSlots', () => {
  const deck: DeckConfig = { slots: [{ folder: { slots: [{ label: 'inner' }] } }] };
  it('resolves top-level slots padded to count', () => {
    const slots = resolveViewSlots(deck, [], 4);
    expect(slots).toHaveLength(4);
    expect(slots![0].folder).toBeTruthy();
  });
  it('drills into a folder path', () => {
    expect(resolveViewSlots(deck, [0], 4)![0].label).toBe('inner');
  });
  it('returns null for an invalid folder path', () => {
    expect(resolveViewSlots(deck, [1], 4)).toBeNull();
  });
});

describe('updateSlotAt', () => {
  it('replaces a top-level slot immutably', () => {
    const deck = emptyDeck();
    const next = updateSlotAt(deck, [], 2, { label: 'set' }, 4);
    expect(next).not.toBe(deck);
    expect(next.slots[2].label).toBe('set');
    expect(deck.slots).toHaveLength(0); // original untouched
  });
  it('replaces a slot inside a folder', () => {
    const deck: DeckConfig = { slots: [{ folder: { slots: [] } }] };
    const next = updateSlotAt(deck, [0], 1, { label: 'deep' }, 4);
    expect(next.slots[0].folder!.slots[1].label).toBe('deep');
  });
});

describe('swapSlots', () => {
  it('swaps two slots at the top level', () => {
    const deck: DeckConfig = { slots: [{ label: 'a' }, { label: 'b' }] };
    const next = swapSlots(deck, [], 0, 1, 4);
    expect(next.slots[0].label).toBe('b');
    expect(next.slots[1].label).toBe('a');
  });
  it('is a no-op when from === to', () => {
    const deck = emptyDeck();
    expect(swapSlots(deck, [], 1, 1, 4)).toBe(deck);
  });
});
