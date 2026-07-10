import { useCallback, useEffect, useRef, useState } from 'react';
import { getStreamDecks, updateStreamDeck, type StreamDeckSummary } from '../api/streamdeck';
import { isRemoteOrigin } from '../api/service';
import { useTopicCallback } from './useMultiplexSocket';

/**
 * Detected + persisted physical Stream Decks. Desktop-only: the caller's
 * `enabled` flag must already be gated to the locally-served desktop
 * dashboard (see the surface check in DeckSettings/StreamDeckDevicePage) -
 * this hook additionally refuses to fetch on a remote/panel origin so a
 * misused call site still can't leak /streamdeck/* traffic off a paired
 * phone or kiosk session.
 */
export function useStreamDecks(enabled: boolean) {
  const active = enabled && !isRemoteOrigin;
  const [decks, setDecks] = useState<StreamDeckSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const mountedRef = useRef(true);

  const refresh = useCallback(async () => {
    const data = await getStreamDecks();
    if (!mountedRef.current) return;
    setDecks(data);
    setLoaded(true);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    if (!active) { setDecks([]); setLoaded(false); return; }
    void refresh();
    return () => { mountedRef.current = false; };
  }, [active, refresh]);

  useTopicCallback('streamdeck', active, () => {
    void refresh();
  });

  const rename = useCallback(async (serial: string, name: string) => {
    setDecks(prev => prev.map(d => (d.serial === serial ? { ...d, name } : d)));
    const ok = await updateStreamDeck(serial, { name });
    if (!ok) await refresh();
    return ok;
  }, [refresh]);

  const setBrightness = useCallback(async (serial: string, brightness: number) => {
    setDecks(prev => prev.map(d => (d.serial === serial ? { ...d, brightness } : d)));
    const ok = await updateStreamDeck(serial, { brightness });
    if (!ok) await refresh();
    return ok;
  }, [refresh]);

  return { decks, loaded, rename, setBrightness, refresh };
}
