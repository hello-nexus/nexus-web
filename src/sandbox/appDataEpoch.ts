// Page-wide app-data epoch: advances on every `app-data-reset` broadcast.

/** Broadcast after a profile switch or a restore into the active profile: `{ profileId, resetId }`. */
export const APP_DATA_RESET_TOPIC = 'app-data-reset';

// The last reset seen on this page. Every app-data worker is keyed on it, so a
// reset respawns them all against the newly active profile's documents.
let appDataEpoch = '';
const epochListeners = new Set<() => void>();

export function noteAppDataReset(resetId: unknown): void {
  if (typeof resetId !== 'string' || resetId === '' || resetId === appDataEpoch) return;
  appDataEpoch = resetId;
  for (const l of [...epochListeners]) l();
}

export function subscribeAppDataEpoch(listener: () => void): () => void {
  epochListeners.add(listener);
  return () => { epochListeners.delete(listener); };
}

export function getAppDataEpoch(): string {
  return appDataEpoch;
}
