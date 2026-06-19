import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { tooltipOpenDelay, notifyTooltipOpen, notifyTooltipClose } from '../tooltipDelay';
import styles from './InfoTooltip.module.scss';

interface InfoTooltipProps {
  /** Tooltip body text. Keep to one sentence. */
  message: string;
  /** Accessible name for the icon button. Defaults to `infoTooltip.ariaLabel`. */
  ariaLabel?: string;
  /** Preferred side. Default 'bottom'. */
  side?: 'top' | 'bottom' | 'right' | 'left';
  className?: string;
}

const OFFSET = 8;
// Minimum gap kept between the tooltip box and the viewport edge when clamping.
const VIEWPORT_MARGIN = 8;

/**
 * Subtle info affordance placed next to section titles. Hover or focus
 * reveals a short one-sentence explanation in a small tooltip styled to
 * match the app chrome (elevated surface, app border/radius tokens).
 *
 * Rendered into a portal on document.body so ancestor `overflow: auto`
 * containers (e.g. App's scrollable content column) can't clip it.
 */
export function InfoTooltip({ message, ariaLabel, side = 'bottom', className }: InfoTooltipProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const openTimerRef = useRef<number | null>(null);
  // Whether this tooltip actually became visible - so the shared scan-mode
  // coordinator only sees a close for a tooltip that really opened (an
  // incidental cancelled hover must not re-arm the scan window).
  const openedRef = useRef(false);
  const tooltipId = useId();

  const cancelPendingClose = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  const cancelPendingOpen = () => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  };
  // Open delay so incidental cursor pass-through doesn't pop the tooltip.
  // Shares ../tooltipDelay's "scan mode" with HoverTooltip: scanning across
  // tooltips opens each instantly.
  const scheduleOpen = () => {
    cancelPendingOpen();
    openTimerRef.current = window.setTimeout(() => {
      setOpen(true);
      openedRef.current = true;
      notifyTooltipOpen();
      openTimerRef.current = null;
    }, tooltipOpenDelay());
  };
  // Grace period so cursor can travel from icon to portal'd tooltip across
  // the OFFSET gap without retriggering pointerleave and dismissing.
  const scheduleClose = () => {
    cancelPendingClose();
    cancelPendingOpen();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      if (openedRef.current) { openedRef.current = false; notifyTooltipClose(); }
    }, 120);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const el = triggerRef.current;
      const tip = tooltipRef.current;
      if (!el || !tip) return;
      const r = el.getBoundingClientRect();
      // Measure the rendered tooltip so we can place its top-left corner exactly
      // (no CSS transform) and clamp the whole box inside the viewport.
      const tw = tip.offsetWidth;
      const th = tip.offsetHeight;
      let top = 0;
      let left = 0;
      if (side === 'bottom') { top = r.bottom + OFFSET; left = r.left + r.width / 2 - tw / 2; }
      else if (side === 'top') { top = r.top - OFFSET - th; left = r.left + r.width / 2 - tw / 2; }
      else if (side === 'right') { top = r.top + r.height / 2 - th / 2; left = r.right + OFFSET; }
      else { top = r.top + r.height / 2 - th / 2; left = r.left - OFFSET - tw; }
      const m = VIEWPORT_MARGIN;
      const maxLeft = window.innerWidth - tw - m;
      const maxTop = window.innerHeight - th - m;
      left = Math.max(Math.min(m, maxLeft), Math.min(left, maxLeft));
      top = Math.max(Math.min(m, maxTop), Math.min(top, maxTop));
      setCoords({ top, left });
    };
    reposition();
    // Capture phase so ancestor scrollers (e.g. .content) also trigger us.
    window.addEventListener('scroll', reposition, true);
    window.addEventListener('resize', reposition);
    return () => {
      window.removeEventListener('scroll', reposition, true);
      window.removeEventListener('resize', reposition);
    };
  }, [open, side]);

  useEffect(() => {
    if (!open) return;
    const onDocPointer = (e: MouseEvent) => {
      const target = e.target as Node;
      // Tooltip is portal'd onto document.body, so it's NOT inside rootRef.
      // Treat clicks inside either the trigger or the tooltip as "inside".
      if (rootRef.current?.contains(target)) return;
      if (tooltipRef.current?.contains(target)) return;
      setOpen(false);
      if (openedRef.current) { openedRef.current = false; notifyTooltipClose(); }
    };
    const onKey = (e: KeyboardEvent) => {
      // stopPropagation so dismissing an open tooltip inside a modal does
      // not also close the modal (ConfirmModal / SupportedDevicesModal
      // register their own Esc handlers on window).
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        if (openedRef.current) { openedRef.current = false; notifyTooltipClose(); }
      }
    };
    document.addEventListener('mousedown', onDocPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Clear coords whenever it closes so the next open re-measures from scratch
  // (renders hidden until positioned) - never a stale-position flash.
  useEffect(() => { if (!open) setCoords(null); }, [open]);

  // On unmount, release scan mode if this tooltip was still open - otherwise
  // `scanning` stays latched with no timer to lapse it.
  useEffect(() => () => {
    cancelPendingClose();
    cancelPendingOpen();
    if (openedRef.current) { openedRef.current = false; notifyTooltipClose(); }
  }, []);

  const label = ariaLabel ?? t('infoTooltip.ariaLabel');

  return (
    <span ref={rootRef} className={`${styles.root} ${open ? styles.open : ''} ${className ?? ''}`}>
      <button type="button"
        ref={triggerRef}
        className={styles.trigger}
        aria-label={label}
        aria-describedby={tooltipId}
        onClick={() => {
          cancelPendingOpen();
          const next = !open;
          if (next) { openedRef.current = true; notifyTooltipOpen(); }
          else if (openedRef.current) { openedRef.current = false; notifyTooltipClose(); }
          setOpen(next);
        }}
        onPointerEnter={(e) => { if (e.pointerType !== 'touch') { cancelPendingClose(); scheduleOpen(); } }}
        onPointerLeave={(e) => { if (e.pointerType !== 'touch') scheduleClose(); }}
        onFocus={() => { cancelPendingClose(); cancelPendingOpen(); setOpen(true); openedRef.current = true; notifyTooltipOpen(); }}
        onBlur={() => scheduleClose()}>
        <Info size={14} strokeWidth={1.8} aria-hidden />
      </button>
      {open && createPortal(
        // Rendered as soon as it opens (hidden until the layout effect measures
        // + clamps it) so getBoundingClientRect has a real box to size against.
        <span role="tooltip" id={tooltipId}
          ref={tooltipRef}
          className={styles.tooltip}
          style={{
            top: coords?.top ?? 0,
            left: coords?.left ?? 0,
            visibility: coords ? 'visible' : 'hidden',
          }}
          onPointerEnter={cancelPendingClose}
          onPointerLeave={scheduleClose}>
          {message}
        </span>,
        document.body,
      )}
    </span>
  );
}
