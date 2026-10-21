import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { getGlacialState, GLACIAL_STATE_CHANGED_EVENT, type GlacialState } from '../../../api/asus-glacial-lcd';
import { AsusGlacialLcdDevicePage } from './AsusGlacialLcdDevicePage';
import { PanelDevicePage } from './PanelDevicePage';

const POLL_MS = 3000;

/** The panel page only while Nexus panel mode is offered and chosen; otherwise the native page, whose preview-free layout matches the glass. */
export function showsGlacialPanelPage(state: GlacialState | null): boolean {
  return state !== null && state.panelModeAvailable === true && state.modeChosen && state.mode === 'panel';
}

export function GlacialPanelRoute(props: ComponentProps<typeof PanelDevicePage>) {
  const [state, setState] = useState<GlacialState | null>(null);

  const refresh = useCallback(async () => {
    const next = await getGlacialState();
    if (next !== null) setState(next);
  }, []);

  useEffect(() => {
    void refresh();
    const id = window.setInterval(() => { void refresh(); }, POLL_MS);
    window.addEventListener(GLACIAL_STATE_CHANGED_EVENT, refresh);
    return () => {
      window.clearInterval(id);
      window.removeEventListener(GLACIAL_STATE_CHANGED_EVENT, refresh);
    };
  }, [refresh]);

  return showsGlacialPanelPage(state) ? <PanelDevicePage {...props} /> : <AsusGlacialLcdDevicePage />;
}
