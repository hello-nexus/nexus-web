import { useEffect } from 'react';
import { setPanelFpsCap } from '../../lib/framePacer';

/** Hands this panel record's frame cap to the draw loops on the page (see lib/framePacer); cleared when the page unmounts. */
export function usePanelFpsCap(cap: number | null | undefined): void {
  useEffect(() => {
    setPanelFpsCap(cap);
    return () => setPanelFpsCap(null);
  }, [cap]);
}
