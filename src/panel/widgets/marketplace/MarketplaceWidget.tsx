import { useEffect, useState } from 'react';
import { useTranslation } from '../../../lib/i18n';
import type { WidgetProps } from '../types';
import { SdkMarketplaceWidget } from './SdkMarketplaceWidget';
import {
  getMarketplaceListing,
  loadMarketplaceApps,
  marketplaceIdFromType,
  subscribeMarketplaceRegistry,
} from '../../../widgets/marketplaceRegistry';
import styles from './MarketplaceWidget.module.scss';

/**
 * Panel-engine entrypoint for marketplace widgets. Every marketplace widget is
 * an SDK (sandboxed remote-component) widget; this bridges the panel layout's
 * `WidgetProps` to the SDK host.
 */
export function MarketplaceWidget({ widget }: WidgetProps) {
  const { t } = useTranslation();
  const id = marketplaceIdFromType(widget.type) ?? '';
  const [listing, setListing] = useState(() => (id ? getMarketplaceListing(id) : undefined));

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    if (!getMarketplaceListing(id)) {
      void loadMarketplaceApps().then(() => {
        if (!cancelled) setListing(getMarketplaceListing(id));
      });
    }
    const unsub = subscribeMarketplaceRegistry(() => {
      if (!cancelled) setListing(getMarketplaceListing(id));
    });
    return () => { cancelled = true; unsub(); };
  }, [id]);

  if (!listing) {
    return <div className={styles.empty}>{id ? t('marketplace.loading', { name: id }) : t('marketplace.missingId')}</div>;
  }

  return <SdkMarketplaceWidget listing={listing} size={widget.size} instanceId={widget.id} />;
}
