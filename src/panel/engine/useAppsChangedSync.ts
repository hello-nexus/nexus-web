import { APPS_CHANGED_TOPIC } from '../../api/store';
import { useTopicCallback } from '../../hooks/useMultiplexSocket';
import { reloadMarketplaceApps } from '../../widgets/marketplaceRegistry';

/**
 * Re-reads a panel record after the installed-app set changes, reloading the
 * app registry first: a layout normalized against a registry predating the
 * install resolves the new placement to nothing and drops it. A reload that
 * failed skips the refetch for the same reason - the registry still predates
 * the install, and the periodic refresh retries it.
 */
export function useAppsChangedSync(refetch: () => void): void {
  useTopicCallback(APPS_CHANGED_TOPIC, true, () => {
    void reloadMarketplaceApps().then(reloaded => { if (reloaded) refetch(); });
  });
}
