import { useTranslation } from '../../../../lib/i18n';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { CollapsibleSection } from '../../../../components/common/CollapsibleSection/CollapsibleSection';
import {
  PALETTE_FAMILIES, PALETTE_SHADE_ROWS, paletteFamilyKey, type PaletteColor,
} from '../../../../types/lightingPalette';
import styles from '../LightingPage.module.scss';

/**
 * Static-mode colour picker: the whole palette as swatches, hues across and
 * each hue's light-to-dark run down its column. A colour is the entire
 * selection - there is nothing to tune afterwards, so no controls follow it.
 */
export function StaticPalette({ selectedId, open, onToggle, onSelect, hero }: {
  /** Palette id the selected devices wear, if they agree on one. */
  selectedId?: string | null;
  /** Collapsible chrome; omitted in hero mode, where the palette is the page. */
  open?: boolean;
  onToggle?: () => void;
  onSelect: (color: PaletteColor) => void;
  /** Simple mode: the palette on its own, at hero size, with no section header. */
  hero?: boolean;
}) {
  const { t } = useTranslation();
  const grid = (
    <div
      className={`${styles.paletteGrid} ${hero ? styles.paletteGridHero : ''}`}
      style={{ gridTemplateColumns: `repeat(${PALETTE_FAMILIES.length}, minmax(0, 1fr))` }}
    >
      {PALETTE_SHADE_ROWS.flat().map(color => {
        const name = `${t(paletteFamilyKey(color.family))} ${color.shade}`;
        const selected = color.id === selectedId;
        return (
          <HoverTooltip key={color.id} body={name} side="top">
            <button
              type="button"
              data-palette-id={color.id}
              className={`${styles.paletteSwatch} ${selected ? styles.paletteSwatchActive : ''}`}
              style={{ backgroundColor: color.hex }}
              onClick={() => onSelect(color)}
              aria-label={name}
              aria-pressed={selected}
            />
          </HoverTooltip>
        );
      })}
    </div>
  );
  if (hero) return grid;
  return (
    <CollapsibleSection
      compact
      title={t('lighting.palette.title')}
      open={!!open}
      onToggle={onToggle ?? (() => {})}
    >
      {grid}
    </CollapsibleSection>
  );
}
