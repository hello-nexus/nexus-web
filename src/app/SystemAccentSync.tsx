import { useEffect, useRef } from 'react';
import { useUiSettings } from '../hooks/useUiSettings';
import { requestSystemAccent, subscribeSystemAccent } from './windowActions';
import { fetchSystemAccent } from '../api/service';

// When accentSource === 'system', mirror the OS accent into accentColor so it
// bubbles everywhere that reads it: the desktop app, the embedded panel widgets
// (DashboardView passes settings.accentColor as appAccentColor), and the phone
// panels (which sync prefs.theme.accentColor). The Windows/macOS native shell
// pushes the OS accent on request + whenever it changes; with no shell (the
// Linux dashboard is a browser) the service reads the accent from the XDG
// portal and we fetch it instead.
export function SystemAccentSync() {
  const { settings, update } = useUiSettings();
  const source = settings.accentSource;
  const systemHex = useRef<string | null>(null);
  // Kept fresh each render so the (resubscribed-on-source) callback compares
  // against the current accent and skips redundant writes.
  const accentRef = useRef(settings.accentColor);
  accentRef.current = settings.accentColor;

  useEffect(() => {
    const apply = (hex: string) => {
      systemHex.current = hex;
      if (source === 'system' && hex !== accentRef.current) update({ accentColor: hex });
    };
    const unsubscribe = subscribeSystemAccent(apply);
    // A native shell answers the request by pushing through subscribeSystemAccent.
    if (requestSystemAccent()) return unsubscribe;
    // No shell — pull the host OS accent from the service (Linux / browser).
    let cancelled = false;
    void fetchSystemAccent().then(hex => { if (!cancelled && hex) apply(hex); });
    return () => { cancelled = true; unsubscribe(); };
  }, [source, update]);

  // Re-assert the OS accent whenever 'system' is active and the stored accent
  // has drifted from it: when the user flips the source to 'system', and when a
  // profile switch reloads a profile's stored accentColor (frozen at whatever
  // the OS accent was the last time that profile saved). The accentColor dep is
  // what makes this re-run on a switch — without it the reloaded stale hex
  // sticks until the OS accent next changes.
  useEffect(() => {
    if (source === 'system' && systemHex.current && systemHex.current !== settings.accentColor) {
      update({ accentColor: systemHex.current });
    }
  }, [source, settings.accentColor, update]);

  return null;
}
