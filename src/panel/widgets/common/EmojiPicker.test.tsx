import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { EmojiPicker } from './EmojiPicker';
import { EMOJI_CATEGORIES, EMOJI_CATEGORY_KEYS } from './emojiData';

describe('EmojiPicker categories', () => {
  it('renders a tab per category and the first category emojis by default', () => {
    render(<EmojiPicker onSelect={vi.fn()} />);
    for (const key of EMOJI_CATEGORY_KEYS) {
      expect(screen.getByRole('button', { name: key })).toBeInTheDocument();
    }
    const firstEmoji = EMOJI_CATEGORIES[EMOJI_CATEGORY_KEYS[0]].emojis[0];
    expect(screen.getAllByText(firstEmoji).length).toBeGreaterThan(0);
  });

  it('switches the grid to the clicked category', () => {
    render(<EmojiPicker onSelect={vi.fn()} />);
    const secondKey = EMOJI_CATEGORY_KEYS[1];
    fireEvent.click(screen.getByRole('button', { name: secondKey }));
    const secondCategoryEmoji = EMOJI_CATEGORIES[secondKey].emojis[0];
    expect(screen.getAllByText(secondCategoryEmoji).length).toBeGreaterThan(0);
  });

  it('fires onSelect with the clicked emoji', () => {
    const onSelect = vi.fn();
    render(<EmojiPicker onSelect={onSelect} />);
    const firstEmoji = EMOJI_CATEGORIES[EMOJI_CATEGORY_KEYS[0]].emojis[0];
    fireEvent.click(screen.getByText(firstEmoji));
    expect(onSelect).toHaveBeenCalledWith(firstEmoji);
  });

  it('highlights the emoji matching value', () => {
    const firstEmoji = EMOJI_CATEGORIES[EMOJI_CATEGORY_KEYS[0]].emojis[0];
    const { container } = render(<EmojiPicker value={firstEmoji} onSelect={vi.fn()} />);
    const button = screen.getByText(firstEmoji).closest('button');
    expect(button?.className).toMatch(/activeEmoji/);
    const others = container.querySelectorAll('button');
    const activeCount = Array.from(others).filter(b => b.className.includes('activeEmoji')).length;
    expect(activeCount).toBe(1);
  });
});

describe('EmojiPicker searchable=false (widget usage)', () => {
  it('never renders a search input', () => {
    render(<EmojiPicker onSelect={vi.fn()} />);
    expect(screen.queryByRole('textbox')).toBeNull();
  });
});

describe('EmojiPicker searchable=true (editor usage)', () => {
  it('renders a search input above the tabs', () => {
    render(<EmojiPicker onSelect={vi.fn()} searchable />);
    expect(screen.getByRole('textbox', { name: 'panel.iconPicker.emojiSearch' })).toBeInTheDocument();
  });

  it('hides the category tabs and filters the grid once a query is entered', () => {
    render(<EmojiPicker onSelect={vi.fn()} searchable />);
    const input = screen.getByRole('textbox', { name: 'panel.iconPicker.emojiSearch' });
    fireEvent.change(input, { target: { value: 'rocket' } });

    for (const key of EMOJI_CATEGORY_KEYS) {
      expect(screen.queryByRole('button', { name: key })).toBeNull();
    }
    expect(screen.getAllByText('\u{1F680}').length).toBeGreaterThan(0);
  });

  it('returns to category browsing once the query is cleared', () => {
    render(<EmojiPicker onSelect={vi.fn()} searchable />);
    const input = screen.getByRole('textbox', { name: 'panel.iconPicker.emojiSearch' });
    fireEvent.change(input, { target: { value: 'rocket' } });
    fireEvent.change(input, { target: { value: '' } });

    expect(screen.getByRole('button', { name: EMOJI_CATEGORY_KEYS[0] })).toBeInTheDocument();
    const firstEmoji = EMOJI_CATEGORIES[EMOJI_CATEGORY_KEYS[0]].emojis[0];
    expect(screen.getAllByText(firstEmoji).length).toBeGreaterThan(0);
  });

  it('shows no results for a query that matches nothing', () => {
    const { container } = render(<EmojiPicker onSelect={vi.fn()} searchable />);
    const input = screen.getByRole('textbox', { name: 'panel.iconPicker.emojiSearch' });
    fireEvent.change(input, { target: { value: 'zzzznotaword' } });
    const grid = container.querySelector('[data-panel-scrollable="true"]');
    expect(grid?.querySelectorAll('button').length ?? -1).toBe(0);
  });
});
