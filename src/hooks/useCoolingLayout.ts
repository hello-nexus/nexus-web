import { useCallback, useEffect, useRef, useState } from 'react';
import {
  COOLING_LAYOUT_TOPIC, emptyCoolingLayout, fetchCoolingLayout, saveCoolingLayout,
  type CoolingLayout, type CoolingLayoutRecord,
} from '../api/coolingLayout';
import { useTopicCallback } from './useMultiplexSocket';

export interface CoolingLayoutApi {
  /** The layout as shown: local edits apply at once, before the service confirms them. */
  layout: CoolingLayout;
  loaded: boolean;
  /** `mutate` must be a pure transform: it is replayed on the service copy after a 409. */
  edit: (mutate: (layout: CoolingLayout) => CoolingLayout) => void;
}

/** The cooling layout store: edits save in order, a stale revision merges and retries once, `cooling/layout` pings refetch. */
export function useCoolingLayout(active: boolean): CoolingLayoutApi {
  const [record, setRecord] = useState<CoolingLayoutRecord | null>(null);
  const [view, setView] = useState<CoolingLayout>(emptyCoolingLayout);
  const server = useRef<CoolingLayoutRecord | null>(null);
  const pending = useRef(0);
  const chain = useRef<Promise<unknown>>(Promise.resolve());

  const adopt = useCallback((next: CoolingLayoutRecord) => {
    server.current = next;
    setRecord(next);
    setView(next.layout);
  }, []);

  const refetch = useCallback(async () => {
    const next = await fetchCoolingLayout();
    if (next && pending.current === 0) adopt(next);
  }, [adopt]);

  useEffect(() => {
    if (active) void refetch();
  }, [active, refetch]);
  useTopicCallback(COOLING_LAYOUT_TOPIC, active, frame => {
    const rev = (frame as { rev?: unknown } | null)?.rev;
    if (typeof rev === 'number' && rev === server.current?.rev) return;
    void refetch();
  });

  const edit = useCallback((mutate: (layout: CoolingLayout) => CoolingLayout) => {
    if (!server.current) return;
    setView(cur => mutate(cur));
    pending.current++;
    chain.current = chain.current.then(async () => {
      const base = server.current;
      const res = base ? await saveCoolingLayout(base, mutate).catch(() => null) : null;
      if (res && (res.kind === 'saved' || res.kind === 'conflict')) server.current = res.record;
      pending.current--;
      if (pending.current > 0) return;
      if (res && (res.kind === 'saved' || res.kind === 'conflict')) adopt(res.record);
      else await refetch();
    });
  }, [adopt, refetch]);

  return { layout: view, loaded: record !== null, edit };
}
