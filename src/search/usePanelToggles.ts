import { useEffect, useState } from 'react';
import { fetchPanelRemoteControlState, fetchPanelRelay, fetchPanelPairBroadcast } from '../api/panel';

export interface PanelToggleState {
  remoteEnabled: boolean;
  relayEnabled: boolean;
  wifiEnabled: boolean;
}

const OFF: PanelToggleState = { remoteEnabled: false, relayEnabled: false, wifiEnabled: false };

/**
 * Live on/off state of the remote-access toggles (remote control, cloud relay,
 * Wi-Fi pair broadcast), fetched when `enabled` flips true. Lets the search show
 * each as a single toggle that reflects + flips the current state.
 */
export function usePanelToggles(enabled: boolean): PanelToggleState {
  const [state, setState] = useState<PanelToggleState>(OFF);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void Promise.all([
      fetchPanelRemoteControlState().catch(() => null),
      fetchPanelRelay().catch(() => null),
      fetchPanelPairBroadcast().catch(() => null),
    ]).then(([remote, relay, broadcast]) => {
      if (cancelled) return;
      setState({
        remoteEnabled: !!remote?.enabled,
        relayEnabled: !!relay?.enabled,
        wifiEnabled: !!broadcast && broadcast.mode !== 'never',
      });
    });
    return () => { cancelled = true; };
  }, [enabled]);
  return state;
}
