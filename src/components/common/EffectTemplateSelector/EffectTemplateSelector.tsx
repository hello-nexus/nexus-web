import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import { PresetSwatch } from '../PresetSwatch/PresetSwatch';
import styles from './EffectTemplateSelector.module.scss';

export interface EffectTemplateSlot {
  hue: number;
  colorize: number;
  saturation?: number;
  contrast?: number;
}

interface EffectTemplateSelectorProps {
  slots: EffectTemplateSlot[];
  activeIndex: number;
  onSelect: (index: number) => void;
  ariaLabel: string;
  buttonAriaLabelPrefix?: string;
  className?: string;
}

/**
 * Row of animate-template buttons. Renders a swatch-only tile per slot
 * (PresetSwatch fills the button), with the active state lifted via the
 * accent border. Used by the desktop lighting view, the panel quick
 * lighting widget, and the panel theme background sheet so all three
 * surfaces share the same chrome.
 */
export function EffectTemplateSelector({
  slots,
  activeIndex,
  onSelect,
  ariaLabel,
  buttonAriaLabelPrefix = 'Preset',
  className,
}: EffectTemplateSelectorProps) {
  return (
    <div
      className={`${styles.selector}${className ? ` ${className}` : ''}`}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {slots.map((slot, index) => {
        const selected = index === activeIndex;
        const label = `${buttonAriaLabelPrefix} ${index + 1}`;
        return (
          <HoverTooltip key={index} body={label} side="top">
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={label}
              className={styles.button}
              data-active={selected ? 'true' : 'false'}
              onClick={() => onSelect(index)}
            >
              <span className={styles.preview}>
                <PresetSwatch
                  hue={slot.hue}
                  colorize={slot.colorize}
                  saturation={slot.saturation}
                  contrast={slot.contrast}
                />
              </span>
            </button>
          </HoverTooltip>
        );
      })}
    </div>
  );
}
