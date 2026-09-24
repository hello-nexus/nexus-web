// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { fitToGrid, fitPageCount, type FitGridPreset, type FitGridTarget } from './deckLayout';
import type { DeckConfig } from './types';
import vectorsFile from './fitToGrid.vectors.json';

interface FitToGridVectorCase {
  name: string;
  presetCols: number;
  presetRows: number;
  targetCols: number;
  targetRows: number;
  targetKind: FitGridTarget['kind'];
  preset: DeckConfig;
  expected: DeckConfig;
}

const { cases } = vectorsFile as { description: string; cases: FitToGridVectorCase[] };

describe('fitToGrid (shared vectors, mirrored in nexus-service/tests/Deck/fitToGrid.vectors.json)', () => {
  it.each(cases)('$name', ({ presetCols, presetRows, targetCols, targetRows, targetKind, preset, expected }) => {
    const result = fitToGrid(
      { cols: presetCols, rows: presetRows, deck: preset },
      { cols: targetCols, rows: targetRows, kind: targetKind },
    );
    expect(result).toEqual(expected);
  });
});

describe('fitToGrid edge cases', () => {
  it('carries the deck-wide default title style through unchanged', () => {
    const preset: FitGridPreset = {
      cols: 2, rows: 2,
      deck: { pages: [{ slots: [] }], defaultTitleStyle: { show: true, bold: true } },
    };
    const target: FitGridTarget = { cols: 2, rows: 2, kind: 'widget' };
    expect(fitToGrid(preset, target).defaultTitleStyle).toEqual({ show: true, bold: true });
  });

  it('never emits zero pages, even for an authored deck with no pages', () => {
    const preset: FitGridPreset = { cols: 2, rows: 2, deck: { pages: [] } };
    const target: FitGridTarget = { cols: 2, rows: 2, kind: 'widget' };
    const result = fitToGrid(preset, target);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].slots).toHaveLength(4);
  });

  it('truncates instead of chunking below the minimum viable target (T < 3), never looping', () => {
    const preset: FitGridPreset = { cols: 4, rows: 1, deck: { pages: [{ slots: [{ label: 'a' }, { label: 'b' }, { label: 'c' }] }] } };
    const target: FitGridTarget = { cols: 2, rows: 1, kind: 'widget' };
    const result = fitToGrid(preset, target);
    expect(result.pages).toHaveLength(1);
    expect(result.pages[0].slots).toEqual([{ label: 'a' }, { label: 'b' }]);
  });
});

describe('fitPageCount', () => {
  it('reports 1 when the authored content fits the target', () => {
    const preset: FitGridPreset = { cols: 2, rows: 2, deck: { pages: [{ slots: [{ label: 'a' }] }] } };
    expect(fitPageCount(preset, { cols: 2, rows: 2, kind: 'physical' })).toBe(1);
  });

  it('reports the number of chunked pages when the authored content overflows', () => {
    const preset: FitGridPreset = {
      cols: 5, rows: 1,
      deck: { pages: [{ slots: [{ label: 'a' }, { label: 'b' }, { label: 'c' }, { label: 'd' }, { label: 'e' } ] }] },
    };
    expect(fitPageCount(preset, { cols: 3, rows: 1, kind: 'physical' })).toBe(3);
  });
});
