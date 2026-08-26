import { useRef, useState } from 'react';
import { Pipette } from 'lucide-react';
import { useTranslation } from '../../../../lib/i18n';
import { HoverTooltip } from '../../../../components/common/HoverTooltip/HoverTooltip';
import { CollapsibleSection } from '../../../../components/common/CollapsibleSection/CollapsibleSection';
import { HsvPicker } from '../../../../components/common/HsvPicker/HsvPicker';
import { Popover } from '../../../../components/common/Popover/Popover';
import { contrastTextOn } from '../../../../lib/settings';
import {
  PALETTE_FAMILIES, PALETTE_SHADE_ROWS, paletteFamilyKey, type PaletteColor,
} from '../../../../types/lightingPalette';
import styles from '../LightingPage.module.scss';

const FALLBACK_CUSTOM = '#ff0000';

/**
 * Static-mode colour picker: the whole palette as swatches, hues across and
 * each hue's light-to-dark run down its column. A colour is the entire
 * selection - there is nothing to tune afterwards, so no controls follow it.
 *
 * Advanced mode adds a custom-colour row under the grid (onSelectCustom), for
 * anything the palette's fixed hue/shade steps cannot reach.
 */
export function StaticPalette({
  selectedId, open, onToggle, onSelect, hero, customColor, customSelected, onSelectCustom,
  onPreviewCustom,
}: {
  /** Palette id the selected devices wear, if they agree on one. */
  selectedId?: string | null;
  /** Collapsible chrome; omitted in hero mode, where the palette is the page. */
  open?: boolean;
  onToggle?: () => void;
  onSelect: (color: PaletteColor) => void;
  /** Simple mode: the palette on its own, at hero size, with no section header. */
  hero?: boolean;
  /** Last colour picked from the custom slot; '' leaves it on the hue wheel. */
  customColor?: string;
  /** The selection wears an off-palette colour, so the slot reads as active. */
  customSelected?: boolean;
  /** Omitted (or in hero mode) the custom row is not rendered at all. */
  onSelectCustom?: (hex: string) => void;
  /** Fires per pointer-move; the caller paces its own writes. */
  onPreviewCustom?: (hex: string) => void;
}) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  // Drag preview never reaches the pick record, so the swatch tracks it here.
  const [previewHex, setPreviewHex] = useState<string | null>(null);
  const slotRef = useRef<HTMLDivElement>(null);
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

  const slotColor = previewHex || customColor || '';
  // Opening applies what the slot already shows, so the block selects a colour
  // the way a preset tile does.
  const handleSlotClick = () => {
    const opening = !pickerOpen;
    if (opening && slotColor) onSelectCustom?.(slotColor);
    setPickerOpen(opening);
  };
  const customRow = onSelectCustom ? (
    <div
      className={styles.paletteCustomRow}
      style={{ gridTemplateColumns: `repeat(${PALETTE_FAMILIES.length}, minmax(0, 1fr))` }}
    >
      <div ref={slotRef} className={styles.paletteCustomSlotWrap}>
        <button
          type="button"
          className={`${styles.paletteSwatch} ${styles.paletteCustomSwatch} ${customSelected ? styles.paletteSwatchActive : ''}`}
          // `background`, not `backgroundColor`: the unset slot's hue wheel is a
          // background-IMAGE and would paint straight over a colour set behind it.
          style={slotColor ? { background: slotColor, color: contrastTextOn(slotColor) } : undefined}
          onClick={handleSlotClick}
          aria-label={t('common.customColor')}
          aria-haspopup="dialog"
          aria-expanded={pickerOpen}
          aria-current={!!customSelected}
        >
          <Pipette
            className={`${styles.paletteCustomIcon} ${slotColor ? styles.paletteCustomIconOnFill : ''}`}
            aria-hidden
          />
        </button>
        <Popover
          open={pickerOpen}
          // HsvPicker resets only on pointerup, so a cancelled drag would leave
          // the swatch on a colour the pick record never took.
          onClose={() => { setPickerOpen(false); setPreviewHex(null); }}
          anchorRef={slotRef}
          placement="bottom-start"
          ariaLabel={t('common.customColor')}
          className={styles.paletteCustomPopover}
        >
          <HsvPicker
            value={slotColor || FALLBACK_CUSTOM}
            onPreview={hex => { setPreviewHex(hex); onPreviewCustom?.(hex); }}
            onCommit={hex => { setPreviewHex(null); onSelectCustom(hex); }}
          />
        </Popover>
      </div>
    </div>
  ) : null;

  return (
    <CollapsibleSection
      compact
      title={t('lighting.palette.title')}
      open={!!open}
      onToggle={onToggle ?? (() => {})}
    >
      <div className={styles.paletteBody}>
        {grid}
        {customRow}
      </div>
    </CollapsibleSection>
  );
}
