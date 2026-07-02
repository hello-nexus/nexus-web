import type { SyncState } from '../../../../api/cloud';

// The single Sync Now control settles once the triggered pass leaves the
// "syncing" state. Must never depend on any profile's lastSyncedAt: a
// profile with nothing to push never advances its timestamp during a pass,
// which held the spinner forever back when settling was per-row.
export function isSyncPassSettled(state: SyncState): boolean {
  return state !== 'syncing';
}
