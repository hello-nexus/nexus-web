import { useEffect, useSyncExternalStore } from 'react';

// The Account page's own conflict-review modal (opened via its "Review"
// button) and the app-root SyncConflictGate's proactive one both render a
// SyncConflictModal from the same sync state. Without coordination, a
// conflict arriving while the page's modal is already open would pop the
// gate's instance on top of it. The page instance always wins; the gate
// checks this flag and stays closed while it is set.
let pageModalOpen = false;
const listeners = new Set<() => void>();

function setPageModalOpen(open: boolean): void {
  if (pageModalOpen === open) return;
  pageModalOpen = open;
  for (const listener of listeners) listener();
}

/** Publishes whether the Account page's own conflict modal is open, for as long as this is mounted with `open` true. */
export function usePublishPageSyncConflictModalOpen(open: boolean): void {
  useEffect(() => {
    setPageModalOpen(open);
    return () => setPageModalOpen(false);
  }, [open]);
}

/** True while the Account page's own conflict modal is open - the app-root gate should stay closed. */
export function useSyncConflictModalOwnedByPage(): boolean {
  return useSyncExternalStore(
    listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => pageModalOpen,
  );
}
