// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { EMOJI_CATEGORIES, EMOJI_CATEGORY_KEYS, searchEmojis } from './emojiData';

describe('EMOJI_CATEGORIES', () => {
  it('has a matching key list', () => {
    expect(EMOJI_CATEGORY_KEYS).toEqual(Object.keys(EMOJI_CATEGORIES));
    expect(EMOJI_CATEGORY_KEYS.length).toBeGreaterThan(0);
  });

  it('gives every category a tab icon and a non-empty emoji list', () => {
    for (const key of EMOJI_CATEGORY_KEYS) {
      const category = EMOJI_CATEGORIES[key];
      expect(typeof category.icon).toBe('string');
      expect(category.icon.length).toBeGreaterThan(0);
      expect(category.emojis.length).toBeGreaterThan(0);
    }
  });

  it('never lists the same emoji twice across categories', () => {
    const seen = new Set<string>();
    for (const key of EMOJI_CATEGORY_KEYS) {
      for (const emoji of EMOJI_CATEGORIES[key].emojis) {
        expect(seen.has(emoji)).toBe(false);
        seen.add(emoji);
      }
    }
  });

  it('has a keyword entry for every emoji, so search never silently drops one', async () => {
    const keywords = (await import('./emojiKeywords.json')).default as Record<string, string[]>;
    const missing: string[] = [];
    for (const key of EMOJI_CATEGORY_KEYS) {
      for (const emoji of EMOJI_CATEGORIES[key].emojis) {
        if (!keywords[emoji]) missing.push(emoji);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('searchEmojis', () => {
  it('returns [] for an empty or whitespace-only query', () => {
    expect(searchEmojis('')).toEqual([]);
    expect(searchEmojis('   ')).toEqual([]);
  });

  it('matches a single keyword by prefix, case-insensitively', () => {
    expect(searchEmojis('rock')).toContain('\u{1F680}');
    expect(searchEmojis('ROCK')).toContain('\u{1F680}');
  });

  it('requires every whitespace-separated token to prefix-match some keyword', () => {
    const results = searchEmojis('face grin');
    expect(results).toContain('\u{1F600}');
    // A token that matches nothing should exclude every emoji.
    expect(searchEmojis('face zzzznotaword')).toEqual([]);
  });

  it('does not match a substring that is not a prefix of any keyword', () => {
    expect(searchEmojis('ocket')).not.toContain('\u{1F680}');
  });
});
