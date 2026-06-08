// Desktop section view for a page-capable SDK widget. Rendered by
// Dashboard.renderSystemView when the user clicks through a marketplace tile
// whose manifest declares `page: true`. Spawns the SAME bundle's `page` surface
// (a separate worker render via mount({ cell, page })) and fills the section
// content area with its remote tree — e.g. the clock's day/night world map.

import { useCallback, useMemo } from 'react';
import { postService } from '../../../api/service';
import { getMarketplaceListing, marketplaceIdFromType } from '../../../widgets/marketplaceRegistry';
import { SandboxedWidget } from '../../../sandbox/SandboxedWidget';
import { useSdkBundle, useSdkRuntime } from './useSdkBundle';
import styles from './MarketplaceWidget.module.scss';

export interface SdkMarketplacePageProps {
  /** The marketplace widget type, e.g. `marketplace:com.hellonexus.clock.sdk`. */
  type: string;
}

export function SdkMarketplacePage({ type }: SdkMarketplacePageProps) {
  const id = marketplaceIdFromType(type) ?? '';
  const listing = getMarketplaceListing(id);
  const { entryUrl, failed: bundleFailed } = useSdkBundle(id);
  const { runtimeUrl, failed: runtimeFailed } = useSdkRuntime();
  const failed = bundleFailed || runtimeFailed;

  const netFetch = useMemo(() => listing?.capabilities['net.fetch'] ?? [], [listing]);
  const sensorsRead = useMemo(() => listing?.capabilities['sensors.read'] ?? [], [listing]);
  const onDispatch = useCallback(
    (action: string, args?: Record<string, unknown>) =>
      postService<unknown>('/widgets-api/dispatch', { widgetId: id, action, args: args ?? {} }),
    [id],
  );

  if (!listing) return null;

  return (
    <div style={{ display: 'flex', flex: 1, minWidth: 0, minHeight: 0, width: '100%', height: '100%' }}>
      {failed ? (
        <div className={styles.empty}>Failed to load {listing.name}</div>
      ) : !entryUrl || !runtimeUrl ? (
        <div className={styles.empty}>Loading {listing.name}…</div>
      ) : (
        <SandboxedWidget
          runtimeUrl={runtimeUrl}
          entryUrl={entryUrl}
          widgetId={id}
          instanceId={`${id}:page`}
          surface="page"
          settings={{}}
          netFetch={netFetch}
          sensorsRead={sensorsRead}
          onDispatch={onDispatch}
        />
      )}
    </div>
  );
}
