import { cloneElement, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import styles from './HoverTooltip.module.scss';

interface HoverTooltipProps {
  /** Bold first line of the tooltip body. Optional - omit for a single-line tooltip. */
  title?: string;
  /** Description shown below the title (or as the only line if title is omitted). */
  body: string;
  /** Preferred side. Default 'bottom'. */
  side?: 'top' | 'bottom' | 'right' | 'left';
  /** Trigger content. Wrapped in an inline-flex span that owns the hover and
   *  focus handlers; the child element receives `aria-describedby` pointing
   *  at the tooltip while open, so screen readers announce the hint when the
   *  trigger is focused. */
  children: ReactNode;
  className?: string;
}

const OFFSET = 8;

const TRANSFORM_PER_SIDE: Record<NonNullable<HoverTooltipProps['side']>, string> = {
  bottom: 'translateX(-50%)',
  top: 'translate(-50%, -100%)',
  right: 'translateY(-50%)',
  left: 'translate(-100%, -50%)',
};

/**
 * Instant hover tooltip with an optional bold title line and a body line.
 * Opens the moment the pointer enters the trigger (no open delay), closes
 * on leave / blur, and renders into a portal on document.body so any
 * ancestor with `overflow: auto` / `clip` can't crop it.
 *
 * Companion to `InfoTooltip` (which carries its own (i) icon trigger and is
 * suited to section headings). Use `HoverTooltip` when the trigger is the
 * surrounding content itself, e.g. a chip button or icon-only control.
 */
export function HoverTooltip({ title, body, side = 'bottom', children, className }: HoverTooltipProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const tooltipId = useId();

  const reposition = () => {
    const el = wrapRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (side === 'bottom') setCoords({ top: r.bottom + OFFSET, left: r.left + r.width / 2 });
    else if (side === 'top') setCoords({ top: r.top - OFFSET, left: r.left + r.width / 2 });
    else if (side === 'right') setCoords({ top: r.top + r.height / 2, left: r.right + OFFSET });
    else setCoords({ top: r.top + r.height / 2, left: r.left - OFFSET });
  };

  useLayoutEffect(() => { if (open) reposition(); }, [open, side]);
  useEffect(() => {
    if (!open) return;
    const handler = () => reposition();
    window.addEventListener('scroll', handler, true);
    window.addEventListener('resize', handler);
    return () => {
      window.removeEventListener('scroll', handler, true);
      window.removeEventListener('resize', handler);
    };
  }, [open]);

  // Wire `aria-describedby` onto the trigger child while the tooltip is
  // open so assistive tech announces the body when the trigger is focused.
  // Wrapper span can't carry the ARIA link because focus lands on the inner
  // interactive element, not the span. Only patches when children is a
  // single React element; otherwise passes through unchanged.
  const trigger = isValidElement(children) && open
    ? cloneElement(children as ReactElement<{ 'aria-describedby'?: string }>, {
        'aria-describedby': tooltipId,
      })
    : children;

  return (
    <>
      <span
        ref={wrapRef}
        className={`${styles.wrap}${className ? ' ' + className : ''}`}
        onPointerEnter={(e) => { if (e.pointerType !== 'touch') setOpen(true); }}
        onPointerLeave={(e) => { if (e.pointerType !== 'touch') setOpen(false); }}
        onFocusCapture={() => setOpen(true)}
        onBlurCapture={() => setOpen(false)}
      >
        {trigger}
      </span>
      {open && coords && createPortal(
        <span role="tooltip" id={tooltipId} className={styles.tooltip}
          style={{ top: coords.top, left: coords.left, transform: TRANSFORM_PER_SIDE[side] }}>
          {title && <span className={styles.title}>{title}</span>}
          <span className={styles.body}>{body}</span>
        </span>,
        document.body,
      )}
    </>
  );
}
