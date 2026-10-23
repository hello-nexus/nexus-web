import { Pencil } from 'lucide-react';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import styles from './CardEditButton.module.scss';

interface CardEditButtonProps {
  onEdit: () => void;
  ariaLabel: string;
  /** Extra class for positioning (absolute placement is the caller's job). */
  className?: string;
}

/**
 * Shared "edit this card" pencil, the hover-revealed counterpart of
 * CardDeleteButton. Hidden until the containing card is hovered or focused, and
 * only on hover-capable fine pointers. The parent enables the reveal by styling
 * `:hover [data-card-edit]` in its own SCSS module; the data attribute jumps
 * module scope so the rule lives on the container that owns the hover surface.
 */
export function CardEditButton({ onEdit, ariaLabel, className }: CardEditButtonProps) {
  return (
    <HoverTooltip body={ariaLabel} side="top">
      <button
        type="button"
        className={`${styles.root} ${className ?? ''}`}
        aria-label={ariaLabel}
        data-card-edit=""
        onClick={e => { e.stopPropagation(); onEdit(); }}
      >
        <Pencil size={16} strokeWidth={1.8} />
      </button>
    </HoverTooltip>
  );
}
