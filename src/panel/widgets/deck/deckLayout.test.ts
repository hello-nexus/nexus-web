import { describe, it, expect } from 'vitest';
import {
  innerGridForSize, normalizeDeckConfig, padSlots, resolveViewSlots, updateSlotAt, emptyDeck,
} from './deckLayout';
import type { DeckConfig } from './types';

describe('innerGridForSize', () => {
  it('maps sizes to inner grid counts', () => {
    expect(innerGridForSize('2x2')).toEqual({ cols: 2, rows: 2, count: 4 });
    expect(innerGridForSize('4x2')).toEqual({ cols: 4, rows: 2, count: 8 });
    expect(innerGridForSize('4x4')).toEqual({ cols: 4, rows: 4, count: 16 });
  });
});

describe('normalizeDeckConfig', () => {
  it('returns a single empty page for junk input', () => {
    expect(normalizeDeckConfig(undefined).pages).toHaveLength(1);
    expect(normalizeDeckConfig({}).pages).toHaveLength(1);
    expect(normalizeDeckConfig({ pages: [] }).pages).toHaveLength(1);
  });
  it('preserves valid pages + showLabels', () => {
    const cfg = normalizeDeckConfig({ showLabels: true, pages: [{ slots: [{ label: 'x' }] }] });
    expect(cfg.showLabels).toBe(true);
    expect(cfg.pages[0].slots[0].label).toBe('x');
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
  const deck: DeckConfig = {
    pages: [{ slots: [{ folder: { slots: [{ label: 'inner' }] } }] }],
  };
  it('resolves top-level page slots padded to count', () => {
    const slots = resolveViewSlots(deck, 0, [], 4);
    expect(slots).toHaveLength(4);
    expect(slots![0].folder).toBeTruthy();
  });
  it('drills into a folder path', () => {
    const slots = resolveViewSlots(deck, 0, [0], 4);
    expect(slots![0].label).toBe('inner');
  });
  it('returns null for an invalid folder path', () => {
    expect(resolveViewSlots(deck, 0, [1], 4)).toBeNull();
    expect(resolveViewSlots(deck, 9, [], 4)).toBeNull();
  });
});

describe('updateSlotAt', () => {
  it('replaces a top-level slot immutably', () => {
    const deck = emptyDeck();
    const next = updateSlotAt(deck, 0, [], 2, { label: 'set' }, 4);
    expect(next).not.toBe(deck);
    expect(next.pages[0].slots[2].label).toBe('set');
    expect(deck.pages[0].slots).toHaveLength(0); // original untouched
  });
  it('replaces a slot inside a folder', () => {
    const deck: DeckConfig = { pages: [{ slots: [{ folder: { slots: [] } }] }] };
    const next = updateSlotAt(deck, 0, [0], 1, { label: 'deep' }, 4);
    expect(next.pages[0].slots[0].folder!.slots[1].label).toBe('deep');
  });
});
