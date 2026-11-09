import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchDisplays } from '../api/displays';
import { useTopicCallback } from './useMultiplexSocket';

// Monitor DDC/CI can answer minutes after host boot; the host scan retries for about 15 minutes.
export const DDC_PROBE_MS = 12_000;
const DDC_PROBE_TIMEOUT_MS = 20 * 60_000;
// A local edit wins over a re-read for this long, so a drag is not snapped back.
const LOCAL_EDIT_MS = 1500;

/**
 * A DDC display's brightness (0-100): null until the display reports that it
 * can be controlled, probed until it answers. It is read again on the
 * `displays` topic so a change made elsewhere shows up, except right after a
 * local edit. `setValue` is the local state of an edit in progress; the caller
 * writes through the display API.
 */
export function useDdcBrightness(displayId: string | null): { value: number | null; setValue: (v: number) => void } {
  const [value, setValueState] = useState<number | null>(null);
  const editUntilRef = useRef(0);

  const setValue = useCallback((v: number) => {
    editUntilRef.current = Date.now() + LOCAL_EDIT_MS;
    setValueState(v);
  }, []);

  useEffect(() => {
    if (!displayId) return undefined;
    let cancelled = false;
    let timer: number | undefined;
    const deadline = Date.now() + DDC_PROBE_TIMEOUT_MS;
    const probe = () => {
      fetchDisplays().then(list => {
        if (cancelled) return;
        const display = list?.displays.find(d => d.id === displayId);
        if (display?.brightnessControl.supported) {
          setValueState(display.brightnessControl.current ?? 50);
          return;
        }
        if (Date.now() < deadline) timer = window.setTimeout(probe, DDC_PROBE_MS);
      }).catch(() => {
        if (!cancelled && Date.now() < deadline) timer = window.setTimeout(probe, DDC_PROBE_MS);
      });
    };
    probe();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [displayId]);

  const resync = useCallback(() => {
    if (!displayId || Date.now() < editUntilRef.current) return;
    fetchDisplays().then(list => {
      const display = list?.displays.find(d => d.id === displayId);
      if (display?.brightnessControl.supported && Date.now() >= editUntilRef.current) {
        setValueState(display.brightnessControl.current ?? 50);
      }
    }).catch(() => { /* best-effort */ });
  }, [displayId]);
  useTopicCallback('displays', displayId !== null, resync);

  return { value, setValue };
}
