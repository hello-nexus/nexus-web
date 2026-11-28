import { render, screen } from '@testing-library/react';
import { List, ShoppingCart, Star } from 'lucide-react';
import { describe, expect, it } from 'vitest';
import { DECK_ICONS } from '../deck/deckIcons';
import { ReminderIconGlyph } from './ReminderIconGlyph';
import { keyFromPicker, pickerValueFor, resolveListIcon } from './reminderIcons';

describe('list icon resolution', () => {
  it('keeps the original lowercase keys working as aliases', () => {
    for (const key of ['list', 'bookmark', 'star', 'heart', 'home', 'cart', 'briefcase', 'gift']) {
      const icon = resolveListIcon(key);
      expect(icon.kind).toBe('lucide');
    }
    expect(resolveListIcon('cart')).toEqual({ kind: 'lucide', Icon: ShoppingCart });
  });

  it('resolves a deck icon name', () => {
    expect(resolveListIcon('Star')).toEqual({ kind: 'lucide', Icon: DECK_ICONS.Star });
    expect(DECK_ICONS.Star).toBe(Star);
    expect(resolveListIcon('Rocket')).toEqual({ kind: 'lucide', Icon: DECK_ICONS.Rocket });
  });

  it('resolves an emoji, including a ZWJ sequence, to its glyph', () => {
    expect(resolveListIcon('emoji:🛒')).toEqual({ kind: 'emoji', glyph: '🛒' });
    const family = '👨\u200d👩\u200d👧\u200d👦';
    expect(resolveListIcon(`emoji:${family}`)).toEqual({ kind: 'emoji', glyph: family });
    expect(resolveListIcon('emoji:❤\ufe0f')).toEqual({ kind: 'emoji', glyph: '❤\ufe0f' });
  });

  it('falls back to List for an unknown key or an empty emoji', () => {
    expect(resolveListIcon('NoSuchIcon')).toEqual({ kind: 'lucide', Icon: List });
    expect(resolveListIcon('emoji:')).toEqual({ kind: 'lucide', Icon: List });
    expect(resolveListIcon('')).toEqual({ kind: 'lucide', Icon: List });
  });

  it('makes every default and seeded icon selectable in the picker', () => {
    for (const key of ['list', 'bookmark', 'star', 'heart', 'home', 'cart', 'briefcase', 'gift']) {
      const value = pickerValueFor(key);
      expect(value?.kind).toBe('lucide');
      expect(DECK_ICONS[value!.value]).toBeDefined();
    }
  });

  it('round-trips a picker choice through the stored key', () => {
    expect(keyFromPicker({ kind: 'lucide', value: 'Rocket' })).toBe('Rocket');
    expect(keyFromPicker({ kind: 'emoji', value: '🛒' })).toBe('emoji:🛒');
    expect(pickerValueFor('emoji:🛒')).toEqual({ kind: 'emoji', value: '🛒' });
    expect(pickerValueFor('Rocket')).toEqual({ kind: 'lucide', value: 'Rocket' });
    expect(pickerValueFor('home')).toEqual({ kind: 'lucide', value: 'Home' });
    expect(pickerValueFor('cart')).toEqual({ kind: 'lucide', value: 'ShoppingCart' });
    expect(pickerValueFor('Nope')).toBeUndefined();
  });

  it('draws a Lucide icon as an svg and an emoji as its glyph text', () => {
    const { container, rerender } = render(<ReminderIconGlyph iconKey="Rocket" />);
    expect(container.querySelector('svg')).not.toBeNull();
    rerender(<ReminderIconGlyph iconKey="emoji:🛒" />);
    expect(container.querySelector('svg')).toBeNull();
    expect(screen.getByText('🛒')).toBeTruthy();
  });
});
