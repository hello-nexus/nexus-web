import { describe, expect, it } from 'vitest';
import { deckKeyAt } from './deckKeyAt';

function deck(page: string, folder: string, slot: string): HTMLElement {
  const root = document.createElement('div');
  root.dataset.deckPage = page;
  root.dataset.deckFolder = folder;
  const cell = document.createElement('div');
  cell.dataset.deckSlotIndex = slot;
  const glyph = document.createElement('span');
  cell.appendChild(glyph);
  root.appendChild(cell);
  return glyph;
}

describe('deckKeyAt', () => {
  it('reads the key, page and folder under the tap', () => {
    expect(deckKeyAt(deck('1', '', '6'))).toEqual({ page: 1, folderPath: [], slot: 6 });
    expect(deckKeyAt(deck('0', '2.1', '0'))).toEqual({ page: 0, folderPath: [2, 1], slot: 0 });
  });

  it('is undefined off a key or on malformed attributes', () => {
    expect(deckKeyAt(document.createElement('div'))).toBeUndefined();
    expect(deckKeyAt(null)).toBeUndefined();
    expect(deckKeyAt(deck('x', '', '1'))).toBeUndefined();
  });
});
