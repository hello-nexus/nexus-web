import { useEffect, useMemo, useRef, useState } from 'react';
import { fetchServiceBlob } from '../../../../api/service';
import { effectThumbnailPath } from '../../../../api/lighting';
import { useTranslation } from '../../../../lib/i18n';
import {
  EFFECTS, EFFECT_CATEGORIES, categoryOf,
  type EffectCategory, type EffectDef,
} from '../../../../types/lighting';
import { EffectCard } from '../../../../components/common/EffectCard/EffectCard';
import styles from '../LightingPage.module.scss';

export type AnimateFilter = EffectCategory | 'all';

/**
 * Category chip row. Chips derive from the effect pool, so a category with no
 * effects in it never renders (panel backgrounds exclude audio-reactive
 * effects, dropping the Audio chip).
 */
export function AnimateCategoryChips({ effects = EFFECTS, value, onChange }: {
  effects?: EffectDef[];
  value: AnimateFilter;
  onChange: (filter: AnimateFilter) => void;
}) {
  const { t } = useTranslation();
  const filters = useMemo<AnimateFilter[]>(
    () => ['all', ...EFFECT_CATEGORIES.filter(c => effects.some(fx => categoryOf(fx.key) === c))],
    [effects],
  );
  return (
    <div className={styles.categoryChips}>
      {filters.map(f => (
        <button
          key={f}
          type="button"
          className={`${styles.categoryChip} ${value === f ? styles.categoryChipActive : ''}`}
          onClick={() => onChange(f)}
        >
          {t(`lighting.category.${f}`)}
        </button>
      ))}
    </div>
  );
}

/**
 * Effect picker. Lazily loads thumbnail BMPs from the service (~6 KB
 * each). The active key is highlighted; click selects, and pulses the
 * parent's right-pane Effect tab when the Devices tab is showing. A
 * category chip row above the grid filters to one effect family.
 */
export function AnimateGrid({ effect, onSelect, effects = EFFECTS, filter: controlledFilter }: {
  effect: string;
  onSelect: (key: string) => void;
  /** Effect pool to show. Defaults to the full RGB set; panel backgrounds pass
   *  PANEL_BACKGROUND_EFFECTS (no audio-reactive effects). */
  effects?: EffectDef[];
  /** Controlled category filter. When set, the internal chip row is omitted
   *  and the host renders AnimateCategoryChips itself (e.g. in the panel
   *  settings sticky dock). */
  filter?: AnimateFilter;
}) {
  const { t } = useTranslation();
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [internalFilter, setInternalFilter] = useState<AnimateFilter>('all');
  const filter = controlledFilter ?? internalFilter;
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
      for (const fx of effects) {
        const blob = await fetchServiceBlob(effectThumbnailPath(fx.key));
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
  }, [effects]);

  const visible = useMemo(
    () => filter === 'all' ? effects : effects.filter(fx => categoryOf(fx.key) === filter),
    [filter, effects],
  );

  return (
    <div className={styles.animateGridWrap}>
      {controlledFilter === undefined && (
        <AnimateCategoryChips effects={effects} value={filter} onChange={setInternalFilter} />
      )}
      <div ref={gridRef} className={styles.animateGrid}>
        {visible.map(fx => (
          <EffectCard
            key={fx.key}
            overlay
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
