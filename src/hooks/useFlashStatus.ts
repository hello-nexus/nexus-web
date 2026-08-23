import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchService, postService } from '../api/service';

export interface FlashStatus {
  active: boolean;
  deviceType: string;   // catalog key being flashed (e.g. "cnvs-left")
  version: string;
  phase: string;        // idle | preparing | entering-dfu | waiting-dfu | downloading | verifying | finalizing | done | failed
  percent: number;
  message: string;
  success: boolean;
  error: string;
}

// Polls the server-side flash status. Because the flash runs entirely in the
// service, this state is global - navigating between tabs and coming back
// resumes the same progress (the component just re-reads it). Also used by the
// Settings shutdown button to block quitting mid-flash.
export function useFlashStatus(enabled: boolean) {
  const [status, setStatus] = useState<FlashStatus | null>(null);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const s = await fetchService<FlashStatus>('/devices/firmware/flash/status');
    if (s && mountedRef.current) setStatus(s);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!enabled) return;
    // Drop the previous run's terminal status before polling: a caller that
    // toggles `enabled` per operation would otherwise read the last run's
    // done/failed on this first commit and treat the new run as finished.
    setStatus(null);
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 1500);
    return () => {
      mountedRef.current = false;
      window.clearInterval(timer);
    };
  }, [enabled, refresh]);

  const startFlash = useCallback(async (deviceType: string, version: string) => {
    await postService('/devices/firmware/flash', { deviceType, version });
    await refresh();
  }, [refresh]);

  return { status, startFlash, refresh };
}
