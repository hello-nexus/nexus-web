import { useEffect, useReducer, useState } from 'react';
import { Slideout } from '../components/common/Slideout/Slideout';
import { SidebarNavButton } from '../components/common/Sidebar/Sidebar';
import { SearchInput } from '../components/common/SearchInput/SearchInput';
import { useTranslation } from '../lib/i18n';
import { DEV_TOOLS } from '../lib/devTools';
import { getCatalogEntries } from '../panel/widgets/registry';
import {
  isMarketplaceRegistryStale,
  loadMarketplaceApps,
  subscribeMarketplaceRegistry,
} from '../widgets/marketplaceRegistry';
import { getSidebarAppMeta } from './sidebarApps';
import { isMacAppShell } from './windowActions';
import styles from './AddSidebarAppSlideout.module.scss';

interface AddSidebarAppSlideoutProps {
  open: boolean;
  onClose: () => void;
  // Keys already pinned to the sidebar. Listed, but dimmed and inert.
  pinnedKeys: readonly string[];
  // Pins the key at the end of the sidebar list. The drawer closes itself.
  onAdd: (key: string) => void;
}

/**
 * Left-docked drawer listing every app that can be pinned to the sidebar.
 * Rows reuse SidebarNavButton, so a row here is the same box the sidebar
 * paints, and the drawer is sized + inset to the sidebar column so the rows
 * land on the sidebar's own x positions while it covers them.
 */
export function AddSidebarAppSlideout({ open, onClose, pinnedKeys, onAdd }: AddSidebarAppSlideoutProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');

  // The marketplace registry is a module-level cache React can't observe;
  // subscribe so an SDK app that finishes loading while the drawer is open
  // shows up. Same pattern as PanelWidgetCatalog.
  const forceRender = useReducer((r: number) => r + 1, 0)[1];
  useEffect(() => {
    if (!open) return;
    if (isMarketplaceRegistryStale()) void loadMarketplaceApps();
    return subscribeMarketplaceRegistry(forceRender);
  }, [open, forceRender]);

  // Clear a stale filter between openings so the list always opens complete.
  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  // Nothing below here is observable while closed (Overlay renders null), and
  // the derivation allocates an element per app - bail before paying for it.
  if (!open) return null;

  // Every app that has a desktop Page is pinnable (see sidebarAppKeys). The
  // `listed` filter is the widget catalog's: an app delisted on beta/prod is
  // resolvable but not browseable, and DEV_TOOLS builds browse everything.
  // Derived per render, not memoised: getCatalogEntries reads a module-level
  // cache that a marketplace load mutates behind React, so a dep array would
  // hold a stale list through exactly the refresh the subscription exists for.
  const entries = getCatalogEntries()
    .flatMap(([key, def]) => {
      if (def.Page == null) return [];
      if (!DEV_TOOLS && def.meta.listed === false) return [];
      const meta = getSidebarAppMeta(key);
      if (!meta) return [];
      return [{ key, label: t(meta.i18nKey), icon: meta.icon }];
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const normalised = query.trim().toLowerCase();
  const visible = normalised
    ? entries.filter(e => e.label.toLowerCase().includes(normalised) || e.key.toLowerCase().includes(normalised))
    : entries;

  const pinned = new Set(pinnedKeys);

  return (
    <Slideout
      open={open}
      onClose={onClose}
      side="left"
      // The drawer docks flush to the window's left edge, where the macOS
      // shell paints the traffic lights over the web content - drop the header
      // below that band so the title and close button aren't under them.
      className={`${styles.sheet}${isMacAppShell() ? ` ${styles.sheetMacApp}` : ''}`}
      title={t('sidebar.addApp')}
    >
      <SearchInput
        className={styles.search}
        value={query}
        onChange={setQuery}
        placeholder={t('sidebar.addApp.search')}
        autoFocus
      />
      <div className={styles.list}>
        {visible.map(entry => (
          <SidebarNavButton
            key={entry.key}
            icon={entry.icon}
            label={entry.label}
            active={false}
            compact={false}
            toggle={false}
            disabled={pinned.has(entry.key)}
            disabledReason={t('sidebar.addApp.added')}
            onClick={() => {
              onAdd(entry.key);
              onClose();
            }}
          />
        ))}
        {visible.length === 0 && <div className={styles.empty}>{t('sidebar.addApp.empty')}</div>}
      </div>
    </Slideout>
  );
}
