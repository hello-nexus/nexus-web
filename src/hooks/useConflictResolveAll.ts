import { useCallback, useMemo, useRef, useState } from 'react';
import { killConflict } from '../api/conflicts';
import type { ConflictAutostartMap } from './useConflictAutostart';
import type { ConflictRosterEntry } from './useConflictRoster';

export interface ConflictResolveAllState {
  /** Something is still running or still starts at boot. */
  pending: boolean;
  resolving: boolean;
  /** Ends every listed app still running and turns off every listed boot entry. Resolves true only when nothing survived. */
  resolveAll: () => Promise<boolean>;
}

/**
 * One-click version of working down the conflict list: the same per-app kill
 * and autostart calls the row buttons make, over every row at once. Rows
 * report through the roster (terminated) and the autostart map (entries gone),
 * so the cards need no extra state to show the outcome.
 */
export function useConflictResolveAll(
  entries: readonly ConflictRosterEntry[],
  markTerminated: (id: string) => void,
  autostartByApp: ConflictAutostartMap,
  disableAutostart: (id: string) => Promise<boolean>,
): ConflictResolveAllState {
  const [resolving, setResolving] = useState(false);
  // Guards re-entry across the await; the state flag alone lags a render.
  const resolvingRef = useRef(false);

  const running = useMemo(() => entries.filter(e => !e.terminated), [entries]);
  const autostarting = useMemo(
    () => entries.filter(e => (autostartByApp.get(e.conflict.id)?.length ?? 0) > 0),
    [entries, autostartByApp],
  );
  const pending = running.length > 0 || autostarting.length > 0;

  const resolveAll = useCallback(async () => {
    if (resolvingRef.current) return false;
    resolvingRef.current = true;
    setResolving(true);
    try {
      const kills = running.map(async e => {
        const res = await killConflict(e.conflict.id).catch(() => null);
        if (!res?.killed) return false;
        markTerminated(e.conflict.id);
        return true;
      });
      const disables = autostarting.map(e => disableAutostart(e.conflict.id).catch(() => false));
      const outcomes = await Promise.all([...kills, ...disables]);
      return outcomes.every(Boolean);
    } finally {
      resolvingRef.current = false;
      setResolving(false);
    }
  }, [running, autostarting, markTerminated, disableAutostart]);

  return { pending, resolving, resolveAll };
}
