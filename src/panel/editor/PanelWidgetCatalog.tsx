import { useEffect, useReducer, useState, type CSSProperties } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { SearchInput } from '../../components/common/SearchInput/SearchInput';
import { useTranslation } from '../../lib/i18n';
import type { PanelSurface, PanelWidgetSize } from '../types';
import { getCatalogEntries, pickerSizeFor, appAvailableForSurface } from '../widgets/registry';
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
  // Inline panel-theme CSS vars (--panel-accent + the --accent family from
  // buildPanelThemeVars). Inside desktop chrome (e.g. the device-management
  // modal) the surrounding stylesheet sets --accent to the desktop's accent;
  // without this prop the search input + previews highlight in the wrong hue.
  themeStyle?: CSSProperties;
  className?: string;
  // Highlight the card matching this widget type. Used by single-widget
  // surfaces (q-series) to mark the device's active widget.
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
  // Force re-render on marketplace registry refresh — the catalog reads a
  // module-level cache React can't observe without an explicit subscription.
  const forceRender = useReducer((r: number) => r + 1, 0)[1];
  const normalised = query.trim().toLowerCase();

  useEffect(() => {
    if (isMarketplaceRegistryStale()) {
      void loadMarketplaceWidgets();
    }
    return subscribeMarketplaceRegistry(forceRender);
  }, [forceRender]);

  // Show built-ins + allowlisted marketplace widgets only. The registry may
  // carry more bundled widgets than the allowlist (already-placed instances
  // still render via lookupApp); the Add-a-Widget picker stays curated.
  const entries = getCatalogEntries().filter(([type, def]) => {
    if (!appAvailableForSurface(def.meta, surface)) return false;
    if (isMarketplaceType(type)) {
      const id = marketplaceIdFromType(type);
      return id !== null && isMarketplaceIdEnabled(id);
    }
    return true;
  });
  // Split built-ins from marketplace for the "MARKETPLACE (BETA)" separator.
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
