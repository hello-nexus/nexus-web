import { X } from 'lucide-react';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import styles from './CardDeleteButton.module.scss';

interface CardDeleteButtonProps {
  onDelete: () => void;
  ariaLabel: string;
  /** Tooltip body shown on hover. Defaults to ariaLabel. */
  title?: string;
  /**
   * Hide the button until the parent `.card` is hovered / focused. When false
   * the button is always visible - useful on touch surfaces or in simple lists
   * where a hover affordance is a discoverability hazard. Default true.
   */
  revealOnHover?: boolean;
  /** Extra class for positioning (absolute top/right is the caller's job). */
  className?: string;
}

/**
 * Single source of truth for the "delete this card" X button, used on cooling
 * curve cards, media thumbnails, and any future card-shaped list item. The
 * parent enables hover-reveal by styling `:hover [data-card-delete]` in its
 * own SCSS module - the data attribute jumps module scope and keeps the
 * reveal rule close to the container that owns the hover surface.
 */
export function CardDeleteButton({
  onDelete, ariaLabel, title, revealOnHover = true, className,
}: CardDeleteButtonProps) {
  return (
    <HoverTooltip body={title ?? ariaLabel} side="top">
      <button
        type="button"
        className={`${styles.root} ${className ?? ''}`}
        aria-label={ariaLabel}
        data-card-delete={revealOnHover ? 'hover' : 'always'}
        onClick={e => { e.stopPropagation(); onDelete(); }}
      >
        <X size={12} strokeWidth={2.5} />
      </button>
    </HoverTooltip>
  );
}
