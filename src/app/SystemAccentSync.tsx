import { useEffect, useRef } from 'react';
import { useUiSettings } from '../hooks/useUiSettings';
import { requestSystemAccent, subscribeSystemAccent } from './windowActions';

// When accentSource === 'system', mirror the OS accent into accentColor so it
// bubbles everywhere that reads it: the desktop app, the embedded panel widgets
// (DashboardView passes settings.accentColor as appAccentColor), and the phone
// panels (which sync prefs.theme.accentColor). The native shell pushes the OS
// accent on request + whenever it changes; in a plain browser there's no host,
// so the stored accent simply stays.
export function SystemAccentSync() {
  const { settings, update } = useUiSettings();
  const source = settings.accentSource;
  const systemHex = useRef<string | null>(null);
  // Kept fresh each render so the (resubscribed-on-source) callback compares
  // against the current accent and skips redundant writes.
  const accentRef = useRef(settings.accentColor);
  accentRef.current = settings.accentColor;

  useEffect(() => {
    const unsubscribe = subscribeSystemAccent(hex => {
      systemHex.current = hex;
      if (source === 'system' && hex !== accentRef.current) update({ accentColor: hex });
    });
    requestSystemAccent();
    return unsubscribe;
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
