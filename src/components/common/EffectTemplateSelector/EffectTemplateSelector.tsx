import { Lightbulb, Monitor } from 'lucide-react';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import { useEffectThumbnail } from '../../../hooks/useEffectThumbnail';
import { slotThumbSignature } from '../../../types/lightingTemplates';
import { useTranslation } from '../../../lib/i18n';
import type { EffectState } from '../../../types/lighting';
import styles from './EffectTemplateSelector.module.scss';

interface EffectTemplateSelectorProps {
  /** Effect key the slots belong to (for the universal per-slot thumbnail). */
  effect: string;
  /** The 4 universal preset slots. Each button shows that slot's real thumbnail. */
  slots: EffectState[];
  activeIndex: number;
  onSelect: (index: number) => void;
  ariaLabel: string;
  buttonAriaLabelPrefix?: string;
  className?: string;
  /**
   * The slot currently driving the physical RGB LEDs — shows a bulb so the user
   * knows editing it will move their hardware. Panels only; omit on the lighting
   * page (there the active preset is the RGB by definition).
   */
  rgbActiveSlot?: number | null;
  /**
   * Slots used as a background by ≥1 panel — each shows a panel icon (stacked
   * with the bulb) so the user knows editing it changes those panels. Panels
   * only.
   */
  panelSlots?: Set<number> | null;
}

function PresetThumbButton({
  effect, slot, state, selected, live, panel, label, onSelect,
}: {
  effect: string;
  slot: number;
  state: EffectState;
  selected: boolean;
  live: boolean;
  panel: boolean;
  label: string;
  onSelect: () => void;
}) {
  const { t } = useTranslation();
  const url = useEffectThumbnail(effect, slot, slotThumbSignature(state));
  // Badge meaning rides the existing preset tooltip: label becomes the bold
  // title, the live/panel hints the body (so hovering explains the icons).
  const hints = [live && t('lighting.badge.liveOnLeds'), panel && t('lighting.badge.usedByPanel')].filter(Boolean) as string[];
  const tip = hints.length ? { title: label, body: hints.join(' · ') } : { body: label };
  return (
    <HoverTooltip {...tip} side="top">
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={label}
        className={styles.button}
        data-active={selected ? 'true' : 'false'}
        onClick={onSelect}
      >
        <span className={styles.preview}>
          {url
            ? <img className={styles.thumb} src={url} alt="" draggable={false} />
            : <span className={styles.skeleton} aria-hidden="true" />}
          {(live || panel) && (
            <span className={styles.badges}>
              {live && <Lightbulb aria-hidden="true" />}
              {panel && <Monitor aria-hidden="true" />}
            </span>
          )}
        </span>
      </button>
    </HoverTooltip>
  );
}

/**
 * Row of preset buttons, each showing the real generated thumbnail for that
 * universal slot. Used by the desktop lighting view, the panel lighting widget,
 * and the panel theme background sheet so all three share the same chrome.
 */
export function EffectTemplateSelector({
  effect,
  slots,
  activeIndex,
  onSelect,
  ariaLabel,
  buttonAriaLabelPrefix = 'Preset',
  className,
  rgbActiveSlot,
  panelSlots,
}: EffectTemplateSelectorProps) {
  return (
    <div
      className={`${styles.selector}${className ? ` ${className}` : ''}`}
      role="radiogroup"
      aria-label={ariaLabel}
    >
      {slots.map((slot, index) => (
        <PresetThumbButton
          key={index}
          effect={effect}
          slot={index}
          state={slot}
          selected={index === activeIndex}
          live={rgbActiveSlot === index}
          panel={!!panelSlots && panelSlots.has(index)}
          label={`${buttonAriaLabelPrefix} ${index + 1}`}
          onSelect={() => onSelect(index)}
        />
      ))}
    </div>
  );
}
