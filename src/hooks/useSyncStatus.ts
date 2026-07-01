import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchCloudSyncStatus, resolveCloudSyncConflict, syncCloudNow,
  type SyncConflict, type SyncState,
} from '../api/cloud';

const POLL_MS = 25_000;

export interface UseSyncStatusResult {
  state: SyncState;
  lastSyncAt: string | null;
  conflicts: SyncConflict[];
  syncNow: () => Promise<void>;
  resolve: (profileId: string, choice: 'local' | 'cloud') => Promise<void>;
  refresh: () => Promise<void>;
}

// Polls /cloud/sync/status while enabled, mirroring useFlashStatus's
// interval-poll shape. resolve() drops the conflict from local state
// immediately so the caller's UI doesn't wait on the next poll tick.
export function useSyncStatus(enabled: boolean): UseSyncStatusResult {
  const [state, setState] = useState<SyncState>('idle');
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);
  const [conflicts, setConflicts] = useState<SyncConflict[]>([]);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const data = await fetchCloudSyncStatus();
    if (data && mountedRef.current) {
      setState(data.state);
      setLastSyncAt(data.lastSyncAt ?? null);
      setConflicts(data.conflicts ?? []);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) {
      // Drop state from the previous session so a signed-out (or switched)
      // account cannot resurface the prior account's conflicts.
      setState('idle');
      setLastSyncAt(null);
      setConflicts([]);
      return;
    }
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, POLL_MS);
    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
    };
  }, [enabled, refresh]);

  const syncNow = useCallback(async () => {
    await syncCloudNow();
    await refresh();
  }, [refresh]);

  const resolve = useCallback(async (profileId: string, choice: 'local' | 'cloud') => {
    setConflicts(prev => prev.filter(c => c.profileId !== profileId));
    await resolveCloudSyncConflict(profileId, choice);
    await refresh();
  }, [refresh]);

  return { state, lastSyncAt, conflicts, syncNow, resolve, refresh };
}
