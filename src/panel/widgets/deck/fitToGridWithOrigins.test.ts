// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { fitToGrid, fitToGridWithOrigins, type FitGridPreset, type FitGridTarget } from './deckLayout';
import type { DeckSlot } from './types';

const label = (text: string): DeckSlot => ({ label: text });

describe('fitToGridWithOrigins - non-chunked page', () => {
  it('maps every root-level fitted index straight to the same authored index, filled or blank', () => {
    const preset: FitGridPreset = { cols: 2, rows: 2, deck: { pages: [{ slots: [label('a'), label('b')] }] } };
    const target: FitGridTarget = { cols: 2, rows: 2, kind: 'widget' };
    const result = fitToGridWithOrigins(preset, target);

    expect(result.origins).toEqual([[
      { kind: 'authored', page: 0, slotIndex: 0 },
      { kind: 'authored', page: 0, slotIndex: 1 },
      { kind: 'authored', page: 0, slotIndex: 2 },
      { kind: 'authored', page: 0, slotIndex: 3 },
    ]]);
    expect(result.pageOrigins).toEqual([0]);
    expect(result.config).toEqual(fitToGrid(preset, target));
  });
});

describe('fitToGridWithOrigins - chunked overflow', () => {
  it('marks synthesized nav keys auto and maps content/blank keys to their real authored index', () => {
    const slots = Array.from({ length: 8 }, (_, i) => label(`k${i}`));
    const preset: FitGridPreset = { cols: 3, rows: 3, deck: { pages: [{ slots }] } };
    const target: FitGridTarget = { cols: 3, rows: 2, kind: 'physical' }; // keyCount 6

    const result = fitToGridWithOrigins(preset, target);
    expect(result.config.pages).toHaveLength(2);

    // Page 1: k0..k4 (indices 0-4) + auto next at index 5.
    expect(result.origins[0]).toEqual([
      { kind: 'authored', page: 0, slotIndex: 0 },
      { kind: 'authored', page: 0, slotIndex: 1 },
      { kind: 'authored', page: 0, slotIndex: 2 },
      { kind: 'authored', page: 0, slotIndex: 3 },
      { kind: 'authored', page: 0, slotIndex: 4 },
      { kind: 'auto' },
    ]);
    // Page 2: auto prev, k5..k7 (indices 5-7), then two real (blank) authored
    // slots at indices 8 and 9 - not 'auto' - so a click there can add a key.
    expect(result.origins[1]).toEqual([
      { kind: 'auto' },
      { kind: 'authored', page: 0, slotIndex: 5 },
      { kind: 'authored', page: 0, slotIndex: 6 },
      { kind: 'authored', page: 0, slotIndex: 7 },
      { kind: 'authored', page: 0, slotIndex: 8 },
      { kind: 'authored', page: 0, slotIndex: 9 },
    ]);
    expect(result.pageOrigins).toEqual([0, 0]);
    expect(result.config).toEqual(fitToGrid(preset, target));
  });

  it('attributes each fitted page to the correct authored page across multiple authored pages', () => {
    const bigSlots = Array.from({ length: 8 }, (_, i) => label(`p0k${i}`));
    const preset: FitGridPreset = {
      cols: 3, rows: 3,
      deck: { pages: [{ slots: bigSlots }, { slots: [label('p1k0')] }] },
    };
    const target: FitGridTarget = { cols: 3, rows: 2, kind: 'widget' }; // keyCount 6

    const result = fitToGridWithOrigins(preset, target);
    // Authored page 0 chunks into 2 fitted pages, authored page 1 fits in 1.
    expect(result.pageOrigins).toEqual([0, 0, 1]);
    expect(result.origins[2][0]).toEqual({ kind: 'authored', page: 1, slotIndex: 0 });
    expect(result.config).toEqual(fitToGrid(preset, target));
  });
});

describe('fitToGridWithOrigins - no authored pages', () => {
  it('falls back to one all-blank, all-auto page pointed at authored page 0', () => {
    const preset: FitGridPreset = { cols: 2, rows: 2, deck: { pages: [] } };
    const target: FitGridTarget = { cols: 2, rows: 2, kind: 'widget' };
    const result = fitToGridWithOrigins(preset, target);

    expect(result.origins).toEqual([[{ kind: 'auto' }, { kind: 'auto' }, { kind: 'auto' }, { kind: 'auto' }]]);
    expect(result.pageOrigins).toEqual([0]);
    expect(result.config).toEqual(fitToGrid(preset, target));
  });
});
