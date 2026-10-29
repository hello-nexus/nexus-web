import { useEffect, useRef } from 'react';
import { consumeLightingRestart } from '../lib/postRestartRoute';

/** In a window opened after a Fix lighting restart, goes to Lighting once the service first answers. Later reconnects never navigate. */
export function useReturnToLightingAfterRestart(online: boolean, goToLighting: () => void): void {
  const checked = useRef(false);
  useEffect(() => {
    if (!online || checked.current) return;
    checked.current = true;
    if (consumeLightingRestart()) goToLighting();
  }, [online, goToLighting]);
}
