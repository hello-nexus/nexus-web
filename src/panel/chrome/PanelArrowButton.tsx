import { ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './PanelArrowButton.module.scss';

interface PanelArrowButtonProps {
  side: 'prev' | 'next';
  onClick: () => void;
  ariaLabel: string;
  disabled?: boolean;
  // Caller-scoped overrides (size/position per surface). The base look lives
  // in PanelArrowButton.module.scss; widgets pass their own class for the
  // responsive tweaks that win by container-scoped specificity.
  className?: string;
}

// Naked chevron nav arrow shared by the cooling/lighting widgets and the
// panel device-page preview. Absolutely positioned by `data-side`; the
// caller's container must be `position: relative`.
export function PanelArrowButton({ side, onClick, ariaLabel, disabled, className }: PanelArrowButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.arrow}${className ? ` ${className}` : ''}`}
      data-side={side}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {side === 'prev' ? <ChevronLeft /> : <ChevronRight />}
    </button>
  );
}
