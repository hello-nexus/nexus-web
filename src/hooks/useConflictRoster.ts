import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DetectedConflict } from '../api/conflicts';

export interface ConflictRosterEntry {
  conflict: DetectedConflict;
  /** The app was running when this surface opened and is not running now. */
  terminated: boolean;
}

export interface ConflictRosterState {
  entries: ConflictRosterEntry[];
  /** Every conflict in the roster, running or not - the device join keys off this so an ended app keeps its device list. */
  conflicts: DetectedConflict[];
  /** Marks an app ended before the watcher's next scan reports it gone. */
  markTerminated: (id: string) => void;
}

/**
 * Sticky view of the detected apps for a surface that stays open: an app that
 * ends keeps its row, marked terminated, instead of vanishing mid-read. Rows
 * are ordered by first appearance and the roster resets when the surface
 * closes, so a later open starts from live state. An app that comes back under
 * a new pid clears its terminated mark.
 *
 * `ready` is the caller's snapshot state (useConflictApps): a list that is
 * empty because the service dropped is not evidence that anything exited, and
 * without this every row would go green "Terminated" on a disconnect, losing
 * the End task button for apps that never died.
 */
export function useConflictRoster(conflicts: readonly DetectedConflict[], active: boolean, ready: boolean): ConflictRosterState {
  const [entries, setEntries] = useState<ConflictRosterEntry[]>([]);
  // Ids the user ended from this surface: terminated immediately, without
  // waiting for the watcher's next scan to drop them from the live list.
  const killedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (active) return;
    killedRef.current = new Set();
    setEntries([]);
  }, [active]);

  useEffect(() => {
    if (!active || !ready) return;
    setEntries(prev => {
      const live = new Map(conflicts.map(c => [c.id, c]));
      const next: ConflictRosterEntry[] = prev.map(entry => {
        const running = live.get(entry.conflict.id);
        if (!running) return { conflict: entry.conflict, terminated: true };
        // A kill the watcher has not scanned yet still reads as running; only a
        // new pid means the app actually came back.
        if (killedRef.current.has(running.id) && running.pid !== entry.conflict.pid) {
          killedRef.current.delete(running.id);
        }
        return { conflict: running, terminated: killedRef.current.has(running.id) };
      });
      const known = new Set(next.map(e => e.conflict.id));
      for (const conflict of conflicts) {
        if (!known.has(conflict.id)) next.push({ conflict, terminated: false });
      }
      return next;
    });
  }, [active, conflicts, ready]);

  const markTerminated = useCallback((id: string) => {
    killedRef.current.add(id);
    setEntries(prev => prev.map(e => (e.conflict.id === id ? { ...e, terminated: true } : e)));
  }, []);

  const rosterConflicts = useMemo(() => entries.map(e => e.conflict), [entries]);

  return { entries, conflicts: rosterConflicts, markTerminated };
}
