import { useEffect, useReducer } from 'react';
import {
  isMarketplaceRegistryStale,
  loadMarketplaceApps,
  subscribeMarketplaceRegistry,
} from '../../widgets/marketplaceRegistry';

const REFRESH_MS = 5_000;

/**
 * Keeps the installed-app registry loaded for any surface that resolves
 * `app:<id>` placements, and re-renders the caller when it changes. Mount it
 * wherever such a placement is reconciled: a kiosk can reach its first load
 * before its token works, and a registry that never reloads resolves an app
 * installed since to nothing.
 */
export function useMarketplaceRegistryRefresh(): number {
  const [revision, forceRender] = useReducer((r: number) => r + 1, 0);
  useEffect(() => {
    const tick = () => { if (isMarketplaceRegistryStale()) void loadMarketplaceApps(); };
    tick();
    const timer = setInterval(tick, REFRESH_MS);
    const unsubscribe = subscribeMarketplaceRegistry(forceRender);
    return () => { clearInterval(timer); unsubscribe(); };
  }, [forceRender]);
  return revision;
}
