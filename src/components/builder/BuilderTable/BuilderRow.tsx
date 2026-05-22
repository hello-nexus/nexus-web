import { useCallback, useRef, useState } from 'react';
import {
  Cpu, CircuitBoard, MemoryStick, MonitorPlay, HardDrive, Zap, Thermometer, Box,
  X, Settings,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { ComponentCategory, BuildSlotEntry, ComponentOption } from '../../../types/builder';
import { CATEGORY_LABELS } from '../../../types/builder';
import { useTranslation } from '../../../lib/i18n';
import { useClickOutside } from '../../../hooks/useClickOutside';
import { HoverTooltip } from '../../common/HoverTooltip/HoverTooltip';
import { getKeySpecs, resolveBuyUrl } from './builderRowHelpers';
import styles from './BuilderTable.module.scss';

const CATEGORY_ICONS: Record<ComponentCategory, ReactNode> = {
  cpu: <Cpu size={16} />,
  motherboard: <CircuitBoard size={16} />,
  ram: <MemoryStick size={16} />,
  gpu: <MonitorPlay size={16} />,
  storage: <HardDrive size={16} />,
  psu: <Zap size={16} />,
  cooler: <Thermometer size={16} />,
  case: <Box size={16} />,
  monitor: <MonitorPlay size={16} />,
};

interface BuilderRowProps {
  category: ComponentCategory;
  entry: BuildSlotEntry;
  onChoose: () => void;
  onRemove: () => void;
  isOwned: boolean;
  onToggleOwned: () => void;
  onViewDetail: (component: ComponentOption) => void;
}

function formatPrice(price: number | null | undefined): string {
  if (price == null) return '';
  return `$${price.toFixed(2)}`;
}

export function BuilderRow({ category, entry, onChoose, onRemove, isOwned, onToggleOwned, onViewDetail }: BuilderRowProps) {
  const { t } = useTranslation();
  const icon = CATEGORY_ICONS[category];
  const label = CATEGORY_LABELS[category];
  const selection = entry.selection;
  const hasSelection = selection != null;
  const buyUrl = selection ? resolveBuyUrl(selection, entry.selectedRetailer) : null;
  // Portal product page route: /builder/component/<normalizedKey|id>. Built
  // here so the <a> has a real href (so cmd+click opens in a new tab and
  // right-click "Copy link" copies a useful URL), with an onClick that
  // intercepts plain clicks to push history + render in-app.
  const productHref = selection ? `/builder/component/${encodeURIComponent(selection.normalizedKey || selection.id)}` : null;
  const keySpecs = selection ? getKeySpecs(category, selection) : [];

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useClickOutside(menuRef, () => setMenuOpen(false), menuOpen);
  const closeMenuAfter = useCallback((fn: () => void) => () => { fn(); setMenuOpen(false); }, []);

  return (
    <div className={styles.row}>
      <div className={styles.cellComponent}>
        <span className={styles.rowIcon}>{icon}</span>
        <span className={styles.rowLabel}>{label}</span>
      </div>

      <div className={styles.cellName}>
        {hasSelection ? (
          productHref ? (
            <HoverTooltip body={t('builder.openProductPage')} side="top">
              <a
                href={productHref}
                className={styles.componentNameLink}
                onClick={e => {
                  // Let cmd/ctrl/middle/shift-click fall through to the browser
                  // so users can open the product page in a new tab. Plain left
                  // click: take over and navigate in-app via the router.
                  if (e.defaultPrevented) return;
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                  e.preventDefault();
                  onViewDetail(selection!);
                }}
              >
                <span className={styles.componentNameText}>{selection!.title}</span>
              </a>
            </HoverTooltip>
          ) : (
            <span className={styles.componentName}>{selection!.title}</span>
          )
        ) : (
          <button type="button" className={styles.placeholderBtn} onClick={onChoose}>
            {t('builder.choose')} {label}
          </button>
        )}
      </div>

      <div className={styles.cellSpecs}>
        {keySpecs.map(s => (
          <span key={s.label + s.value} className={styles.specItem}>{s.value}</span>
        ))}
      </div>

      <div className={styles.cellPrice}>
        {hasSelection && !isOwned && selection!.bestPrice != null && (
          buyUrl ? (
            <HoverTooltip body={t('builder.buy')} side="top">
              <a
                href={buyUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={styles.componentPriceLink}
              >
                {formatPrice(selection!.bestPrice)}
              </a>
            </HoverTooltip>
          ) : (
            <span className={styles.componentPrice}>{formatPrice(selection!.bestPrice)}</span>
          )
        )}
        {isOwned && <span className={styles.ownedBadge}>{t('builder.owned')}</span>}
      </div>

      <div className={styles.cellActions}>
        {hasSelection && buyUrl && (
          <a
            href={buyUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.buyBtn}
          >
            {t('builder.buy')}
          </a>
        )}

        {hasSelection && (
          <div ref={menuRef} className={styles.gearWrap}>
            <HoverTooltip body={t('builder.rowOptions')} side="top">
              <button
                type="button"
                className={`${styles.iconBtn} ${menuOpen ? styles.iconBtnActive : ''}`}
                onClick={() => setMenuOpen(o => !o)}
                aria-label={t('builder.rowOptions')}
                aria-expanded={menuOpen}
              >
                <Settings size={14} />
              </button>
            </HoverTooltip>
            {menuOpen && (
              <div className={styles.gearMenu} role="menu">
                <label className={styles.gearMenuToggle} role="menuitem">
                  <input
                    type="checkbox"
                    checked={isOwned}
                    onChange={closeMenuAfter(onToggleOwned)}
                  />
                  <span>{t('builder.markOwned')}</span>
                </label>
              </div>
            )}
          </div>
        )}

        {hasSelection && (
          <HoverTooltip body={t('builder.remove')} side="top">
            <button
              type="button"
              className={styles.iconBtn}
              onClick={onRemove}
              aria-label={t('builder.remove')}
            >
              <X size={14} />
            </button>
          </HoverTooltip>
        )}
      </div>
    </div>
  );
}
