import { useEffect, useReducer, useState, type CSSProperties } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { SearchInput } from '../../components/common/SearchInput/SearchInput';
import { useTranslation } from '../../lib/i18n';
import type { PanelSurface, PanelWidgetSize } from '../types';
import { getCatalogEntries, pickerSizeFor, widgetAvailableForSurface } from '../widgets/registry';
import {
  isMarketplaceIdEnabled,
  isMarketplaceRegistryStale,
  isMarketplaceType,
  loadMarketplaceWidgets,
  marketplaceIdFromType,
  subscribeMarketplaceRegistry,
} from '../../widgets/marketplaceRegistry';
import { WidgetPreviewCard } from '../widgets/common/WidgetPreviewCard';
import styles from './PanelWidgetCatalog.module.scss';

export interface PanelWidgetCatalogProps {
  surface: PanelSurface;
  onAdd: (type: string, size: PanelWidgetSize) => void;
  draggable?: boolean;
  searchable?: boolean;
  variant?: 'panel-sheet' | 'desktop-modal';
  aspect?: 'natural' | 'square';
  themeMode?: 'dark' | 'light';
  // Inline CSS variables driving the panel theme (--panel-accent etc. and
  // the full --accent family from buildPanelThemeVars). When the catalog
  // renders inside the desktop chrome — e.g. the device-management modal —
  // its surrounding stylesheet sets --accent to the desktop's accent, not
  // the device's. Without this prop the search input + widget previews
  // would highlight in the desktop's hue instead of the panel's.
  themeStyle?: CSSProperties;
  className?: string;
  // Highlight the catalog card matching this widget type. Used by
  // single-widget surfaces (q-series) so the user can see which entry
  // is currently the active widget on the device.
  selectedWidgetType?: string;
}

export function PanelWidgetCatalog({
  surface,
  onAdd,
  draggable = false,
  searchable = true,
  variant = 'panel-sheet',
  aspect = 'natural',
  themeMode,
  themeStyle,
  className,
  selectedWidgetType,
}: PanelWidgetCatalogProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  // Force a re-render when the marketplace registry refreshes — the
  // catalog reads from a module-level cache, so React has no way to
  // observe writes without an explicit subscription.
  const forceRender = useReducer((r: number) => r + 1, 0)[1];
  const normalised = query.trim().toLowerCase();

  useEffect(() => {
    if (isMarketplaceRegistryStale()) {
      void loadMarketplaceWidgets();
    }
    return subscribeMarketplaceRegistry(forceRender);
  }, [forceRender]);

  // Filter: only show built-ins + the allowlisted marketplace widgets. The
  // marketplace registry may surface more bundled widgets than this allowlist
  // (so already-placed instances still render via lookupWidget), but the
  // Add-a-Widget picker stays curated while the declarative SDK is in beta.
  const entries = getCatalogEntries().filter(([type, def]) => {
    if (!widgetAvailableForSurface(def.meta, surface)) return false;
    if (isMarketplaceType(type)) {
      const id = marketplaceIdFromType(type);
      return id !== null && isMarketplaceIdEnabled(id);
    }
    return true;
  });
  // Split into built-ins and marketplace so the picker can put a
  // "MARKETPLACE (BETA)" separator between the two groups.
  const builtIns = entries.filter(([type]) => !isMarketplaceType(type));
  const marketplace = entries.filter(([type]) => isMarketplaceType(type));
  const matchesSearch = (type: string, def: { meta: { i18nKey: string } }) => {
    if (!normalised) return true;
    const label = (t(def.meta.i18nKey) || type).toLowerCase();
    return label.includes(normalised) || type.toLowerCase().includes(normalised);
  };
  const visibleBuiltIns = builtIns.filter(([type, def]) => matchesSearch(type, def));
  const visibleMarketplace = marketplace.filter(([type, def]) => matchesSearch(type, def));
  const visibleCount = visibleBuiltIns.length + visibleMarketplace.length;

  const rootClass = [
    'panel-root',
    styles.root,
    variant === 'desktop-modal' ? styles.desktop : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  return (
    <div className={rootClass} data-theme={themeMode} data-surface={surface} style={themeStyle}>
      {searchable && (
        <div className={styles.search}>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t('panel.add.searchPlaceholder')}
            autoFocus={variant === 'desktop-modal'}
          />
        </div>
      )}
      <div className={styles.scroller}>
        <div className={styles.grid}>
          {visibleBuiltIns.map(([type, def]) => {
            const label = t(def.meta.i18nKey) || type;
            const size = pickerSizeFor(def.meta, surface);
            const selected = selectedWidgetType === type;
            return draggable ? (
              <DraggableCatalogCard
                key={type}
                widgetType={type}
                size={size}
                label={label}
                aspect={aspect}
                themeMode={themeMode}
                selected={selected}
                onAdd={onAdd}
              />
            ) : (
              <WidgetPreviewCard
                key={type}
                widgetType={type}
                size={size}
                label={label}
                aspect={aspect}
                themeMode={themeMode}
                selected={selected}
                onClick={() => onAdd(type, size)}
              />
            );
          })}
          {visibleMarketplace.length > 0 && (
            <div className={styles.sectionHeader}>
              <span className={styles.sectionHeaderLabel}>Marketplace</span>
              <span className={styles.sectionHeaderTag}>BETA</span>
            </div>
          )}
          {visibleMarketplace.map(([type, def]) => {
            const label = t(def.meta.i18nKey) || type;
            const size = pickerSizeFor(def.meta, surface);
            const selected = selectedWidgetType === type;
            return draggable ? (
              <DraggableCatalogCard
                key={type}
                widgetType={type}
                size={size}
                label={label}
                aspect={aspect}
                themeMode={themeMode}
                selected={selected}
                onAdd={onAdd}
              />
            ) : (
              <WidgetPreviewCard
                key={type}
                widgetType={type}
                size={size}
                label={label}
                aspect={aspect}
                themeMode={themeMode}
                selected={selected}
                onClick={() => onAdd(type, size)}
              />
            );
          })}
          {visibleCount === 0 && (
            <div className={styles.empty}>
              {t('panel.add.noMatches')}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function DraggableCatalogCard({
  widgetType,
  size,
  label,
  aspect,
  themeMode,
  selected,
  onAdd,
}: {
  widgetType: string;
  size: PanelWidgetSize;
  label: string;
  aspect: 'natural' | 'square';
  themeMode?: 'dark' | 'light';
  selected?: boolean;
  onAdd: (type: string, size: PanelWidgetSize) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `catalog-${widgetType}`,
    data: { type: widgetType, size },
  });

  return (
    <WidgetPreviewCard
      widgetType={widgetType}
      size={size}
      label={label}
      aspect={aspect}
      themeMode={themeMode}
      selected={selected}
      dragRef={setNodeRef}
      dragListeners={listeners}
      dragAttributes={attributes}
      isDragging={isDragging}
      onClick={() => onAdd(widgetType, size)}
    />
  );
}
