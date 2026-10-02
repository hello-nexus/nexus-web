import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import classNames from 'classnames';
import styles from './Popover.module.scss';

export type PopoverPlacement =
  | 'bottom-start'
  | 'bottom-end'
  | 'right-start'
  | 'right-end'
  | 'top-start'
  | 'top-end'
  | 'left-start';

export interface PopoverProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /**
   * The element the popover is anchored to. Used for click-outside detection
   * (clicks inside the anchor don't dismiss). The anchor is normally the
   * trigger's wrapping element so the trigger button itself is "inside".
   */
  anchorRef: RefObject<HTMLElement | null>;
  placement?: PopoverPlacement;
  className?: string;
  /** Aria role; defaults to 'dialog'. */
  role?: 'dialog' | 'menu' | 'listbox';
  /** Accessible label for the popover container. */
  ariaLabel?: string;
  /** Render in document.body at fixed coordinates, so a scrolling or clipping
   *  ancestor cannot cut it off. Flips to the other side when it would leave
   *  the viewport. */
  portal?: boolean;
}

// Matches the inline placement offsets in Popover.module.scss.
const GAP = 6;
const SIDE_GAP = 8;
const VIEWPORT_MARGIN = 8;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, Math.max(lo, hi)));

/**
 * Inline-anchored popover. Renders nothing when `open` is false. When open,
 * renders a positioned card relative to the closest positioned ancestor
 * (typically the consumer's wrapper around the trigger). Handles click-outside
 * dismissal via `anchorRef` and Escape-key dismissal.
 *
 * Consumers control trigger styling and place the popover next to the trigger:
 *
 *   const wrapRef = useRef<HTMLDivElement>(null);
 *   const [open, setOpen] = useState(false);
 *   <div ref={wrapRef} style={{ position: 'relative' }}>
 *     <button onClick={() => setOpen(o => !o)}>Trigger</button>
 *     <Popover open={open} onClose={() => setOpen(false)} anchorRef={wrapRef}>
 *       Content
 *     </Popover>
 *   </div>
 */
export function Popover({
  open,
  onClose,
  children,
  anchorRef,
  placement = 'bottom-start',
  className,
  role = 'dialog',
  ariaLabel,
  portal = false,
}: PopoverProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const reposition = useCallback(() => {
    const anchor = anchorRef.current;
    const pop = popoverRef.current;
    if (!anchor || !pop) return;
    const r = anchor.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    const [side, align] = placement.split('-');
    let top: number;
    let left: number;
    if (side === 'top' || side === 'bottom') {
      const below = r.bottom + GAP;
      const above = r.top - GAP - h;
      const fitsBelow = below + h <= window.innerHeight - VIEWPORT_MARGIN;
      const fitsAbove = above >= VIEWPORT_MARGIN;
      top = side === 'bottom' ? (fitsBelow || !fitsAbove ? below : above) : (fitsAbove || !fitsBelow ? above : below);
      left = align === 'start' ? r.left : r.right - w;
    } else {
      left = side === 'right' ? r.right + SIDE_GAP : r.left - SIDE_GAP - w;
      top = align === 'start' ? r.top : r.bottom - h;
    }
    setCoords({
      top: clamp(top, VIEWPORT_MARGIN, window.innerHeight - h - VIEWPORT_MARGIN),
      left: clamp(left, VIEWPORT_MARGIN, window.innerWidth - w - VIEWPORT_MARGIN),
    });
  }, [anchorRef, placement]);

  useLayoutEffect(() => {
    if (open && portal) reposition();
  }, [open, portal, reposition]);

  useEffect(() => {
    if (!open || !portal) return;
    // Mounted open, the anchor's ref attaches after this popover's layout effect.
    reposition();
    // A scrolling ancestor carries the anchor away; fixed coordinates cannot follow it.
    const onScroll = (e: Event) => { if (!popoverRef.current?.contains(e.target as Node)) onClose(); };
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, portal, reposition, onClose]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      const inAnchor = anchorRef.current?.contains(target) ?? false;
      const inPopover = popoverRef.current?.contains(target) ?? false;
      if (!inAnchor && !inPopover) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  const node = (
    <div
      ref={popoverRef}
      role={role}
      aria-label={ariaLabel}
      className={classNames(styles.popover, portal ? styles.portaled : styles[`placement_${placement.replace('-', '_')}`], className)}
      style={portal ? { top: coords?.top ?? 0, left: coords?.left ?? 0, visibility: coords ? undefined : 'hidden' } : undefined}
      data-portaled-popover={portal || undefined}
    >
      {children}
    </div>
  );
  return portal ? createPortal(node, document.body) : node;
}
