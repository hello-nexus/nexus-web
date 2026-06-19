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
  // The arrow sits over a colored surface (e.g. the lighting preview), so it
  // always uses the dark-theme treatment - light chevrons + drop shadow -
  // regardless of the active theme. Otherwise the shadow is dropped in light
  // theme (dark chevrons on a light surface don't need it).
  onColor?: boolean;
}

// Naked chevron nav arrow shared by the cooling/lighting widgets and the
// panel device-page preview. Absolutely positioned by `data-side`; the
// caller's container must be `position: relative`.
export function PanelArrowButton({ side, onClick, ariaLabel, disabled, className, onColor }: PanelArrowButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.arrow}${className ? ` ${className}` : ''}`}
      data-side={side}
      data-on-color={onColor ? '' : undefined}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {side === 'prev' ? <ChevronLeft /> : <ChevronRight />}
    </button>
  );
}
