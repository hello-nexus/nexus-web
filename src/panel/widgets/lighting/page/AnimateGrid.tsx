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
export function AnimateGrid({ effect, onSelect, effects = EFFECTS, filter: controlledFilter, versions }: {
  effect: string;
  onSelect: (key: string) => void;
  /** Effect pool to show. Defaults to the full RGB set; panel backgrounds pass
   *  PANEL_BACKGROUND_EFFECTS (no audio-reactive effects). */
  effects?: EffectDef[];
  /** Controlled category filter. When set, the internal chip row is omitted
   *  and the host renders AnimateCategoryChips itself (e.g. in the panel
   *  settings sticky dock). */
  filter?: AnimateFilter;
  /** Per-effect thumbnail cache-bust tokens. When an effect's token changes
   *  (its saved look was edited), only that one thumbnail refetches. */
  versions?: Record<string, string>;
}) {
  const { t } = useTranslation();
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  // The object URL + version each thumb was last fetched at, so a token change
  // refetches just that effect instead of the whole grid.
  const thumbUrlsRef = useRef<Record<string, string>>({});
  const loadedVersionsRef = useRef<Record<string, string>>({});
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
    (async () => {
      for (const fx of effects) {
        // When the host supplies versions, wait for this effect's token before
        // fetching so we don't load the plain thumbnail then immediately refetch.
        if (versions && versions[fx.key] === undefined) continue;
        const want = versions?.[fx.key] ?? '';
        if (loadedVersionsRef.current[fx.key] === want) continue;
        const blob = await fetchServiceBlob(effectThumbnailPath(fx.key, versions?.[fx.key]));
        if (cancelled) return;
        if (!blob) continue;
        const url = URL.createObjectURL(blob);
        const prev = thumbUrlsRef.current[fx.key];
        thumbUrlsRef.current = { ...thumbUrlsRef.current, [fx.key]: url };
        loadedVersionsRef.current = { ...loadedVersionsRef.current, [fx.key]: want };
        setThumbs({ ...thumbUrlsRef.current });
        if (prev) URL.revokeObjectURL(prev);
      }
    })();
    return () => { cancelled = true; };
  }, [effects, versions]);

  // Revoke every object URL on unmount.
  useEffect(() => () => {
    for (const url of Object.values(thumbUrlsRef.current)) URL.revokeObjectURL(url);
    thumbUrlsRef.current = {};
  }, []);

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
