import { useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import styles from './MenuArrowButton.module.scss';

interface MenuArrowButtonProps {
  label: string;
  tooltip: string;
  open: boolean;
  /** Viewport coords for the menu's top-left: beside the arrow, flyout style. */
  onOpen: (x: number, y: number) => void;
  onClose: () => void;
  /**
   * Offsets past a bordered card's edge (`card`) or a borderless header's
   * (`header`). `corner` is a round badge centered on the host's top-right
   * corner with a down chevron; its menu opens below the badge.
   */
  variant: 'card' | 'header' | 'corner';
  /**
   * `corner` only: the visible card the badge is centered on. The badge is
   * portaled to the body and positioned from this element's rect each frame, so
   * it takes no layout space and no ancestor's overflow clips it.
   */
  anchor?: HTMLElement | null;
}

/** Opens a card's or group header's context menu; hidden until its `data-menu-arrow-host` ancestor is hovered. */
export function MenuArrowButton({ label, tooltip, open, onOpen, onClose, variant, anchor }: MenuArrowButtonProps) {
  const corner = variant === 'corner';
  const btnRef = useRef<HTMLButtonElement>(null);
  // `open` as of the press: the menu's outside-pointerdown close and the host's
  // pointerup have already run by the click, so a re-read there would reopen.
  const openAtPressRef = useRef(false);
  useLayoutEffect(() => {
    if (!corner || !anchor) return undefined;
    let raf = 0;
    // Keep the badge's outer edge inside the gutter between cards: its center
    // sits half a badge in from the gutter's far edge, so a narrow gutter pulls
    // the badge toward its own card and never over a neighbor.
    const size = btnRef.current?.offsetWidth ?? 0;
    const gap = Number.parseFloat(getComputedStyle(anchor.closest('[data-surface]') ?? anchor).getPropertyValue('--panel-gap')) || 0;
    btnRef.current?.style.setProperty('--_inset', `${Math.min(size, Math.max(0, size / 2 - gap + 0.5))}px`);
    const place = () => {
      const el = btnRef.current;
      if (el) {
        const r = anchor.getBoundingClientRect();
        el.style.left = `${r.right}px`;
        el.style.top = `${r.top}px`;
      }
      raf = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(raf);
  }, [corner, anchor]);
  if (corner && !anchor) return null;
  const Icon = corner ? ChevronDown : ChevronRight;
  const node = (
    <HoverTooltip body={tooltip} side="top">
      <button
        ref={btnRef}
        type="button"
        className={`${styles.arrow} ${variant === 'card' ? styles.inCard : corner ? styles.inCorner : styles.inHeader}`}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        data-no-dnd
        onPointerDown={corner ? e => { openAtPressRef.current = open; e.stopPropagation(); } : undefined}
        onPointerUp={corner ? e => e.stopPropagation() : undefined}
        onClick={e => {
          e.stopPropagation();
          // Explicit toggle: the button is its own close affordance, and the
          // menu's outside-pointerdown close has already run.
          if (corner ? openAtPressRef.current : open) { onClose(); return; }
          const r = e.currentTarget.getBoundingClientRect();
          if (corner) onOpen(r.left, r.bottom + 4);
          else onOpen(r.right + 4, r.top);
        }}
      >
        <Icon aria-hidden />
      </button>
    </HoverTooltip>
  );
  // Same layer as the context menu (the panel root), so the menu's z-index
  // outranks the badge; the body is a different stacking context and sat above it.
  return corner ? createPortal(node, anchor?.closest<HTMLElement>('[data-surface]') ?? document.body) : node;
}
