import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
import { getGlacialState, GLACIAL_STATE_CHANGED_EVENT, type GlacialState } from '../../../api/asus-glacial-lcd';
import { AsusGlacialLcdDevicePage } from './AsusGlacialLcdDevicePage';
import { PanelDevicePage } from './PanelDevicePage';

const POLL_MS = 3000;

/** The panel page only while Nexus panel mode is offered and chosen; otherwise the native page. */
export function showsGlacialPanelPage(state: GlacialState | null): boolean {
  return state !== null && state.panelModeAvailable === true && state.modeChosen && state.mode === 'panel';
}

export function GlacialPanelRoute(props: ComponentProps<typeof PanelDevicePage>) {
  const [state, setState] = useState<GlacialState | null>(null);
  const aliveRef = useRef(true);
  const seqRef = useRef(0);
  // The capability cannot turn on without a service restart, so an off reading ends the polling.
  const offRef = useRef(false);

  const refresh = useCallback(async () => {
    if (offRef.current) return;
    const seq = ++seqRef.current;
    const next = await getGlacialState();
    if (!aliveRef.current || seq !== seqRef.current || next === null) return;
    if (next.panelModeAvailable !== true) offRef.current = true;
    setState(next);
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, POLL_MS);
    window.addEventListener(GLACIAL_STATE_CHANGED_EVENT, refresh);
    return () => {
      aliveRef.current = false;
      window.clearInterval(id);
      window.removeEventListener(GLACIAL_STATE_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  return showsGlacialPanelPage(state) ? <PanelDevicePage {...props} /> : <AsusGlacialLcdDevicePage />;
}
