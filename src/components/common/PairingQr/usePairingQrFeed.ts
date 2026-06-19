import { useCallback, useEffect, useRef, useState } from 'react';
import {
  fetchPanelPhonePairQr,
  fetchPanelPhoneSessions,
  hasNewPairedSession,
  type PanelPhonePairQr,
} from '../../../api/panel';
import { useTopicCallback } from '../../../hooks/useMultiplexSocket';

// QR-feed lifecycle, identical to the Pair-remote panel's QR tab: while
// `active`, mint a single-use QR, re-mint at TTL expiry, and insta-re-mint the
// moment a NEW device pairs - detected off a 3s sessions poll (the same
// mechanism the panel uses; there's no push for a new pairing). The token is
// single-use, so a new authorization means it was just consumed and the
// on-screen QR must roll to a fresh one. Returns the current token + loading;
// the caller owns the countdown clock.
export function usePairingQrFeed(active: boolean): { qr: PanelPhonePairQr | null; loading: boolean } {
  const [qr, setQr] = useState<PanelPhonePairQr | null>(null);
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);
  const prevSessionIds = useRef<ReadonlySet<string> | null>(null);

  const refresh = useCallback(() => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    fetchPanelPhonePairQr()
      .then(next => setQr(next))
      .finally(() => {
        inFlight.current = false;
        setLoading(false);
      });
  }, []);

  // Mint on activate; drop the token and reset the pairing baseline on
  // deactivate so a re-activate never counts existing sessions as "new".
  useEffect(() => {
    if (active) refresh();
    else {
      setQr(null);
      prevSessionIds.current = null;
    }
  }, [active, refresh]);

  // Re-mint immediately when the host IP changes (VPN/Wi-Fi↔wired/DHCP): the
  // current QR embeds the old LAN address, so don't wait out the TTL.
  useTopicCallback('panel/phone/pair-qr/refresh', active, refresh);

  // Re-mint at TTL so the displayed token never goes stale.
  useEffect(() => {
    if (!active || !qr) return;
    const timer = window.setTimeout(refresh, Math.max(1000, qr.expiresAt - Date.now()));
    return () => window.clearTimeout(timer);
  }, [active, qr, refresh]);

  // Insta-re-mint when a new device pairs (the single-use token was consumed).
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const poll = () => {
      void fetchPanelPhoneSessions().then(s => {
        if (cancelled || !s) return;
        const nextIds = new Set(s.sessions.map(x => x.id));
        if (hasNewPairedSession(prevSessionIds.current, nextIds)) refresh();
        prevSessionIds.current = nextIds;
      });
    };
    poll();
    const timer = window.setInterval(poll, 3000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [active, refresh]);

  return { qr, loading };
}
