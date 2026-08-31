import { useCallback, useEffect, useRef, useState } from 'react';
import {
  createFocusMode, deleteFocusMode, getFocus, reorderFocusModes,
  resetFocusModes, setFocusActive, updateFocusMode,
  type FocusMode, type FocusStatus, type FocusTrigger,
} from '../api/focus';
import { useTopicCallback } from './useMultiplexSocket';

export interface UseFocusResult {
  status: FocusStatus | null;
  activate: (modeId: string) => Promise<void>;
  turnOff: () => Promise<void>;
  addMode: (body: { name: string; icon: string; trigger: FocusTrigger }) => Promise<void>;
  updateMode: (id: string, patch: Partial<Omit<FocusMode, 'id' | 'builtIn'>>) => Promise<void>;
  removeMode: (id: string) => Promise<void>;
  reorder: (modeIds: string[]) => Promise<void>;
  resetModes: () => Promise<void>;
}

/**
 * Live focus-mode status and mode list. The service broadcasts a revision
 * frame on the "focus" topic whenever the active mode or the list changes and
 * the client refetches; there is no poll, so an idle dashboard costs nothing.
 */
export function useFocus(enabled: boolean): UseFocusResult {
  const [status, setStatus] = useState<FocusStatus | null>(null);
  // Every mutation broadcasts, so a refetch is always in flight beside the
  // response to a newer mutation; without a sequence the slower one wins.
  const seqRef = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++seqRef.current;
    const next = await getFocus();
    if (next && seq === seqRef.current) setStatus(next);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    getFocus().then(next => { if (!cancelled && next) setStatus(next); });
    return () => { cancelled = true; };
  }, [enabled]);

  useTopicCallback('focus', enabled, () => { void refresh(); });

  // Every mutation answers with the full status, so the UI never waits on the
  // topic round-trip to show what it just did.
  const apply = useCallback((next: FocusStatus | null) => {
    seqRef.current++;
    if (next) setStatus(next);
  }, []);

  return {
    status,
    activate: useCallback(async (modeId: string) => apply(await setFocusActive(modeId)), [apply]),
    turnOff: useCallback(async () => apply(await setFocusActive(null)), [apply]),
    addMode: useCallback(async body => apply(await createFocusMode(body)), [apply]),
    updateMode: useCallback(async (id, patch) => apply(await updateFocusMode(id, patch)), [apply]),
    removeMode: useCallback(async (id: string) => apply(await deleteFocusMode(id)), [apply]),
    reorder: useCallback(async (ids: string[]) => apply(await reorderFocusModes(ids)), [apply]),
    resetModes: useCallback(async () => apply(await resetFocusModes()), [apply]),
  };
}
