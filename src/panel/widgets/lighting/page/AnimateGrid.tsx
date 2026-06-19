import { useEffect, useMemo, useRef, useState } from 'react';
import { Lightbulb, Monitor } from 'lucide-react';
import { useTranslation } from '../../../../lib/i18n';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { CollapsibleSection } from '../../../../components/common/CollapsibleSection/CollapsibleSection';
import {
  EFFECTS, EFFECT_CATEGORIES, categoryOf,
  type EffectCategory, type EffectDef,
} from '../../../../types/lighting';
import { EffectCard } from '../../../../components/common/EffectCard/EffectCard';
import { useEffectThumbnail } from '../../../../hooks/useEffectThumbnail';
import styles from '../LightingPage.module.scss';

function AnimateGridCell({ fx, slot, version, active, live, panel, label, onSelect }: {
  fx: EffectDef;
  slot: number;
  version: string;
  active: boolean;
  live: boolean;
  panel: boolean;
  label: string;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const url = useEffectThumbnail(fx.key, slot, version);
  const hints = [live && t('lighting.badge.liveOnLeds'), panel && t('lighting.badge.usedByPanel')].filter(Boolean) as string[];
  return (
    <EffectCard
      overlay
      dataEffectKey={fx.key}
      label={label}
      thumbUrl={url}
      active={active}
      onClick={onSelect}
      audio={fx.audio}
      cornerBadge={hints.length ? (
        <HoverTooltip title={hints.length > 1 ? hints[0] : undefined} body={hints.length > 1 ? hints[1] : hints[0]} side="top">
          <span className={styles.cellBadges}>
            {live && <Lightbulb aria-hidden={true} />}
            {panel && <Monitor aria-hidden={true} />}
          </span>
        </HoverTooltip>
      ) : undefined}
    />
  );
}

/**
 * Effect picker. Each cell shows the universal thumbnail for the slot this
 * device has selected for that effect (presets are shared, so the same render
 * serves every surface). On panels, the effect currently driving the RGB
 * hardware gets a bulb. Effects are listed in pre-expanded category groups
 * (EFFECT_CATEGORIES order), each under a header in the cooling-panel style.
 */
export function AnimateGrid({ effect, onSelect, effects = EFFECTS, slotFor, versionFor, rgbActiveEffect, panelEffects }: {
  effect: string;
  onSelect: (key: string) => void;
  /** Effect pool to show. Defaults to the full RGB set; panel backgrounds pass
   *  PANEL_BACKGROUND_EFFECTS (no audio-reactive effects). */
  effects?: EffectDef[];
  /** Preset slot to show per effect (this device's selection). Defaults to 0. */
  slotFor?: (key: string) => number;
  /** Content hash of that slot, for cache-busting. Defaults to '0'. */
  versionFor?: (key: string) => string;
  /** Effect currently driving the RGB LEDs - its cell shows a bulb (panels only). */
  rgbActiveEffect?: string | null;
  /** Effects used as a background by ≥1 panel - those cells show a panel icon. */
  panelEffects?: Set<string> | null;
}) {
  const { t } = useTranslation();
  const gridRef = useRef<HTMLDivElement>(null);
  const hasAutoScrolledRef = useRef(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<EffectCategory>>(() => new Set());

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

  // Group by category in section order; categories with no effects in the pool
  // (e.g. audio on panel backgrounds) drop out.
  const groups = useMemo(
    () => EFFECT_CATEGORIES
      .map(cat => ({ cat, items: effects.filter(fx => categoryOf(fx.key) === cat) }))
      .filter(g => g.items.length > 0),
    [effects],
  );

  const toggle = (c: EffectCategory) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(c)) next.delete(c); else next.add(c);
    return next;
  });

  return (
    <div className={styles.animateGridWrap}>
      <div ref={gridRef} className={styles.animateGrid}>
        {groups.map(g => (
          <CollapsibleSection
            key={g.cat}
            compact
            title={t(`lighting.category.${g.cat}`)}
            open={!collapsed.has(g.cat)}
            onToggle={() => toggle(g.cat)}
          >
            <div className={styles.animateGridSection}>
              {g.items.map(fx => (
                <AnimateGridCell
                  key={fx.key}
                  fx={fx}
                  slot={slotFor ? slotFor(fx.key) : 0}
                  version={versionFor ? versionFor(fx.key) : '0'}
                  active={fx.key === effect}
                  live={!!rgbActiveEffect && fx.key === rgbActiveEffect}
                  panel={!!panelEffects && panelEffects.has(fx.key)}
                  label={t(fx.labelKey)}
                  onSelect={() => onSelect(fx.key)}
                />
              ))}
            </div>
          </CollapsibleSection>
        ))}
      </div>
    </div>
  );
}
