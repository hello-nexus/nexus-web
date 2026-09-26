import { useCallback, useMemo, useRef, useState } from 'react';
import { killConflict } from '../api/conflicts';
import type { ConflictAutostartMap } from './useConflictAutostart';
import type { ConflictRosterEntry } from './useConflictRoster';

const NO_WHITELIST: ReadonlySet<string> = new Set();

export interface ConflictResolveAllState {
  /** Something is still running or still starts at boot. */
  pending: boolean;
  resolving: boolean;
  /** Apps whose boot entries a resolve-all verified off; the card latches its confirmation from this. */
  autostartDisabledIds: ReadonlySet<string>;
  /** Ends every listed app still running and turns off every listed boot entry. Resolves true only when nothing survived. */
  resolveAll: () => Promise<boolean>;
}

/**
 * One-click version of working down the conflict list: the same per-app kill
 * and autostart calls the row buttons make, over every row at once. Kills
 * report through the roster (terminated); disables through
 * `autostartDisabledIds`, because a terminated app drops out of the next
 * autostart read and its row would otherwise lose the confirmation.
 *
 * A whitelisted app is skipped entirely, by both `pending` and `resolveAll`:
 * the user chose to let it keep running, so a one-click resolve must not end
 * it or touch its boot entries.
 */
export function useConflictResolveAll(
  entries: readonly ConflictRosterEntry[],
  markTerminated: (id: string) => void,
  autostartByApp: ConflictAutostartMap,
  disableAutostart: (id: string) => Promise<boolean>,
  whitelistedIds: ReadonlySet<string> = NO_WHITELIST,
): ConflictResolveAllState {
  const [resolving, setResolving] = useState(false);
  const [autostartDisabledIds, setAutostartDisabledIds] = useState<ReadonlySet<string>>(() => new Set());
  // Guards re-entry across the await; the state flag alone lags a render.
  const resolvingRef = useRef(false);

  const running = useMemo(
    () => entries.filter(e => !e.terminated && !whitelistedIds.has(e.conflict.id)),
    [entries, whitelistedIds],
  );
  const autostarting = useMemo(
    () => entries.filter(e => !whitelistedIds.has(e.conflict.id) && (autostartByApp.get(e.conflict.id)?.length ?? 0) > 0),
    [entries, autostartByApp, whitelistedIds],
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
      const disables = autostarting.map(async e => {
        const ok = await disableAutostart(e.conflict.id).catch(() => false);
        if (ok) setAutostartDisabledIds(prev => new Set(prev).add(e.conflict.id));
        return ok;
      });
      const outcomes = await Promise.all([...kills, ...disables]);
      return outcomes.every(Boolean);
    } finally {
      resolvingRef.current = false;
      setResolving(false);
    }
  }, [running, autostarting, markTerminated, disableAutostart]);

  return { pending, resolving, autostartDisabledIds, resolveAll };
}
