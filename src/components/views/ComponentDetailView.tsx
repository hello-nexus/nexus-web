import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import classNames from 'classnames';
import { useTranslation } from '../../lib/i18n';
import { CATEGORY_LABELS } from '../../types/builder';
import type { BuilderAction, ComponentCategory, ComponentOption } from '../../types/builder';
import styles from './ComponentDetailView.module.scss';

const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

interface ComponentDetailViewProps {
  componentId: string;
  category?: ComponentCategory;
  dispatch: React.Dispatch<BuilderAction>;
  onBack: () => void;
}

/** Format a spec key from camelCase to readable label. */
function formatSpecKey(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, ch => ch.toUpperCase())
    .trim();
}

/** Format a spec value for display. */
function formatSpecValue(value: unknown): string {
  if (value == null) return '\u2014';
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

export function ComponentDetailView({
  componentId,
  category,
  dispatch,
  onBack,
}: ComponentDetailViewProps) {
  const { t } = useTranslation();
  const [component, setComponent] = useState<ComponentOption | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch on mount + when route params change. setLoading + async fetch +
    // setComponent runs as an effect; can't be a useMemo.
     
    setLoading(true);
    // Try fetching from the specified category, or search all categories
    const cats = category ? [category] : ['cpu', 'gpu', 'motherboard', 'ram', 'storage', 'psu', 'cooler', 'case', 'monitor'];

    (async () => {
      for (const cat of cats) {
        try {
          const res = await fetch(`${API_BASE}/catalog/${cat}/${encodeURIComponent(componentId)}`);
          if (res.ok) {
            const data = await res.json();
            setComponent(data);
            setLoading(false);
            return;
          }
        } catch { /* try next */ }
      }
      setComponent(null);
      setLoading(false);
    })();
  }, [componentId, category]);

  const handleAddToBuild = useCallback(() => {
    if (!component) return;
    const cat = component.specs?.category ?? category;
    if (cat) {
      dispatch({ type: 'SELECT_COMPONENT', category: cat, index: 0, component });
      onBack();
    }
  }, [component, category, dispatch, onBack]);

  if (loading) {
    return (
      <section className={styles.detail}>
        <div className={styles.topBar}>
          <button type="button" className={styles.backBtn} onClick={onBack}>
            <ArrowLeft size={18} />
          </button>
          <span className={styles.backLabel}>{t('common.loading')}</span>
        </div>
      </section>
    );
  }

  if (!component) {
    return (
      <section className={styles.detail}>
        <div className={styles.topBar}>
          <button type="button" className={styles.backBtn} onClick={onBack}>
            <ArrowLeft size={18} />
          </button>
          <span className={styles.backLabel}>{t('builder.no_results')}</span>
        </div>
      </section>
    );
  }

  const categoryLabel = CATEGORY_LABELS[component.specs?.category as ComponentCategory] ?? component.specs?.category ?? '';

  const subtitleParts: string[] = [];
  if (component.specs.socket) subtitleParts.push(String(component.specs.socket));
  if (component.specs.cores) subtitleParts.push(`${component.specs.cores} Cores`);
  if (component.specs.tdp) subtitleParts.push(`${component.specs.tdp}W TDP`);
  if (component.specs.vram) subtitleParts.push(`${component.specs.vram} GB VRAM`);
  if (component.specs.capacity) subtitleParts.push(`${component.specs.capacity} GB`);
  if (component.specs.wattage) subtitleParts.push(`${component.specs.wattage}W`);

  const specEntries = Object.entries(component.specs).filter(
    ([, v]) => v != null && v !== '',
  );

  const retailers = component.retailers ?? [];

  return (
    <section className={styles.detail}>
      {/* Top bar: back + add to build */}
      <div className={styles.topBar}>
        <button type="button" className={styles.backBtn} onClick={onBack}>
          <ArrowLeft size={18} />
        </button>
        <span className={styles.backLabel}>
          {t('builder.back_to_category', { category: categoryLabel })}
        </span>
        <div className={styles.topSpacer} />
        <button type="button" className={styles.addBtn} onClick={handleAddToBuild}>
          {t('builder.add_to_build')}
        </button>
      </div>

      <div className="pageBody">
      {/* Title */}
      <div className={styles.titleBlock}>
        <h1 className={styles.componentTitle}>{component.title}</h1>
        {subtitleParts.length > 0 && (
          <span className={styles.componentSubtitle}>
            {subtitleParts.join(' \u00b7 ')}
          </span>
        )}
      </div>

      {/* Specifications */}
      {specEntries.length > 0 && (
        <div className={styles.section}>
          <h2 className={styles.sectionTitle}>{t('builder.detail.specifications')}</h2>
          <table className={styles.specsTable}>
            <tbody>
              {specEntries.map(([key, value]) => (
                <tr key={key} className={styles.specRow}>
                  <td className={styles.specKey}>{formatSpecKey(key)}</td>
                  <td className={styles.specVal}>{formatSpecValue(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Prices */}
      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>{t('builder.detail.prices')}</h2>
        {retailers.length === 0 ? (
          <div className={styles.noRetailers}>{t('builder.detail.no_retailers')}</div>
        ) : (
          <table className={styles.pricesTable}>
            <tbody>
              {retailers.map(r => {
                const price = r.salePrice ?? r.price;
                return (
                  <tr key={r.slug} className={styles.priceRow}>
                    <td className={styles.priceRetailer}>{r.slug}</td>
                    <td className={styles.priceValue}>
                      {price != null ? `$${price.toFixed(2)}` : '\u2014'}
                    </td>
                    <td className={styles.stockBadge}>
                      <span
                        className={classNames(styles.stockDot, {
                          [styles.inStock]: r.inStock,
                          [styles.outOfStock]: !r.inStock,
                        })}
                      />
                      <span className={styles.stockLabel}>
                        {r.inStock ? t('builder.detail.in_stock') : t('builder.detail.out_of_stock')}
                      </span>
                    </td>
                    <td className={styles.buyCell}>
                      {r.url && r.inStock && (
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className={styles.buyLink}
                        >
                          {t('builder.detail.buy')}
                          <ExternalLink size={12} />
                        </a>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      </div>
    </section>
  );
}
