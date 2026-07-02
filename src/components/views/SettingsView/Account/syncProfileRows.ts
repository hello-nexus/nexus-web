import type { SyncProfileStatus, SyncState } from '../../../../api/cloud';

// A profile row's Sync Now spinner clears when the global pass leaves the
// "syncing" state, or when this profile's own lastSyncedAt moves past the
// value it had when the row's sync was started - covering a pass whose
// global state never settles (another profile went dirty mid-pass) even
// though this row's own sync already completed.
export function isProfileSyncSettled(
  state: SyncState,
  baselineLastSyncedAt: string,
  profiles: SyncProfileStatus[],
  profileId: string,
): boolean {
  if (state !== 'syncing') return true;
  const row = profiles.find(p => p.profileId === profileId);
  return row != null && row.lastSyncedAt !== baselineLastSyncedAt;
}
