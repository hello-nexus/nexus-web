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
  /** `corner` only: the card the badge is portaled beside (placed from its rect, hidden while its corner is scrolled out). */
  anchor?: HTMLElement | null;
}

/** The closest ancestor that scrolls vertically, or undefined when the card sits in the page itself. */
function scrollParentOf(el: HTMLElement): HTMLElement | undefined {
  for (let node = el.parentElement; node; node = node.parentElement) {
    if (/(auto|scroll|overlay)/.test(getComputedStyle(node).overflowY)) return node;
  }
  return undefined;
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
    // Keep the badge's outer edge inside the gutter between cards: its center
    // sits half a badge in from the gutter's far edge, so a narrow gutter pulls
    // the badge toward its own card and never over a neighbor.
    const size = btnRef.current?.offsetWidth ?? 0;
    const gap = Number.parseFloat(getComputedStyle(anchor.closest('[data-surface]') ?? anchor).getPropertyValue('--panel-gap')) || 0;
    btnRef.current?.style.setProperty('--_inset', `${Math.min(size, Math.max(0, size / 2 - gap + 0.5))}px`);
    const clipper = scrollParentOf(anchor);
    const place = () => {
      const el = btnRef.current;
      if (!el) return;
      const r = anchor.getBoundingClientRect();
      el.style.left = `${r.right}px`;
      el.style.top = `${r.top}px`;
      // A corner scrolled past the dashboard's edge would float over the bar above it.
      const clip = clipper?.getBoundingClientRect();
      el.style.visibility = clip && (r.top < clip.top || r.top > clip.bottom) ? 'hidden' : '';
    };
    place();
    // A card can move without resizing (reflow, pager or press transforms), so also re-place on hover, on motion ends, and per frame while the menu is open.
    let frame = 0;
    const follow = () => { place(); frame = requestAnimationFrame(follow); };
    if (open) frame = requestAnimationFrame(follow);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    window.addEventListener('transitionend', place, true);
    window.addEventListener('animationend', place, true);
    anchor.addEventListener('pointermove', place);
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(place);
    observer?.observe(anchor);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      window.removeEventListener('transitionend', place, true);
      window.removeEventListener('animationend', place, true);
      anchor.removeEventListener('pointermove', place);
      observer?.disconnect();
    };
  }, [corner, anchor, open]);
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
