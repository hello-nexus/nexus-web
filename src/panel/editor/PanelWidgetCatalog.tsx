import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { SearchInput } from '../../components/SearchInput/SearchInput';
import { useTranslation } from '../../lib/i18n';
import type { PanelSurface, PanelWidgetSize } from '../types';
import { WIDGET_REGISTRY, pickerSizeFor, widgetAvailableForSurface } from '../widgets/registry';
import { WidgetPreviewCard } from '../widgets/common/WidgetPreviewCard';
import styles from './PanelWidgetCatalog.module.scss';

export interface PanelWidgetCatalogProps {
  surface: PanelSurface;
  onAdd: (type: string, size: PanelWidgetSize) => void;
  draggable?: boolean;
  searchable?: boolean;
  variant?: 'panel-sheet' | 'desktop-popup';
  aspect?: 'natural' | 'square';
  themeMode?: 'dark' | 'light';
  className?: string;
}

export function PanelWidgetCatalog({
  surface,
  onAdd,
  draggable = false,
  searchable = true,
  variant = 'panel-sheet',
  aspect = 'natural',
  themeMode,
  className,
}: PanelWidgetCatalogProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const normalised = query.trim().toLowerCase();

  const entries = Object.entries(WIDGET_REGISTRY).filter(
    ([, def]) => widgetAvailableForSurface(def.meta, surface),
  );
  const visible = normalised
    ? entries.filter(([type, def]) => {
        const label = (t(def.meta.i18nKey) || type).toLowerCase();
        return label.includes(normalised) || type.toLowerCase().includes(normalised);
      })
    : entries;

  const rootClass = [
    'panel-root',
    styles.root,
    variant === 'desktop-popup' ? styles.desktop : '',
    className ?? '',
  ].filter(Boolean).join(' ');

  return (
    <div className={rootClass} data-theme={themeMode}>
      {searchable && (
        <div className={styles.search}>
          <SearchInput
            value={query}
            onChange={setQuery}
            placeholder={t('panel.add.searchPlaceholder')}
            autoFocus={variant === 'desktop-popup'}
          />
        </div>
      )}
      <div className={styles.scroller}>
        <div className={styles.grid}>
          {visible.map(([type, def]) => {
            const label = t(def.meta.i18nKey) || type;
            const size = pickerSizeFor(def.meta, surface);
            return draggable ? (
              <DraggableCatalogCard
                key={type}
                widgetType={type}
                size={size}
                label={label}
                aspect={aspect}
                themeMode={themeMode}
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
                onClick={() => onAdd(type, size)}
              />
            );
          })}
          {visible.length === 0 && (
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
  onAdd,
}: {
  widgetType: string;
  size: PanelWidgetSize;
  label: string;
  aspect: 'natural' | 'square';
  themeMode?: 'dark' | 'light';
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
      dragRef={setNodeRef}
      dragListeners={listeners}
      dragAttributes={attributes}
      isDragging={isDragging}
      onClick={() => onAdd(widgetType, size)}
    />
  );
}
