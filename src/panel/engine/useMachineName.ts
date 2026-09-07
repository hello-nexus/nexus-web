import { useCallback, useEffect, useState } from 'react';
import type { PanelSurface } from '../types';
import { pingService } from '../../api/service';
import { setPanelHostName } from '../../api/panel';

// Host PC display name in the tray. The service status poll keeps it fresh;
// a phone seeds it with one ping on mount, before that poll has answered.
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
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [phoneSeed]);
  useEffect(() => {
    const next = serviceStatusPingMachineName?.trim();
    if (next) setMachineName(next);
  }, [serviceStatusPingMachineName]);
  const onMachineNameCommit = useCallback((next: string) => {
    // Optimistic; the next ping overwrites with the server's normalised value
    // (trim, dedup whitespace, OS-name fallback if cleared).
    setMachineName(next);
    setPanelHostName(next).then(res => {
      if (res?.machineName) setMachineName(res.machineName);
    }).catch(() => {});
  }, []);
  return { machineName, onMachineNameCommit };
}
