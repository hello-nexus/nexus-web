import { useCallback, useEffect, useState } from 'react';
import { fetchIdleDim, setIdleDim, type IdleDimSettings, type IdleDimState } from '../api/lighting';
import { normalizeIdleDim } from '../lib/idleDim';
import { useTopicCallback } from './useMultiplexSocket';

export interface IdleDimHookState {
  /** Null until the first fetch resolves. */
  state: IdleDimState | null;
  /** Persist new settings. Optimistic: the state updates before the POST
   *  answers, and the `lighting` topic push re-syncs it either way. */
  save: (next: IdleDimSettings) => Promise<void>;
  /** Update the shown settings without persisting (a slider drag). */
  preview: (next: IdleDimSettings) => void;
}

/** The idle-dim settings, kept in sync with the `lighting` topic. */
export function useIdleDim(enabled: boolean): IdleDimHookState {
  const [state, setState] = useState<IdleDimState | null>(null);

  const refresh = useCallback(() => {
    fetchIdleDim().then(data => {
      if (data) setState(normalizeIdleDim(data));
    }).catch(() => { /* best-effort */ });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    refresh();
  }, [enabled, refresh]);
  useTopicCallback('lighting', enabled, refresh);

  const preview = useCallback((next: IdleDimSettings) => {
    setState(prev => (prev ? { ...prev, ...next } : prev));
  }, []);

  const save = useCallback(async (next: IdleDimSettings) => {
    preview(next);
    await setIdleDim(next);
  }, [preview]);

  return { state, save, preview };
}
