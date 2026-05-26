import { useEffect, useState } from 'react';
import { fetchConflicts, type ConflictsFrame, type DetectedConflict } from '../api/conflicts';
import { useTopic } from './useMultiplexSocket';

/**
 * Live list of competing third-party apps currently detected by the service.
 *
 * The service rebroadcasts only when the set of detected ids changes, so this
 * hook seeds from a one-shot REST fetch on every offline→online transition
 * to cover the case where the conflict set has not changed since the last
 * frame the service published and we therefore receive no immediate push.
 * Snapshot providers on the multiplex hub cover newly subscribed clients
 * too, so this fetch is a belt-and-braces fallback for cold starts.
 *
 * Pass <c>enabled=false</c> (e.g. when the user has hidden conflict alerts
 * via the Settings toggle) to opt out of both the WebSocket subscription
 * and the REST seed — keeps the watcher snapshot cheap and avoids
 * triggering reconnects when the service is offline.
 */
export function useConflictApps(enabled: boolean): DetectedConflict[] {
  const frame = useTopic<ConflictsFrame>('conflicts', enabled);
  const [seed, setSeed] = useState<DetectedConflict[] | null>(null);

  useEffect(() => {
    if (!enabled) {
      // Clear the seed when the consumer disables this hook so a later
      // re-enable starts from a clean slate instead of replaying the
      // last frame. External state (the conflicts feed) is what drives
      // the value here, so this is a legitimate external sync.
       
      setSeed(null);
      return;
    }
    let cancelled = false;
    fetchConflicts().then(list => {
      if (!cancelled) setSeed(list);
    });
    return () => { cancelled = true; };
  }, [enabled]);

  if (!enabled) return EMPTY;
  // Prefer the WebSocket frame — it's the live source of truth — but fall
  // back to the REST seed until the first frame arrives.
  if (frame) return frame.conflicts ?? EMPTY;
  return seed ?? EMPTY;
}

const EMPTY: DetectedConflict[] = [];
