import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchIdleDim, setIdleDim, type IdleDimSettings, type IdleDimState } from '../api/lighting';
import { normalizeIdleDim } from '../lib/idleDim';
import { useTopicCallback } from './useMultiplexSocket';

export interface IdleDimHookState {
  /** Null until the first fetch resolves. */
  state: IdleDimState | null;
  /** Persist new settings. Optimistic: the state updates before the POST
   *  answers. A successful POST is followed by a `lighting` topic push that
   *  re-syncs it; a failed one re-fetches here, since no push comes. */
  save: (next: IdleDimSettings) => Promise<void>;
  /** Update the shown settings without persisting (a slider drag). Pushes
   *  are ignored until the next `save`, so they cannot reset the drag. */
  preview: (next: IdleDimSettings) => void;
}

/** The idle-dim settings, kept in sync with the `lighting` topic. */
export function useIdleDim(enabled: boolean): IdleDimHookState {
  const [state, setState] = useState<IdleDimState | null>(null);
  // Bumped by every save and preview: a GET that began before one is stale.
  const seqRef = useRef(0);
  const draggingRef = useRef(false);

  const refresh = useCallback(() => {
    if (draggingRef.current) return;
    const seq = seqRef.current;
    fetchIdleDim().then(data => {
      if (data && seq === seqRef.current) setState(normalizeIdleDim(data));
    }).catch(() => { /* best-effort */ });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh();
  }, [enabled, refresh]);
  useTopicCallback('lighting', enabled, refresh);

  const preview = useCallback((next: IdleDimSettings) => {
    draggingRef.current = true;
    seqRef.current++;
    setState(prev => (prev ? { ...prev, ...next } : prev));
  }, []);

  const save = useCallback(async (next: IdleDimSettings) => {
    draggingRef.current = false;
    seqRef.current++;
    setState(prev => (prev ? { ...prev, ...next } : prev));
    let ok = false;
    try {
      const res = await setIdleDim(next) as { error?: boolean } | null;
      ok = res !== null && !res.error;
    } catch { /* an empty or unreadable body counts as a failed save */ }
    if (!ok) refresh();
  }, [refresh]);

  return { state, save, preview };
}
