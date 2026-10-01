import { useCallback, useRef, useState } from 'react';
import { fetchConflicts, type DetectedConflict } from '../api/conflicts';

export interface PendingControlEnable {
  deviceName: string;
  conflict: DetectedConflict;
  enable: () => void;
}

/**
 * Holds a Nexus Control "on" behind NexusControlConflictModal while the device's competing app runs.
 * Checks GET /conflicts at click time, which rescans once the watcher's last scan is past its poll interval.
 * A failed read enables without asking: the service that could not answer is the one the enable goes to.
 */
export function useConflictGuardedEnable() {
  const [pending, setPending] = useState<PendingControlEnable | null>(null);
  const pendingRef = useRef<PendingControlEnable | null>(null);
  // Drops requests while a click-time read is in flight or a prompt is open, so a second click neither repeats the enable nor replaces the prompt.
  const checkingRef = useRef(false);

  const requestEnable = useCallback(async (device: { name: string; conflictAppId?: string }, enable: () => void) => {
    if (!device.conflictAppId) {
      enable();
      return;
    }
    if (checkingRef.current || pendingRef.current) return;
    checkingRef.current = true;
    let running: DetectedConflict | undefined;
    try {
      running = (await fetchConflicts())?.find(c => c.id === device.conflictAppId);
    } finally {
      checkingRef.current = false;
    }
    if (!running) {
      enable();
      return;
    }
    const next = { deviceName: device.name, conflict: running, enable };
    pendingRef.current = next;
    setPending(next);
  }, []);

  const cancel = useCallback(() => {
    pendingRef.current = null;
    setPending(null);
  }, []);

  // Runs the enable at most once per prompt: the kill response and the watcher push dropping the app can both land.
  const confirm = useCallback(() => {
    const current = pendingRef.current;
    if (!current) return;
    cancel();
    current.enable();
  }, [cancel]);

  return { pending, requestEnable, confirm, cancel };
}
