import { useCallback, useRef } from 'react';
import { pushCustomPick } from '../staticPicks';

/**
 * Paces the per-device colour writes a pointer drag produces: one request in
 * flight, newest wins. Paced by the write landing rather than a timer, so a slow
 * write drops the frames it outran instead of queueing them behind the pointer.
 * The queued entry carries its own target ids - the selection can change before
 * the chain drains.
 */
export function useColorWriteQueue(): (hex: string, ids: string[]) => void {
  const write = useRef<{ inFlight: boolean; queued: { hex: string; ids: string[] } | null }>(
    { inFlight: false, queued: null },
  );
  // Ref-held so the .finally re-entry keeps one stable identity.
  const pumpRef = useRef<() => void>(() => {});
  const pump = useCallback(() => {
    const w = write.current;
    if (w.inFlight || !w.queued) return;
    const { hex, ids } = w.queued;
    w.queued = null;
    w.inFlight = true;
    pushCustomPick(hex, ids).finally(() => {
      w.inFlight = false;
      pumpRef.current();
    });
  }, []);
  pumpRef.current = pump;

  return useCallback((hex: string, ids: string[]) => {
    write.current.queued = { hex, ids };
    pump();
  }, [pump]);
}
