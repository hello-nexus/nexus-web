import { describe, expect, it } from 'vitest';
import type { ProfileEntry } from '../api/profiles';
import { isProfileNameTaken } from './profileNameUtils';

const PROFILES: ProfileEntry[] = [
  { id: 'a', name: 'Gaming', createdAt: '', updatedAt: '' },
  { id: 'b', name: 'Work ', createdAt: '', updatedAt: '' },
];

describe('isProfileNameTaken', () => {
  it('is false for an empty or whitespace-only name', () => {
    expect(isProfileNameTaken(PROFILES, '')).toBe(false);
    expect(isProfileNameTaken(PROFILES, '   ')).toBe(false);
  });

  it('is false for a name that does not collide', () => {
    expect(isProfileNameTaken(PROFILES, 'Streaming')).toBe(false);
  });

  it('matches case-insensitively', () => {
    expect(isProfileNameTaken(PROFILES, 'gaming')).toBe(true);
    expect(isProfileNameTaken(PROFILES, 'GAMING')).toBe(true);
  });

  it('trims both the candidate and the stored name before comparing', () => {
    expect(isProfileNameTaken(PROFILES, '  Gaming  ')).toBe(true);
    expect(isProfileNameTaken(PROFILES, 'work')).toBe(true);
  });

  it('excludes the given profile id, so renaming to its own current name is not a collision', () => {
    expect(isProfileNameTaken(PROFILES, 'Gaming', 'a')).toBe(false);
  });

  it('still flags a collision with a DIFFERENT profile id when excludeId is set', () => {
    expect(isProfileNameTaken(PROFILES, 'Gaming', 'b')).toBe(true);
  });
});
