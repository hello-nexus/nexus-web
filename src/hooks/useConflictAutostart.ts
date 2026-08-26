import { useEffect, useState } from 'react';
import { fetchConflictAutostart, type ConflictAutostartEntry } from '../api/conflicts';

/**
 * Resolved autostart entries per conflict id, fetched only while `enabled` is
 * true - the lookup walks the registry, so it runs when a user opens a modal
 * rather than on the watcher's poll. Read-only: nothing is removed here.
 */
export function useConflictAutostart(enabled: boolean): Record<string, ConflictAutostartEntry[]> {
  const [byId, setById] = useState<Record<string, ConflictAutostartEntry[]>>({});

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const apps = await fetchConflictAutostart();
      if (cancelled) return;
      const next: Record<string, ConflictAutostartEntry[]> = {};
      for (const app of apps) next[app.id] = app.entries ?? [];
      setById(next);
    })();
    return () => { cancelled = true; };
  }, [enabled]);

  return byId;
}
