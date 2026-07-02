// Pure client-side mirror of the service's profile-name-uniqueness rule
// (case-insensitive, trimmed). Kept free of React so it is unit-testable; the
// server call remains the authoritative check (profile_name_taken on 409).

import type { ProfileEntry } from '../api/profiles';

/**
 * True when the trimmed, case-folded `name` collides with an existing
 * profile's name other than `excludeId` - the profile being renamed keeps its
 * own current name as a no-op, matching the server's collision rule.
 */
export function isProfileNameTaken(profiles: ProfileEntry[], name: string, excludeId?: string): boolean {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return false;
  return profiles.some(p => p.id !== excludeId && p.name.trim().toLowerCase() === trimmed);
}
