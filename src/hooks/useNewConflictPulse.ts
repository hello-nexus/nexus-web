import { useEffect, useRef, useState } from 'react';
import type { DetectedConflict } from '../api/conflicts';

// One flash. Matches the single CSS animation cycle in TopBarStatusButton.
const PULSE_MS = 1000;

/**
 * Returns true for {@link PULSE_MS} whenever a conflicting app that was absent
 * from the previous snapshot appears - i.e. one transitions from not-running
 * to running. The baseline is seeded from the first loaded snapshot (`ready`),
 * so apps already running when the dashboard opens do not pulse; only a genuine
 * new arrival does. The baseline is dropped whenever `ready` is false, so a
 * reconnect re-seeds silently instead of flagging everything as new.
 */
export function useNewConflictPulse(conflicts: readonly DetectedConflict[], ready: boolean): boolean {
  const [pulsing, setPulsing] = useState(false);
  const baseline = useRef<Set<string> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    if (!ready) {
      baseline.current = null;
      return;
    }
    const ids = new Set(conflicts.map(c => c.id));
    const prev = baseline.current;
    baseline.current = ids;
    if (prev === null) return; // first loaded snapshot is the silent baseline

    let appeared = false;
    for (const id of ids) {
      if (!prev.has(id)) { appeared = true; break; }
    }
    if (appeared) {
      setPulsing(true);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setPulsing(false), PULSE_MS);
    }
  }, [conflicts, ready]);

  useEffect(() => () => clearTimeout(timer.current), []);

  return pulsing;
}
