import { useEffect, useState } from 'react';
import { fetchConflicts, type ConflictsFrame, type DetectedConflict } from '../api/conflicts';
import { useTopic } from './useMultiplexSocket';

/**
 * Live list of competing third-party apps currently detected by the service.
 *
 * The service rebroadcasts only when the set of detected ids changes, so this
 * hook seeds from a one-shot REST fetch on every offline→online transition,
 * covering the case where the conflict set is unchanged and no push arrives.
 * (Multiplex snapshot providers also cover newly subscribed clients.)
 *
 * Pass enabled=false (e.g. when conflict alerts are hidden via the Settings
 * toggle) to opt out of both the WebSocket subscription and the REST seed.
 */
export function useConflictApps(enabled: boolean): DetectedConflict[] {
  const frame = useTopic<ConflictsFrame>('conflicts', enabled);
  const [seed, setSeed] = useState<DetectedConflict[] | null>(null);

  useEffect(() => {
    if (!enabled) {
      // Clear the seed on disable so a later re-enable starts fresh instead
      // of replaying the last frame.
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
  // Prefer the live WebSocket frame; fall back to the REST seed until the
  // first frame arrives.
  if (frame) return frame.conflicts ?? EMPTY;
  return seed ?? EMPTY;
}

const EMPTY: DetectedConflict[] = [];
