import { useCallback, useEffect, useState } from 'react';
import { useKioskWatchdog } from './useKioskWatchdog';
import type { PanelSurface } from '../types';
import { pingService } from '../../api/service';
import { setPanelHostName } from '../../api/panel';

// Host PC display name in the tray. Kiosk watchdog (3s ping) keeps it fresh;
// phone (no watchdog) seeds it with one ping on mount.
export function useMachineName(
  kioskBehavior: boolean,
  surface: PanelSurface,
  serviceStatusPingMachineName: string | undefined,
) {
  const [machineName, setMachineName] = useState<string>('');
  const phoneSeed = kioskBehavior && surface === 'phone';
  useEffect(() => {
    if (!phoneSeed) return;
    let cancelled = false;
    pingService().then(res => {
      if (!cancelled && res?.machineName) setMachineName(res.machineName);
    });
    return () => { cancelled = true; };
  }, [phoneSeed]);
  useKioskWatchdog({
    enabled: kioskBehavior && surface !== 'phone',
    onPing: response => {
      if (response.machineName) setMachineName(response.machineName);
    },
  });
  useEffect(() => {
    const next = serviceStatusPingMachineName?.trim();
    if (next) setMachineName(next);
  }, [serviceStatusPingMachineName]);
  const onMachineNameCommit = useCallback((next: string) => {
    // Optimistic update; the next ping overwrites with the server's
    // normalised value (trim, dedup whitespace, OS-name fallback if cleared).
    setMachineName(next);
    setPanelHostName(next).then(res => {
      if (res?.machineName) setMachineName(res.machineName);
    }).catch(() => {});
  }, []);
  return { machineName, onMachineNameCommit };
}
