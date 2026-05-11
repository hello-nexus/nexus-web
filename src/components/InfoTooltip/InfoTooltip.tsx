import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Info } from 'lucide-react';
import { useTranslation } from '../../lib/i18n';
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

const TRANSFORM_PER_SIDE: Record<NonNullable<InfoTooltipProps['side']>, string> = {
  bottom: 'translateX(-50%)',
  top: 'translate(-50%, -100%)',
  right: 'translateY(-50%)',
  left: 'translate(-100%, -50%)',
};

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
  const tooltipId = useId();

  const cancelPendingClose = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };
  // Grace period so cursor can travel from icon to portal'd tooltip across
  // the OFFSET gap without retriggering pointerleave and dismissing.
  const scheduleClose = () => {
    cancelPendingClose();
    closeTimerRef.current = window.setTimeout(() => setOpen(false), 120);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const reposition = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      let top = 0;
      let left = 0;
      if (side === 'bottom') { top = r.bottom + OFFSET; left = r.left + r.width / 2; }
      else if (side === 'top') { top = r.top - OFFSET; left = r.left + r.width / 2; }
      else if (side === 'right') { top = r.top + r.height / 2; left = r.right + OFFSET; }
      else { top = r.top + r.height / 2; left = r.left - OFFSET; }
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
    };
    const onKey = (e: KeyboardEvent) => {
      // stopPropagation so dismissing an open tooltip inside a modal does
      // not also close the modal (ConfirmDialog / SupportedDevicesModal
      // register their own Esc handlers on window).
      if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
    };
    document.addEventListener('mousedown', onDocPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => () => cancelPendingClose(), []);

  const label = ariaLabel ?? t('infoTooltip.ariaLabel');

  return (
    <span ref={rootRef} className={`${styles.root} ${open ? styles.open : ''} ${className ?? ''}`}>
      <button type="button"
        ref={triggerRef}
        className={styles.trigger}
        aria-label={label}
        aria-describedby={tooltipId}
        onClick={() => setOpen(v => !v)}
        onPointerEnter={(e) => { if (e.pointerType !== 'touch') { cancelPendingClose(); setOpen(true); } }}
        onPointerLeave={(e) => { if (e.pointerType !== 'touch') scheduleClose(); }}
        onFocus={() => { cancelPendingClose(); setOpen(true); }}
        onBlur={() => scheduleClose()}>
        <Info size={14} strokeWidth={1.8} aria-hidden />
      </button>
      {open && coords && createPortal(
        <span role="tooltip" id={tooltipId}
          ref={tooltipRef}
          className={styles.tooltip}
          style={{ top: coords.top, left: coords.left, transform: TRANSFORM_PER_SIDE[side] }}
          onPointerEnter={cancelPendingClose}
          onPointerLeave={scheduleClose}>
          {message}
        </span>,
        document.body,
      )}
    </span>
  );
}
