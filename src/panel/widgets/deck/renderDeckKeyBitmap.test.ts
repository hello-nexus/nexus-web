import { describe, it, expect } from 'vitest';
import { shouldPaintIcon, DECK_BACK_KEY_ICON } from './renderDeckKeyBitmap';
import { DECK_ICONS } from './deckIcons';
import type { DeckSlot } from './types';

describe('shouldPaintIcon', () => {
  it('is false for a genuinely empty slot (no action, no folder, no icon)', () => {
    const slot: DeckSlot = {};
    expect(shouldPaintIcon(slot)).toBe(false);
  });

  it('is false for an empty slot that only carries a label', () => {
    const slot: DeckSlot = { label: 'note' };
    expect(shouldPaintIcon(slot)).toBe(false);
  });

  it('is true when an action is set', () => {
    const slot: DeckSlot = { action: { type: 'openUrl', url: 'https://x.com' } };
    expect(shouldPaintIcon(slot)).toBe(true);
  });

  it('is true for a folder slot', () => {
    const slot: DeckSlot = { folder: { slots: [] } };
    expect(shouldPaintIcon(slot)).toBe(true);
  });

  it('is true when an explicit icon is set even with no action yet', () => {
    const slot: DeckSlot = { icon: { kind: 'lucide', value: 'Rocket' } };
    expect(shouldPaintIcon(slot)).toBe(true);
  });
});

describe('DECK_BACK_KEY_ICON', () => {
  it('is the curved go-up-a-level glyph, not a chevron, and is registered in DECK_ICONS', () => {
    expect(DECK_BACK_KEY_ICON).toBe('Undo2');
    expect(DECK_ICONS[DECK_BACK_KEY_ICON]).toBeDefined();
  });
});
