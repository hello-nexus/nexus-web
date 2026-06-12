import { useEffect, useMemo, useRef, useState } from 'react';
import { Lightbulb } from 'lucide-react';
import { useTranslation } from '../../../../lib/i18n';
import {
  EFFECTS, EFFECT_CATEGORIES, categoryOf,
  type EffectCategory, type EffectDef,
} from '../../../../types/lighting';
import { EffectCard } from '../../../../components/common/EffectCard/EffectCard';
import { useEffectThumbnail } from '../../../../hooks/useEffectThumbnail';
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

function AnimateGridCell({ fx, slot, version, active, live, label, onSelect }: {
  fx: EffectDef;
  slot: number;
  version: string;
  active: boolean;
  live: boolean;
  label: string;
  onSelect: () => void;
}) {
  const url = useEffectThumbnail(fx.key, slot, version);
  return (
    <EffectCard
      overlay
      dataEffectKey={fx.key}
      label={label}
      thumbUrl={url}
      active={active}
      onClick={onSelect}
      audio={fx.audio}
      cornerBadge={live ? <span className={styles.cellBulb}><Lightbulb aria-hidden="true" /></span> : undefined}
    />
  );
}

/**
 * Effect picker. Each cell shows the universal thumbnail for the slot this
 * device has selected for that effect (presets are shared, so the same render
 * serves every surface). On panels, the effect currently driving the RGB
 * hardware gets a bulb. A category chip row above the grid filters families.
 */
export function AnimateGrid({ effect, onSelect, effects = EFFECTS, filter: controlledFilter, slotFor, versionFor, rgbActiveEffect }: {
  effect: string;
  onSelect: (key: string) => void;
  /** Effect pool to show. Defaults to the full RGB set; panel backgrounds pass
   *  PANEL_BACKGROUND_EFFECTS (no audio-reactive effects). */
  effects?: EffectDef[];
  /** Controlled category filter. When set, the internal chip row is omitted
   *  and the host renders AnimateCategoryChips itself. */
  filter?: AnimateFilter;
  /** Preset slot to show per effect (this device's selection). Defaults to 0. */
  slotFor?: (key: string) => number;
  /** Content hash of that slot, for cache-busting. Defaults to '0'. */
  versionFor?: (key: string) => string;
  /** Effect currently driving the RGB LEDs — its cell shows a bulb (panels only). */
  rgbActiveEffect?: string | null;
}) {
  const { t } = useTranslation();
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
          <AnimateGridCell
            key={fx.key}
            fx={fx}
            slot={slotFor ? slotFor(fx.key) : 0}
            version={versionFor ? versionFor(fx.key) : '0'}
            active={fx.key === effect}
            live={!!rgbActiveEffect && fx.key === rgbActiveEffect}
            label={t(fx.labelKey)}
            onSelect={() => onSelect(fx.key)}
          />
        ))}
      </div>
    </div>
  );
}
