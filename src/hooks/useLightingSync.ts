import { useEffect, useState } from 'react';
import { fetchCurrentSync } from '../api/lighting';
import { subscribeControlSync } from '../lib/controlSync';
import { useTopicCallback } from './useMultiplexSocket';

export type LightingMode = 'animate' | 'screen' | 'gif' | 'none';

/**
 * Fetches the current lighting sync state on mount and returns it.
 * The mode is one of the effect names the service reports via GET /lighting/current.
 *
 * Cross-device updates (e.g. phone changes effect, desktop reflects the change)
 * arrive via the multiplex `lighting` topic - every /lighting/* mutation on
 * the service publishes a frame, this hook refetches on receive. The
 * BroadcastChannel `subscribeControlSync` path stays as the same-browser
 * fast path (zero round trip for editor preview within one tab tree).
 */
export function useLightingSync(enabled: boolean, refreshKey?: string) {
  const [mode, setMode] = useState<LightingMode>('none');
  const [rawSync, setRawSync] = useState('none');
  // False until the first real sync state arrives. Callers gate the active
  // tab indicator on this so the mode tabs stay unhighlighted during load
  // instead of flashing 'none' before /lighting/current returns.
  const [synced, setSynced] = useState(false);

  // refreshKey lets callers (profile switcher) force a re-fetch of the sync
  // state when the active profile changes -- the backend stops the engine on
  // profile switch, so the cached rawSync would otherwise be stale.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const applySync = (sync: string) => {
      setMode(normalizeSync(sync));
      setRawSync(sync);
      setSynced(true);
    };

    const refresh = () => fetchCurrentSync().then(data => {
      if (cancelled) return;
      if (data?.sync) {
        applySync(data.sync);
      }
    });

    refresh();
    const unsubscribe = subscribeControlSync(event => {
      if (event.domain !== 'lighting') return;
      if (event.rawSync) {
        applySync(event.rawSync);
      } else if (event.mode) {
        setMode(event.mode);
        setSynced(true);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [enabled, refreshKey]);

  // Push-driven refresh: every /lighting/* mutation publishes a 'lighting'
  // frame on the multiplex hub. Replaces the prior 1s setInterval poll.
  useTopicCallback('lighting', enabled, () => {
    fetchCurrentSync().then(data => {
      if (data?.sync) {
        setMode(normalizeSync(data.sync));
        setRawSync(data.sync);
        setSynced(true);
      }
    });
  });

  return { mode, setMode, rawSync, setRawSync, synced };
}

function normalizeSync(sync: string): LightingMode {
  if (sync === 'none' || !sync) return 'none';
  if (sync === 'screen' || sync.includes('mirror')) return 'screen';
  if (sync === 'gif' || sync.includes('gif') || sync.includes('media')) return 'gif';
  return 'animate';
}
