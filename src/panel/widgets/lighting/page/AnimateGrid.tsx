import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Lightbulb, Monitor } from 'lucide-react';
import { useTranslation } from '../../../../lib/i18n';
import { matchesAllWords } from '../../../../search/match';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { CollapsibleSection } from '../../../../components/common/CollapsibleSection/CollapsibleSection';
import {
  EFFECTS, EFFECT_CATEGORIES, categoryOf,
  type EffectCategory, type EffectDef,
} from '../../../../types/lighting';
import { EffectCard } from '../../../../components/common/EffectCard/EffectCard';
import { useEffectThumbnail } from '../../../../hooks/useEffectThumbnail';
import { useHasMousePointer } from '../../../../lib/pointerKind';
import styles from '../LightingPage.module.scss';

function AnimateGridCell({ fx, slot, version, active, live, panel, pinnedNames, label, hideLabel, gpuAvailable, frozen, onSelect, onEdit, editEnabled, editorOpen, layoutKey }: {
  fx: EffectDef;
  slot: number;
  version: string;
  active: boolean;
  live: boolean;
  panel: boolean;
  /** Names of the devices pinned to this effect. */
  pinnedNames?: readonly string[];
  label: string;
  /** Simple colour swatches drop the on-thumbnail caption. */
  hideLabel?: boolean;
  gpuAvailable?: boolean;
  /** Render the tile at speed 0, matching what Static mode puts on the LEDs. */
  frozen?: boolean;
  onSelect: () => void;
  /** Opens the editor. Its presence keeps the tiles as divs so toggling `editEnabled` never remounts them. */
  onEdit?: () => void;
  /** The selected tile opens the editor (and shows the pencil) instead of re-selecting. */
  editEnabled?: boolean;
  /** The editor is open: the selected tile keeps its pencil, and a click calls `onEdit` again so the owner can close it. */
  editorOpen?: boolean;
  layoutKey?: string;
}) {
  const { t } = useTranslation();
  const noGpu = gpuAvailable === false;
  // A mouse is in use, as for the pencil's CSS reveal. Touch keeps plain re-pick.
  const mouse = useHasMousePointer();
  const editsOnClick = active && (editEnabled || editorOpen) && !!onEdit && mouse;
  const url = useEffectThumbnail(fx.key, slot, version, noGpu, frozen);
  const hints = [live && t('lighting.badge.liveOnLeds'), panel && t('lighting.badge.usedByPanel')].filter(Boolean) as string[];
  return (
    <EffectCard
      overlay
      hideLabel={hideLabel}
      dataEffectKey={fx.key}
      label={label}
      thumbUrl={url}
      thumbStatic={noGpu}
      active={active}
      onClick={editsOnClick ? onEdit : onSelect}
      ariaExpanded={editsOnClick ? !!editorOpen : undefined}
      ariaLabel={editsOnClick && !editorOpen ? t('lighting.effects.editNamed', { name: label }) : undefined}
      // A grid that can edit renders its tiles as divs so toggling edit never remounts them.
      asDiv={!!onEdit}
      noPressedState
      editHint={active && (editEnabled || editorOpen) && !!onEdit}
      layoutKey={layoutKey}
      audio={fx.audio}
      cornerBadge={hints.length || pinnedNames?.length ? (
        <span className={styles.cellBadges}>
          {hints.length > 0 && (
            <HoverTooltip title={hints.length > 1 ? hints[0] : undefined} body={hints.length > 1 ? hints[1] : hints[0]} side="top">
              <span className={styles.cellBadgeGroup}>
                {live && <Lightbulb aria-hidden={true} />}
                {panel && <Monitor aria-hidden={true} />}
              </span>
            </HoverTooltip>
          )}
          {!!pinnedNames?.length && (
            <HoverTooltip
              title={t('lighting.badge.pinnedDevices')}
              body={pinnedNames.map((n, i) => <span key={i} className={styles.cellPinName}>{n}</span>)}
              side="top"
            >
              <span className={styles.cellBadgeGroup} data-testid="effect-pin-badge">
                <span className={styles.cellPinCount}>{pinnedNames.length}</span>
              </span>
            </HoverTooltip>
          )}
        </span>
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
export function AnimateGrid({ effect, onSelect, effects = EFFECTS, query = '', slotFor, versionFor, rgbActiveEffect, panelEffects, pinnedDevices, gpuAvailable, frozen, leading, leadingMatches, onEdit, editEnabled, editorOpen }: {
  effect: string;
  onSelect: (key: string) => void;
  /** Toggles the effect editor (opens it, or closes it when `editorOpen`). Pass a stable callback so the tiles keep one element type. */
  onEdit?: () => void;
  /**
   * True while the editor is closed (`editorOpen` covers the open case) and re-picking the selected tile would be a
   * no-op: the selected tile then shows a hover pencil and a click opens the editor.
   */
  editEnabled?: boolean;
  /** The editor is open: the selected tile keeps its pencil, and a click calls `onEdit` to close it. */
  editorOpen?: boolean;
  /** Rendered above the category groups, inside the same scroll container. */
  leading?: ReactNode;
  /** `leading` shows a search match, so no-matches stays hidden. */
  leadingMatches?: boolean;
  /** Effect pool to show. Defaults to the full RGB set; panel backgrounds pass
   *  their own narrower pool, so categories it drops render no section. */
  effects?: EffectDef[];
  /** Search text; matches an effect's name or category. */
  query?: string;
  /** Preset slot to show per effect (this device's selection). Defaults to 0. */
  slotFor?: (key: string) => number;
  /** Content hash of that slot, for cache-busting. Defaults to '0'. */
  versionFor?: (key: string) => string;
  /** Effect currently driving the RGB LEDs - its cell shows a bulb (panels only). */
  rgbActiveEffect?: string | null;
  /** Effects used as a background by ≥1 panel - those cells show a panel icon. */
  panelEffects?: Set<string> | null;
  /** Names of the devices pinned to each effect: a cell with any shows a pin and the count. */
  pinnedDevices?: ReadonlyMap<string, readonly string[]>;
  /** When false, thumbnail fetches are skipped and a static placeholder is shown. */
  gpuAvailable?: boolean;
  /** Static mode: tiles render frozen so the grid matches the LED output. */
  frozen?: boolean;
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
      .map(cat => ({
        cat,
        items: effects.filter(fx => categoryOf(fx.key) === cat
          && matchesAllWords(query, [t(fx.labelKey), t(`lighting.category.${cat}`)])),
      }))
      .filter(g => g.items.length > 0),
    [effects, query, t],
  );

  const searching = query.trim() !== '';

  const toggle = (c: EffectCategory) => setCollapsed(prev => {
    const next = new Set(prev);
    if (next.has(c)) next.delete(c); else next.add(c);
    return next;
  });

  return (
    <div className={styles.animateGridWrap}>
      <div ref={gridRef} className={styles.animateGrid}>
        {leading}
        {groups.map(g => {
          const cells = g.items.map((fx, i) => (
            <AnimateGridCell
              key={fx.key}
              fx={fx}
              slot={slotFor ? slotFor(fx.key) : 0}
              version={versionFor ? versionFor(fx.key) : '0'}
              active={fx.key === effect}
              live={!!rgbActiveEffect && fx.key === rgbActiveEffect}
              panel={!!panelEffects && panelEffects.has(fx.key)}
              pinnedNames={pinnedDevices?.get(fx.key)}
              label={t(fx.labelKey)}
              hideLabel={g.cat === 'simple'}
              gpuAvailable={gpuAvailable}
              frozen={frozen}
              onSelect={() => onSelect(fx.key)}
              onEdit={onEdit}
              editEnabled={editEnabled}
              editorOpen={editorOpen}
              layoutKey={`${query}|${g.cat}|${i}|${Array.from(collapsed).join()}`}
            />
          ));
          return (
            <CollapsibleSection
              key={g.cat}
              compact
              title={t(`lighting.category.${g.cat}`)}
              open={searching || !collapsed.has(g.cat)}
              onToggle={() => toggle(g.cat)}
            >
              <div data-pick className={`${styles.animateGridSection} ${g.cat === 'simple' ? styles.animateGridSectionSimple : ''}`}>
                {cells}
              </div>
            </CollapsibleSection>
          );
        })}
        {searching && groups.length === 0 && !leadingMatches && <p className={styles.browserHint}>{t('lighting.effects.noMatches')}</p>}
      </div>
    </div>
  );
}
