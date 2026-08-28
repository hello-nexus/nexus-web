import { useTranslation } from '../../../../lib/i18n';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import {
  PALETTE_FAMILIES, PALETTE_SHADE_ROWS, paletteFamilyKey, type PaletteColor,
} from '../../../../types/lightingPalette';
import styles from '../LightingPage.module.scss';

/**
 * Simple mode's colour grid: hues across, each hue's light-to-dark run down its
 * column. A colour is the entire selection - there is nothing to tune
 * afterwards, so no controls follow it. Advanced Static picks from the canvas
 * instead (StaticPickerCanvas), which is why this carries no custom slot.
 */
export function StaticPalette({ selectedId, onSelect }: {
  /** Palette id the selected devices wear, if they agree on one. */
  selectedId?: string | null;
  onSelect: (color: PaletteColor) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className={styles.paletteGrid}
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
}
