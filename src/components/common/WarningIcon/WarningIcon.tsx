import { AlertTriangle } from 'lucide-react';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import { InfoTooltip } from '../InfoTooltip/InfoTooltip';
import styles from './WarningIcon.module.scss';

interface WarningIconProps {
  /** What is wrong; shown in the tooltip and read out as the icon's label. */
  message: string;
  /** `warning` (watch) is the default; `critical` is only for what the user must act on. */
  tone?: 'warning' | 'critical';
  className?: string;
  /**
   * A non-focusable, hover-only icon, for sitting inside a button or card that is itself
   * the control. The default is a focusable trigger that also opens on tap and on focus.
   */
  bare?: boolean;
}

/**
 * Warning triangle that explains itself in a tooltip. By default it is a
 * button-like trigger (hover, focus, tap) whose clicks stay on the icon, so it
 * works on touch panels and for keyboard users; `bare` keeps the old hover-only
 * span for use inside a button.
 */
export function WarningIcon({ message, tone = 'warning', className, bare = false }: WarningIconProps) {
  if (bare) {
    return (
      <HoverTooltip body={message} side="top">
        <span className={`${styles.icon} ${styles[tone]} ${className ?? ''}`} role="img" aria-label={message}>
          <AlertTriangle size={14} aria-hidden />
        </span>
      </HoverTooltip>
    );
  }
  return (
    // The wrapper keeps a tap on the triangle from reaching a clickable ancestor (a card that selects on click) or a drag handle.
    <span
      data-no-dnd
      className={`${styles.trigger} ${className ?? ''}`}
      onClick={e => e.stopPropagation()}
      onKeyDown={e => e.stopPropagation()}
    >
      <InfoTooltip message={message} ariaLabel={message} side="top" tone={tone} icon={<AlertTriangle size={14} aria-hidden />} />
    </span>
  );
}
