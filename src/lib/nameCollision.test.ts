// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isNameTaken, type NameCollisionItem } from './nameCollision';

const ITEMS: NameCollisionItem[] = [
  { id: 'a', name: 'Gaming' },
  { id: 'b', name: 'Work ' },
];

describe('isNameTaken', () => {
  it('is false for an empty or whitespace-only name', () => {
    expect(isNameTaken(ITEMS, '')).toBe(false);
    expect(isNameTaken(ITEMS, '   ')).toBe(false);
  });

  it('is false for a name that does not collide', () => {
    expect(isNameTaken(ITEMS, 'Streaming')).toBe(false);
  });

  it('matches case-insensitively', () => {
    expect(isNameTaken(ITEMS, 'gaming')).toBe(true);
    expect(isNameTaken(ITEMS, 'GAMING')).toBe(true);
  });

  it('trims both the candidate and the stored name before comparing', () => {
    expect(isNameTaken(ITEMS, '  Gaming  ')).toBe(true);
    expect(isNameTaken(ITEMS, 'work')).toBe(true);
  });

  it('excludes the given id, so renaming to its own current name is not a collision', () => {
    expect(isNameTaken(ITEMS, 'Gaming', 'a')).toBe(false);
  });

  it('still flags a collision with a DIFFERENT id when excludeId is set', () => {
    expect(isNameTaken(ITEMS, 'Gaming', 'b')).toBe(true);
  });
});
