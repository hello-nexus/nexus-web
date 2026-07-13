import { describe, it, expect } from 'vitest';
import { shouldPaintIcon, DECK_BACK_KEY_ICON, coverFitRect } from './renderDeckKeyBitmap';
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

  it('is true for a custom image icon even with no action yet', () => {
    const slot: DeckSlot = { icon: { kind: 'image', value: 'abc123' } };
    expect(shouldPaintIcon(slot)).toBe(true);
  });
});

// paintIcon's image branch draws cover-fit via this pure rect math (jsdom
// can't rasterize canvas, so the draw call itself stays untested here - see
// the file header).
describe('coverFitRect', () => {
  it('crops a wider-than-square image, centering the overflow horizontally', () => {
    const rect = coverFitRect(200, 100, 100);
    expect(rect).toEqual({ x: -50, y: 0, w: 200, h: 100 });
  });

  it('crops a taller-than-square image, centering the overflow vertically', () => {
    const rect = coverFitRect(100, 200, 100);
    expect(rect).toEqual({ x: 0, y: -50, w: 100, h: 200 });
  });

  it('exactly fits a square image with no offset', () => {
    const rect = coverFitRect(144, 144, 90);
    expect(rect).toEqual({ x: 0, y: 0, w: 90, h: 90 });
  });

  it('scales up a small image to fully cover a larger key face', () => {
    const rect = coverFitRect(50, 50, 144);
    expect(rect).toEqual({ x: 0, y: 0, w: 144, h: 144 });
  });
});

describe('DECK_BACK_KEY_ICON', () => {
  it('is the curved go-up-a-level glyph, not a chevron, and is registered in DECK_ICONS', () => {
    expect(DECK_BACK_KEY_ICON).toBe('Undo2');
    expect(DECK_ICONS[DECK_BACK_KEY_ICON]).toBeDefined();
  });
});
