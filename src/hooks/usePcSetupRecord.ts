import { useCallback, useEffect, useState } from 'react';
import { fetchPcSetup, PC_SETUP_TOPIC, type PcSetupRecord } from '../api/pcSetup';
import { useTopicCallback } from './useMultiplexSocket';

/** The shared PC setup record, read-only; refetched on the `system/setup` signal. `loaded` is false until the first answer. */
export function usePcSetupRecord(active: boolean): { record: PcSetupRecord | null; loaded: boolean } {
  const [state, setState] = useState<{ record: PcSetupRecord | null; loaded: boolean }>({ record: null, loaded: false });
  const refetch = useCallback(async () => {
    const record = await fetchPcSetup();
    setState(cur => (record ? { record, loaded: true } : { record: cur.record, loaded: true }));
  }, []);
  useEffect(() => {
    if (active) void refetch();
  }, [active, refetch]);
  useTopicCallback(PC_SETUP_TOPIC, active, () => { void refetch(); });
  return state;
}
