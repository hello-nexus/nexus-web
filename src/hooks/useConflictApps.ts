import { useEffect, useState } from 'react';
import { fetchConflicts, type ConflictsFrame, type DetectedConflict } from '../api/conflicts';
import { useTopic } from './useMultiplexSocket';

export interface ConflictAppsState {
  conflicts: DetectedConflict[];
  /**
   * True once the first snapshot (REST seed or WebSocket frame) has arrived.
   * Consumers seed a baseline from real state instead of the pre-load empty
   * list, so apps already running at load are not mistaken for new arrivals.
   * False while disabled or before the first snapshot.
   */
  ready: boolean;
}

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
export function useConflictApps(enabled: boolean): ConflictAppsState {
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
      // A failed read leaves the seed null, so `ready` stays false rather than
      // reporting an empty list a caller would read as "none detected".
      if (!cancelled && list) setSeed(list);
    });
    return () => { cancelled = true; };
  }, [enabled]);

  if (!enabled) return NOT_READY;
  // Prefer the live WebSocket frame; fall back to the REST seed until the
  // first frame arrives. A loaded-but-empty seed ([]) still counts as ready.
  if (frame) return { conflicts: frame.conflicts ?? EMPTY, ready: true };
  if (seed) return { conflicts: seed, ready: true };
  return NOT_READY;
}

const EMPTY: DetectedConflict[] = [];
const NOT_READY: ConflictAppsState = { conflicts: EMPTY, ready: false };
