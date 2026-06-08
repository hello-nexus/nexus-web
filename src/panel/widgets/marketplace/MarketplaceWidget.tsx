import { useEffect, useState } from 'react';
import type { WidgetProps } from '../types';
import { DeclarativeWidget } from '../../../widgets/declarative/DeclarativeWidget';
import { SdkMarketplaceWidget } from './SdkMarketplaceWidget';
import {
  getMarketplaceListing,
  loadMarketplaceWidgets,
  marketplaceIdFromType,
  subscribeMarketplaceRegistry,
} from '../../../widgets/marketplaceRegistry';
import styles from './MarketplaceWidget.module.scss';

/**
 * Panel-engine entrypoint for marketplace widgets. Rendering is
 * delegated to the declarative renderer, which walks the manifest view
 * tree against the host meter palette. This component bridges the panel
 * layout's `WidgetProps` to the renderer's data-driven interface.
 */
export function MarketplaceWidget({ widget }: WidgetProps) {
  const id = marketplaceIdFromType(widget.type) ?? '';
  const [listing, setListing] = useState(() => (id ? getMarketplaceListing(id) : undefined));

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    if (!getMarketplaceListing(id)) {
      void loadMarketplaceWidgets().then(() => {
        if (!cancelled) setListing(getMarketplaceListing(id));
      });
    }
    const unsub = subscribeMarketplaceRegistry(() => {
      if (!cancelled) setListing(getMarketplaceListing(id));
    });
    return () => { cancelled = true; unsub(); };
  }, [id]);

  if (!listing) {
    return <div className={styles.empty}>{id ? `Loading ${id}…` : 'Marketplace widget missing id'}</div>;
  }

  // SDK (sandboxed remote-component) widgets render through the SDK host; the
  // meter-palette renderer handles everything else.
  if (listing.runtime === 'sdk') {
    return (
      <SdkMarketplaceWidget
        listing={listing}
        size={widget.size}
        instanceId={widget.id}
      />
    );
  }

  return (
    <DeclarativeWidget
      listing={listing}
      size={widget.size}
      instanceId={widget.id}
    />
  );
}
