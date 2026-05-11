import { X } from 'lucide-react';
import styles from './CardDeleteButton.module.scss';

interface CardDeleteButtonProps {
  onDelete: () => void;
  ariaLabel: string;
  /** Title shown on native tooltip. Defaults to ariaLabel. */
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
    <button
      type="button"
      className={`${styles.root} ${className ?? ''}`}
      aria-label={ariaLabel}
      title={title ?? ariaLabel}
      data-card-delete={revealOnHover ? 'hover' : 'always'}
      onClick={e => { e.stopPropagation(); onDelete(); }}
    >
      <X size={12} strokeWidth={2.5} />
    </button>
  );
}
