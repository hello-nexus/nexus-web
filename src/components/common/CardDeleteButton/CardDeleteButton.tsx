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
   * the button is always visible (touch surfaces, simple lists). Default true.
   */
  revealOnHover?: boolean;
  /** Extra class for positioning (absolute top/right is the caller's job). */
  className?: string;
}

/**
 * Shared "delete this card" X button (cooling curve cards, media thumbnails).
 * The parent enables hover-reveal by styling `:hover [data-card-delete]` in
 * its own SCSS module; the data attribute jumps module scope so the reveal
 * rule lives on the container that owns the hover surface.
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
