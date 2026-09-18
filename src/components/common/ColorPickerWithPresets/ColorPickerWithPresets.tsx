import { useRef, useState } from 'react';
import { Pipette } from 'lucide-react';
import { HsvPicker } from '../HsvPicker/HsvPicker';
import { Popover, type PopoverPlacement } from '../Popover/Popover';
import { contrastTextOn } from '../../../lib/settings';
import { useTranslation } from '../../../lib/i18n';
import styles from './ColorPickerWithPresets.module.scss';

// Presets wrap at 10 per row; the custom slot takes the column after them.
const PRESET_COLUMNS = 10;

/**
 * Preset-swatch grid used by every theming surface (app accent, panel accent,
 * panel background). Tiles commit immediately on click.
 *
 * With `allowCustom` a final full-height slot opens an HsvPicker popover for
 * colors outside the preset list. Whenever the current value is off-palette the
 * slot shows that value, so it tracks a drag preview; once a preset is selected
 * the slot falls back to `customColor`, the host's saved pick.
 *
 * onPreview fires per pointer-move inside the popover (live theme application
 * without persistence). Preset tiles and the custom slot are a single-click
 * commit and never preview.
 */
export interface ColorPickerWithPresetsProps {
  value: string;
  presets: readonly string[];
  /** Used when value is empty to determine which preset reads as selected. */
  fallback?: string;
  onPreview?: (hex: string) => void;
  onCommit: (hex: string) => void;
  /** Render the trailing custom-color slot (HsvPicker popover). */
  allowCustom?: boolean;
  /**
   * Saved custom-slot color, shown once a preset is selected. Hosts with
   * nowhere to store it can omit it: picking any color still works, the slot
   * just reverts to the hue wheel after a preset is chosen.
   */
  customColor?: string;
  /** Persist the custom slot. Called alongside onCommit, never on preview. */
  onCustomCommit?: (hex: string) => void;
  /** Greyed out, nothing selected, nothing clickable; the grid keeps its place. */
  disabled?: boolean;
  /** Where the custom-colour popover opens; hosts near the bottom of a sheet open it upward. */
  pickerPlacement?: PopoverPlacement;
  className?: string;
}

export function ColorPickerWithPresets({
  value,
  presets,
  fallback,
  onPreview,
  onCommit,
  allowCustom,
  customColor,
  onCustomCommit,
  disabled = false,
  pickerPlacement = 'bottom-end',
  className,
}: ColorPickerWithPresetsProps) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const slotRef = useRef<HTMLDivElement>(null);

  const normalized = (value || fallback || presets[0] || '#000000').toLowerCase();
  // Disabled shows no selection at all: a highlighted tile would read as a pick.
  const isPreset = !disabled && presets.some(hex => hex.toLowerCase() === normalized);
  // An off-palette value IS the custom color right now, and it lands on preview,
  // a whole gesture before onCustomCommit does.
  const slotColor = (isPreset ? customColor?.toLowerCase() : normalized) || '';

  // Opening applies what the slot already shows, so the slot selects a colour
  // the way a preset tile does instead of only being a door to the picker.
  const handleSlotClick = () => {
    const opening = !pickerOpen;
    if (opening && slotColor && slotColor !== normalized) onCommit(slotColor);
    setPickerOpen(opening);
  };

  // Track the preset count so a short list keeps the slot flush against the
  // palette instead of stranding it past empty columns.
  const presetColumns = Math.min(Math.max(presets.length, 1), PRESET_COLUMNS);
  const presetRows = Math.max(1, Math.ceil(presets.length / PRESET_COLUMNS));
  const columns = presetColumns + (allowCustom ? 1 : 0);

  return (
    <div
      className={`${styles.root} ${className ?? ''}`}
      data-disabled={disabled || undefined}
      aria-disabled={disabled || undefined}
      style={{
        maxWidth: `calc(${columns} * var(--swatch-size-cap) + ${columns - 1} * var(--swatch-gap))`,
      }}
    >
      <div
        className={styles.swatchGrid}
        style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
      >
        {presets.map(hex => {
          const selected = !disabled && hex.toLowerCase() === normalized;
          return (
            <button
              key={hex}
              type="button"
              className={`${styles.swatch} ${selected ? styles.swatchSelected : ''}`}
              style={{ background: hex }}
              disabled={disabled}
              onClick={() => onCommit(hex)}
              aria-label={hex}
              aria-pressed={selected}
            />
          );
        })}
        {allowCustom && (
          <div
            ref={slotRef}
            className={styles.customSlot}
            style={{ gridColumn: columns, gridRow: `1 / span ${presetRows}` }}
          >
            <button
              type="button"
              className={`${styles.swatch} ${styles.customSwatch} ${!disabled && !isPreset ? styles.swatchSelected : ''}`}
              style={slotColor ? { background: slotColor, color: contrastTextOn(slotColor) } : undefined}
              disabled={disabled}
              onClick={handleSlotClick}
              aria-label={t('common.customColor')}
              aria-haspopup="dialog"
              aria-expanded={pickerOpen}
              // Not aria-pressed: this button opens the picker, it does not
              // toggle the selection a press would announce.
              aria-current={!isPreset}
            >
              <Pipette
                className={`${styles.customIcon} ${slotColor ? styles.customIconOnFill : ''}`}
                aria-hidden
              />
            </button>
            <Popover
              open={pickerOpen}
              onClose={() => setPickerOpen(false)}
              anchorRef={slotRef}
              placement={pickerPlacement}
              ariaLabel={t('common.customColor')}
              className={styles.customPopover}
            >
              <HsvPicker
                value={slotColor || normalized}
                onPreview={hex => onPreview?.(hex)}
                onCommit={hex => { onCustomCommit?.(hex); onCommit(hex); }}
              />
            </Popover>
          </div>
        )}
      </div>
    </div>
  );
}
