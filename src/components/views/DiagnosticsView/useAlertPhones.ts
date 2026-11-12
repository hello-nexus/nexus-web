import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchSentry } from '../../../api/sentry';
import { onPairPhoneClosed } from '../../../app/pairPhoneRequest';
import { useMultiplex } from '../../../hooks/useMultiplexSocket';

/**
 * Count of phones with push alerts turned on (not the paired total), or null until known or when the read fails.
 * Re-read when the Pair remote dialog closes, when the window regains focus, and when the socket reconnects.
 */
export function useAlertPhones(): number | null {
  const [phones, setPhones] = useState<number | null>(null);
  const aliveRef = useRef(true);
  const read = useCallback(() => {
    fetchSentry()
      .then(state => { if (aliveRef.current) setPhones(state?.alertPhones ?? null); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    read();
    const offClosed = onPairPhoneClosed(read);
    window.addEventListener('focus', read);
    return () => {
      aliveRef.current = false;
      offClosed();
      window.removeEventListener('focus', read);
    };
  }, [read]);

  // Reconnect: edge-detected off `connected`, the same idiom as the other hooks that resync after a drop.
  const connected = useMultiplex()?.connected ?? false;
  const prevConnectedRef = useRef(connected);
  useEffect(() => {
    if (connected && !prevConnectedRef.current) read();
    prevConnectedRef.current = connected;
  }, [connected, read]);

  return phones;
}
