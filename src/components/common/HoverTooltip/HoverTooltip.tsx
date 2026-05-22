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
  /** Trigger content. MUST be a single React element (button, div, span, etc.).
   *  The element's own pointer / focus handlers are preserved — we chain ours
   *  onto them via cloneElement so consumers can keep custom behavior. */
  children: ReactNode;
}

const OFFSET = 8;
// Pointer must rest on the trigger for this long before the tooltip opens.
// Stops incidental cursor pass-through from flashing tooltips on every
// element the user crosses. Matches native browser title delay feel.
const OPEN_DELAY_MS = 300;

const TRANSFORM_PER_SIDE: Record<NonNullable<HoverTooltipProps['side']>, string> = {
  bottom: 'translateX(-50%)',
  top: 'translate(-50%, -100%)',
  right: 'translateY(-50%)',
  left: 'translate(-100%, -50%)',
};

type TriggerProps = {
  ref?: (el: HTMLElement | null) => void;
  onPointerEnter?: (e: React.PointerEvent) => void;
  onPointerLeave?: (e: React.PointerEvent) => void;
  onFocus?: (e: React.FocusEvent) => void;
  onBlur?: (e: React.FocusEvent) => void;
  'aria-describedby'?: string;
};

/**
 * Instant hover tooltip with an optional bold title line and a body line.
 * Opens on pointer enter, closes on leave / blur, renders into a portal on
 * document.body so any ancestor with `overflow: auto` / `clip` can't crop it.
 *
 * IMPORTANT: HoverTooltip does NOT wrap the trigger in an extra DOM element.
 * Handlers, ref, and aria-describedby are cloned directly onto the single
 * child element so flex / grid layouts and direct-child CSS selectors keep
 * working. Pass exactly one React element as `children`.
 *
 * Companion to `InfoTooltip` (which carries its own (i) icon trigger and is
 * suited to section headings). Use `HoverTooltip` when the trigger is the
 * surrounding content itself, e.g. a chip button or icon-only control.
 */
export function HoverTooltip({ title, body, side = 'bottom', children }: HoverTooltipProps) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const openTimerRef = useRef<number | null>(null);
  const tooltipId = useId();

  const cancelPendingOpen = () => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  };
  const scheduleOpen = () => {
    cancelPendingOpen();
    openTimerRef.current = window.setTimeout(() => { setOpen(true); openTimerRef.current = null; }, OPEN_DELAY_MS);
  };
  const close = () => { cancelPendingOpen(); setOpen(false); };

  useEffect(() => () => cancelPendingOpen(), []);

  const reposition = () => {
    const el = triggerRef.current;
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

  if (!isValidElement(children)) {
    // Defensive fallback: render children as-is, no tooltip. Keeps the app
    // running when a caller passes a fragment or string by mistake.
    return <>{children}</>;
  }

  const child = children as ReactElement<TriggerProps>;
  const childProps = child.props;

  // Chain our handlers behind the child's existing handlers so custom click /
  // focus logic on the wrapped element still fires.
  const chain = <T extends (e: any) => void>(theirs: T | undefined, ours: T): T =>
    ((e: any) => { theirs?.(e); ours(e); }) as T;

  // Forward our ref AND any ref the caller already had on the child. React 19
  // keeps refs as a regular `ref` prop; older versions tucked it onto the
  // element as `.ref`. Check both so we work with whichever pattern the
  // caller used.
  const callerRef = (childProps as { ref?: unknown }).ref
    ?? (child as unknown as { ref?: unknown }).ref;
  const setRef = (el: HTMLElement | null) => {
    triggerRef.current = el;
    if (typeof callerRef === 'function') (callerRef as (el: HTMLElement | null) => void)(el);
    else if (callerRef && typeof callerRef === 'object') (callerRef as { current: HTMLElement | null }).current = el;
  };

  const trigger = cloneElement(child, {
    ref: setRef,
    onPointerEnter: chain(childProps.onPointerEnter, (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') scheduleOpen();
    }),
    onPointerLeave: chain(childProps.onPointerLeave, (e: React.PointerEvent) => {
      if (e.pointerType !== 'touch') close();
    }),
    // Keyboard focus opens immediately - keyboard users have committed to
    // the element by tabbing to it, the delay would just feel sluggish.
    onFocus: chain(childProps.onFocus, () => { cancelPendingOpen(); setOpen(true); }),
    onBlur: chain(childProps.onBlur, () => close()),
    'aria-describedby': open ? tooltipId : childProps['aria-describedby'],
  });

  return (
    <>
      {trigger}
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
