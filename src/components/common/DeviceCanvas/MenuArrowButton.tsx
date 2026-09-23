import { ChevronRight } from 'lucide-react';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import styles from './MenuArrowButton.module.scss';

interface MenuArrowButtonProps {
  label: string;
  tooltip: string;
  open: boolean;
  /** Viewport coords for the menu's top-left: beside the arrow, flyout style. */
  onOpen: (x: number, y: number) => void;
  onClose: () => void;
  /** Offsets past a bordered card's edge (`card`) or a borderless header's (`header`). */
  variant: 'card' | 'header';
}

/** Opens a card's or group header's context menu; hidden until its `data-menu-arrow-host` ancestor is hovered. */
export function MenuArrowButton({ label, tooltip, open, onOpen, onClose, variant }: MenuArrowButtonProps) {
  return (
    <HoverTooltip body={tooltip} side="top">
      <button
        type="button"
        className={`${styles.arrow} ${variant === 'card' ? styles.inCard : styles.inHeader}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        data-no-dnd
        onClick={e => {
          e.stopPropagation();
          // Explicit toggle: the button is its own close affordance, and the
          // menu's outside-pointerdown close has already run.
          if (open) { onClose(); return; }
          const r = e.currentTarget.getBoundingClientRect();
          onOpen(r.right + 4, r.top);
        }}
      >
        <ChevronRight aria-hidden />
      </button>
    </HoverTooltip>
  );
}
