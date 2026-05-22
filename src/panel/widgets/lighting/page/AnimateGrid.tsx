import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchServiceBlob } from '../../../../api/service';
import { useTranslation } from '../../../../lib/i18n';
import {
  EFFECTS, EFFECT_CATEGORIES, categoryOf,
  type EffectCategory,
} from '../../../../types/lighting';
import { EffectCard } from '../../../../components/common/EffectCard/EffectCard';
import styles from '../LightingPage.module.scss';

type Filter = EffectCategory | 'all';
const FILTERS: Filter[] = ['all', ...EFFECT_CATEGORIES];

/**
 * Effect picker. Lazily loads thumbnail BMPs from the service (~6 KB each
 * after AOT render). The active key is highlighted; click selects, which
 * also pulses the right-pane Effect tab in the parent if the user is still
 * looking at the Devices tab. A category chip row above the grid filters
 * to one effect family at a time.
 */
export function AnimateGrid({ effect, onSelect }: {
  effect: string;
  onSelect: (key: string) => void;
}) {
  const { t } = useTranslation();
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<Filter>('all');
  const gridRef = useRef<HTMLDivElement>(null);
  const hasAutoScrolledRef = useRef(false);

  useEffect(() => {
    if (hasAutoScrolledRef.current) return;
    if (!effect) return;
    const container = gridRef.current;
    if (!container) return;
    const card = container.querySelector<HTMLElement>(`[data-effect-key="${effect}"]`);
    if (!card) return;
    const cRect = container.getBoundingClientRect();
    const bRect = card.getBoundingClientRect();
    const margin = 8;
    if (bRect.top < cRect.top) {
      container.scrollTop -= (cRect.top - bRect.top) + margin;
    } else if (bRect.bottom > cRect.bottom) {
      container.scrollTop += (bRect.bottom - cRect.bottom) + margin;
    }
    hasAutoScrolledRef.current = true;
  }, [effect]);

  useEffect(() => {
    let cancelled = false;
    const urls: string[] = [];
    (async () => {
      for (const fx of EFFECTS) {
        const blob = await fetchServiceBlob(`/lighting/effects/${fx.key}/thumbnail.bmp`);
        if (cancelled) return;
        if (blob) {
          const url = URL.createObjectURL(blob);
          urls.push(url);
          setThumbs(prev => ({ ...prev, [fx.key]: url }));
        }
      }
    })();
    return () => {
      cancelled = true;
      urls.forEach(u => URL.revokeObjectURL(u));
    };
  }, []);

  const visible = useMemo(
    () => filter === 'all' ? EFFECTS : EFFECTS.filter(fx => categoryOf(fx.key) === filter),
    [filter],
  );

  return (
    <div className={styles.animateGridWrap}>
      <div className={styles.categoryChips}>
        {FILTERS.map(f => (
          <button
            key={f}
            type="button"
            className={`${styles.categoryChip} ${filter === f ? styles.categoryChipActive : ''}`}
            onClick={() => setFilter(f)}
          >
            {t(`lighting.category.${f}`)}
          </button>
        ))}
      </div>
      <div ref={gridRef} className={styles.animateGrid}>
        {visible.map(fx => (
          <EffectCard
            key={fx.key}
            dataEffectKey={fx.key}
            label={t(fx.labelKey)}
            thumbUrl={thumbs[fx.key] ?? null}
            active={fx.key === effect}
            onClick={() => onSelect(fx.key)}
            audio={fx.audio}
          />
        ))}
      </div>
    </div>
  );
}
