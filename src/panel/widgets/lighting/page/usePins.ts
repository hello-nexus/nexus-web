import { useCallback, useRef, useState } from 'react';
import { fetchPins, setPins, type Pin } from '../../../../api/lighting';
import { withPins, type Pins } from '../pins';

const sameJson = (a: Pin | undefined, b: Pin | undefined) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The service's pins plus the optimistic edits made here. A pin write flips the
 * cards at once; if the service refuses it the card goes back to what the
 * service last confirmed.
 *
 * Ordering rules, because writes and refetches race:
 * - A refetch that started before a write began or landed may predate it, so
 *   its answer is dropped (the write's own broadcast triggers a newer one),
 *   as is any answer older than the latest refetch.
 * - Ids with a write in flight keep their local value through a refetch.
 * - A failed write rolls back only when it is the newest write to that id; a
 *   newer write owns the card, and restores the confirmed value itself if it
 *   fails too.
 */
export function usePins(): {
  pins: Pins;
  /** True once the service's pins have landed at least once. */
  loaded: boolean;
  pinsRef: { readonly current: Pins };
  refresh: () => Promise<void>;
  /** Pins `ids` to `pin`, or unpins them for null. `record` false leaves the local copy to the caller. */
  applyPins: (ids: readonly string[], pin: Pin | null, record?: boolean) => Promise<boolean>;
  /** Records locally without telling the service (a drag preview whose write is queued elsewhere). */
  recordPins: (ids: readonly string[], pin: Pin | null) => void;
} {
  const [pins, setLocal] = useState<Pins>({});
  const [loaded, setLoaded] = useState(false);
  const pinsRef = useRef(pins);
  pinsRef.current = pins;
  const pendingRef = useRef(new Map<string, number>());
  // What the service last confirmed, per device.
  const confirmedRef = useRef<Record<string, Pin>>({});
  const refreshSeqRef = useRef(0);
  const writeEpochRef = useRef(0);
  const writeSeqRef = useRef(0);
  const newestWriteRef = useRef(new Map<string, number>());

  const refresh = useCallback(async () => {
    const mine = ++refreshSeqRef.current;
    const epoch = writeEpochRef.current;
    const fetched = await fetchPins();
    if (!fetched || mine !== refreshSeqRef.current || epoch !== writeEpochRef.current) return;
    confirmedRef.current = fetched;
    setLoaded(true);
    setLocal(prev => {
      const next: Record<string, Pin> = { ...fetched };
      for (const id of pendingRef.current.keys()) {
        if (id in prev) next[id] = prev[id]; else delete next[id];
      }
      const keys = Object.keys(next);
      // Same pins: hand back the old object so a lighting frame during a slider
      // drag does not re-render the page.
      return keys.length === Object.keys(prev).length && keys.every(k => sameJson(prev[k], next[k]))
        ? prev
        : next;
    });
  }, []);

  const recordPins = useCallback((ids: readonly string[], pin: Pin | null) => {
    setLocal(prev => withPins(prev, ids, pin));
  }, []);

  const applyPins = useCallback(async (ids: readonly string[], pin: Pin | null, record = true): Promise<boolean> => {
    if (ids.length === 0) return true;
    const seq = ++writeSeqRef.current;
    writeEpochRef.current += 1;
    if (record) setLocal(prev => withPins(prev, ids, pin));
    for (const id of ids) {
      pendingRef.current.set(id, (pendingRef.current.get(id) ?? 0) + 1);
      newestWriteRef.current.set(id, seq);
    }
    let ok = false;
    try {
      ok = await setPins([...ids], pin);
    } catch {
      ok = false;
    }
    writeEpochRef.current += 1;
    for (const id of ids) {
      const left = (pendingRef.current.get(id) ?? 1) - 1;
      if (left > 0) pendingRef.current.set(id, left); else pendingRef.current.delete(id);
    }
    if (ok) {
      const confirmed = { ...confirmedRef.current };
      for (const id of ids) { if (pin) confirmed[id] = pin; else delete confirmed[id]; }
      confirmedRef.current = confirmed;
    } else if (record) {
      const mine = ids.filter(id => newestWriteRef.current.get(id) === seq);
      if (mine.length > 0) {
        setLocal(prev => {
          let next: Pins = prev;
          for (const id of mine) next = withPins(next, [id], confirmedRef.current[id] ?? null);
          return next;
        });
      }
    }
    return ok;
  }, []);

  return { pins, loaded, pinsRef, refresh, applyPins, recordPins };
}
