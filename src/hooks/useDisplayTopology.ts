import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDisplayTopology, type DisplayTopology } from '../api/displays';
import { useTopicCallback } from './useMultiplexSocket';

/**
 * OS monitor topology for the Displays page. REST seed + refetch on the
 * `displays` topic (monitor hot-plug, resolution/arrangement changes, and
 * panel promote/demote all broadcast it). Mounts only where the topology is
 * rendered - no app-level subscription.
 */
export function useDisplayTopology(enabled: boolean) {
  const [topology, setTopology] = useState<DisplayTopology | null>(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const data = await fetchDisplayTopology();
    if (!mountedRef.current) return;
    if (data) setTopology(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;
    void refresh();
    return () => {
      mountedRef.current = false;
    };
  }, [enabled, refresh]);

  useTopicCallback('displays', enabled, () => {
    void refresh();
  });

  return { topology, loading, refresh };
}
