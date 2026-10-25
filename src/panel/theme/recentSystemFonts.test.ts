import { beforeEach, describe, expect, it } from 'vitest';
import { loadRecentSystemFonts, pushRecentSystemFont, RECENT_SYSTEM_FONTS_MAX } from './recentSystemFonts';

describe('recent system fonts', () => {
  beforeEach(() => localStorage.clear());

  it('starts empty', () => {
    expect(loadRecentSystemFonts()).toEqual([]);
  });

  it('keeps most recent first and moves a repeat to the front without duplicating', () => {
    pushRecentSystemFont('A');
    pushRecentSystemFont('B');
    expect(pushRecentSystemFont('A')).toEqual(['A', 'B']);
    expect(loadRecentSystemFonts()).toEqual(['A', 'B']);
  });

  it('caps the list', () => {
    for (const f of ['A', 'B', 'C', 'D', 'E']) pushRecentSystemFont(f);
    const list = loadRecentSystemFonts();
    expect(list).toHaveLength(RECENT_SYSTEM_FONTS_MAX);
    expect(list[0]).toBe('E');
  });

  it('ignores unreadable storage', () => {
    localStorage.setItem('panel.theme.recentSystemFonts', '{"nope":1}');
    expect(loadRecentSystemFonts()).toEqual([]);
    localStorage.setItem('panel.theme.recentSystemFonts', '["ok", 3, ""]');
    expect(loadRecentSystemFonts()).toEqual(['ok']);
  });
});
