import { describe, expect, it } from 'vitest';
import { RECENTS_CAP, pushRecent } from './recents';

describe('pushRecent', () => {
  it('puts the newest first', () => {
    expect(pushRecent(['#111111'], '#222222')).toEqual(['#222222', '#111111']);
  });

  it('moves a repeat to the front without duplicating it, ignoring case', () => {
    expect(pushRecent(['#aaaaaa', '#bbbbbb'], '#BBBBBB')).toEqual(['#BBBBBB', '#aaaaaa']);
    expect(pushRecent(['plasma', 'fire'], 'fire')).toEqual(['fire', 'plasma']);
  });

  it('caps the list', () => {
    const full = Array.from({ length: RECENTS_CAP }, (_, i) => `k${i}`);
    const next = pushRecent(full, 'new');
    expect(next).toHaveLength(RECENTS_CAP);
    expect(next[0]).toBe('new');
    expect(next).not.toContain(`k${RECENTS_CAP - 1}`);
  });
});
