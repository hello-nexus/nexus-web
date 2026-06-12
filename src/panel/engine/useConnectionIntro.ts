import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';

// On first reaching a live, online connection the panel flashes a "Connected
// to <host>" intro tray, then auto-dismisses it. Suppressed while the user is
// mid-interaction (blocked) and torn down when the connection drops.
const CONNECTION_INTRO_MS = 2700;

export function useConnectionIntro(params: {
  blocked: boolean;
  embedded: boolean;
  loaded: boolean;
  isOffline: boolean;
  online: boolean;
  machineName: string;
  setTrayOpen: Dispatch<SetStateAction<boolean>>;
}) {
  const { blocked, embedded, loaded, isOffline, online, machineName, setTrayOpen } = params;
  const timerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
  const announcedRef = useRef(false);
  const [host, setHost] = useState<string | null>(null);
  const clearConnectionIntro = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setHost(null);
  }, []);
  const startConnectionIntro = useCallback((nextHost: string) => {
    clearConnectionIntro();
    setTrayOpen(false);
    setHost(nextHost);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      setHost(null);
    }, CONNECTION_INTRO_MS);
  }, [clearConnectionIntro, setTrayOpen]);
  useEffect(() => () => clearConnectionIntro(), [clearConnectionIntro]);
  useEffect(() => {
    if (embedded || !loaded || isOffline || !online) return;
    if (announcedRef.current) return;
    const nextHost = machineName.trim();
    if (!nextHost) return;
    announcedRef.current = true;
    if (blocked) return;
    startConnectionIntro(nextHost);
  }, [blocked, embedded, isOffline, loaded, machineName, online, startConnectionIntro]);
  useEffect(() => {
    if (!host || !blocked) return;
    clearConnectionIntro();
  }, [clearConnectionIntro, blocked, host]);
  const resetAnnounced = useCallback(() => { announcedRef.current = false; }, []);
  return { connectionIntroHost: host, clearConnectionIntro, resetAnnounced };
}
