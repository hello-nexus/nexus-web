import { useEffect, useMemo, useState } from 'react';
import { SyncConflictModal } from '../components/common/SyncConflictModal/SyncConflictModal';
import type { UseSyncStatusResult } from '../hooks/useSyncStatus';
import { useSyncConflictModalOwnedByPage } from './syncConflictModalCoordination';

// Mounted at the layout root (alongside TransferToasts / MappingAppliedToasts)
// so a profile-sync conflict surfaces regardless of the open view. Tracks
// dismissal by the sorted set of conflicting profileIds: closing the modal
// suppresses re-showing THAT set on the next poll tick, but a newly added or
// re-occurring conflict (a different/updated set) reopens it.
export function SyncConflictGate({ sync }: { sync: UseSyncStatusResult }) {
  const conflictKey = useMemo(
    () => sync.conflicts.map(c => c.profileId).sort().join(','),
    [sync.conflicts],
  );
  const [dismissedKey, setDismissedKey] = useState('');

  useEffect(() => {
    if (conflictKey === '') setDismissedKey('');
  }, [conflictKey]);

  // Defer to the Account page's own conflict modal when it is already open,
  // rather than stacking a second SyncConflictModal on top of it.
  const ownedByPage = useSyncConflictModalOwnedByPage();
  const open = conflictKey !== '' && conflictKey !== dismissedKey && !ownedByPage;

  return (
    <SyncConflictModal
      open={open}
      conflicts={sync.conflicts}
      onResolve={sync.resolve}
      onClose={() => setDismissedKey(conflictKey)}
    />
  );
}
