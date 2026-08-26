import { useEffect, useState } from 'react';
import { fetchConflictAutostart, type ConflictAutostartEntry } from '../api/conflicts';

/**
 * Resolved autostart entry per conflict id, fetched only while `enabled` is
 * true - the lookup walks the registry, so it runs when a user opens a modal
 * rather than on the watcher's poll. Read-only: nothing is removed here.
 */
export function useConflictAutostart(enabled: boolean): Record<string, ConflictAutostartEntry | null> {
  const [byId, setById] = useState<Record<string, ConflictAutostartEntry | null>>({});

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const apps = await fetchConflictAutostart();
      if (cancelled) return;
      const next: Record<string, ConflictAutostartEntry | null> = {};
      for (const app of apps) next[app.id] = app.autostart;
      setById(next);
    })();
    return () => { cancelled = true; };
  }, [enabled]);

  return byId;
}
