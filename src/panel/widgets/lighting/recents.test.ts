import { describe, expect, it } from 'vitest';
import { RECENTS_CAP, parseAnimationRecent, pushRecent, pushRecentAnimation } from './recents';

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

describe('animation recents', () => {
  it('parses a tagged key and treats a bare one as no preset', () => {
    expect(parseAnimationRecent('custom:abc@2')).toEqual({ effect: 'custom:abc', slot: 2 });
    expect(parseAnimationRecent('fire')).toEqual({ effect: 'fire', slot: null });
  });

  it('records effect and preset, deduped on both, replacing a bare older entry', () => {
    expect(pushRecentAnimation(['fire@0', 'plasma@1'], 'fire', 2)).toEqual(['fire@2', 'fire@0', 'plasma@1']);
    expect(pushRecentAnimation(['fire@2', 'plasma@1'], 'plasma', 1)).toEqual(['plasma@1', 'fire@2']);
    expect(pushRecentAnimation(['fire', 'plasma'], 'fire', 2)).toEqual(['fire@2', 'plasma']);
  });
});
