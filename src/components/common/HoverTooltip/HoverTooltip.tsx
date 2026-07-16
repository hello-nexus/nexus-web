import { cloneElement, isValidElement, useEffect, useId, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { tooltipOpenDelay, notifyTooltipOpen, notifyTooltipClose } from '../tooltipDelay';
import styles from './HoverTooltip.module.scss';

interface HoverTooltipProps {
  /** Bold first line of the tooltip body. Optional - omit for a single-line tooltip. */
  title?: string;
  /** Description shown below the title (or as the only line if title is
   *  omitted). Usually a string; accepts any ReactNode for a multi-line body
   *  (e.g. one line per list item, separated with <br />). */
  body: ReactNode;
  /** Preferred side. Default 'bottom'. */
  side?: 'top' | 'bottom' | 'right' | 'left';
  /** Trigger content. MUST be a single React element (button, div, span, etc.).
   *  The element's own pointer / focus handlers are preserved - we chain ours
   *  onto them via cloneElement so consumers can keep custom behavior. */
  children: ReactNode;
}

const OFFSET = 8;
// Minimum gap kept between the tooltip box and the viewport edge when clamping.
const VIEWPORT_MARGIN = 8;
// The pointer-rest delay before opening lives in ../tooltipDelay as a shared
// "scan mode" coordinator: a lone hover pays the full delay, but scanning
// across a cluster of tooltips opens each one instantly. See tooltipOpenDelay.

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
  const tooltipRef = useRef<HTMLSpanElement | null>(null);
  const openTimerRef = useRef<number | null>(null);
  // Whether THIS tooltip actually became visible. The shared scan-mode
  // coordinator must only see a close for a tooltip that really opened -
  // an incidental pass-through that's cancelled before the delay elapses
  // must not re-arm the scan window, or it would never lapse back.
  const openedRef = useRef(false);
  const tooltipId = useId();

  const cancelPendingOpen = () => {
    if (openTimerRef.current !== null) {
      window.clearTimeout(openTimerRef.current);
      openTimerRef.current = null;
    }
  };
  const scheduleOpen = () => {
    cancelPendingOpen();
    openTimerRef.current = window.setTimeout(() => {
      setOpen(true);
      openedRef.current = true;
      notifyTooltipOpen();
      openTimerRef.current = null;
    }, tooltipOpenDelay());
  };
  const close = () => {
    cancelPendingOpen();
    setOpen(false);
    // Clear so the next open re-measures from scratch (renders hidden until the
    // layout effect positions it) - never a stale-position flash.
    setCoords(null);
    if (openedRef.current) { openedRef.current = false; notifyTooltipClose(); }
  };

  // On unmount, release scan mode if this tooltip was still open - otherwise
  // `scanning` stays latched in the shared coordinator with no timer to lapse
  // it, and the next casual hover would open instantly instead of delaying.
  useEffect(() => () => {
    cancelPendingOpen();
    if (openedRef.current) { openedRef.current = false; notifyTooltipClose(); }
  }, []);

  const reposition = () => {
    const el = triggerRef.current;
    const tip = tooltipRef.current;
    if (!el || !tip) return;
    const r = el.getBoundingClientRect();
    // Measure the rendered tooltip so we can place its top-left corner exactly
    // (no CSS transform) and then clamp the whole box inside the viewport.
    const tw = tip.offsetWidth;
    const th = tip.offsetHeight;
    let top: number;
    let left: number;
    if (side === 'bottom') { top = r.bottom + OFFSET; left = r.left + r.width / 2 - tw / 2; }
    else if (side === 'top') { top = r.top - OFFSET - th; left = r.left + r.width / 2 - tw / 2; }
    else if (side === 'right') { top = r.top + r.height / 2 - th / 2; left = r.right + OFFSET; }
    else { top = r.top + r.height / 2 - th / 2; left = r.left - OFFSET - tw; }
    const m = VIEWPORT_MARGIN;
    const maxLeft = window.innerWidth - tw - m;
    const maxTop = window.innerHeight - th - m;
    // Math.min(m, maxLeft) guards the degenerate case where the tooltip is wider
    // than the viewport - pin to the left/top margin rather than going negative.
    left = Math.max(Math.min(m, maxLeft), Math.min(left, maxLeft));
    top = Math.max(Math.min(m, maxTop), Math.min(top, maxTop));
    setCoords({ top, left });
  };

  // reposition is intentionally not a dep: it reads refs / closes over `side`
  // which IS in the dep list, and re-creating it each render would just
  // re-fire the effect needlessly.
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
    // reposition reads refs only; stable for the open lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!isValidElement(children)) {
    // Not a single element (fragment/string): render as-is, no tooltip.
    return <>{children}</>;
  }

  const child = children as ReactElement<TriggerProps>;
  const childProps = child.props;

  // Chain our handlers behind the child's existing handlers so custom click /
  // focus logic on the wrapped element still fires. Event type intentionally
  // `any` - the helper is variant over pointer/focus event types and the
  // caller side passes the correctly-typed listener; a discriminated generic
  // would require duplicating each handler kind.
  /* eslint-disable @typescript-eslint/no-explicit-any */
  const chain = <T extends (e: any) => void>(theirs: T | undefined, ours: T): T =>
    ((e: any) => { theirs?.(e); ours(e); }) as T;
  /* eslint-enable @typescript-eslint/no-explicit-any */

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
    // Keyboard focus opens immediately (no delay) - tabbing to the element is
    // a deliberate commit.
    onFocus: chain(childProps.onFocus, () => { cancelPendingOpen(); setOpen(true); openedRef.current = true; notifyTooltipOpen(); }),
    onBlur: chain(childProps.onBlur, () => close()),
    'aria-describedby': open ? tooltipId : childProps['aria-describedby'],
  });

  return (
    <>
      {trigger}
      {open && createPortal(
        // Rendered as soon as it opens (hidden until the layout effect measures
        // + clamps it) so getBoundingClientRect has a real box to size against.
        <span ref={tooltipRef} role="tooltip" id={tooltipId} className={styles.tooltip}
          style={{
            top: coords?.top ?? 0,
            left: coords?.left ?? 0,
            visibility: coords ? 'visible' : 'hidden',
          }}>
          {title && <span className={styles.title}>{title}</span>}
          <span className={styles.body}>{body}</span>
        </span>,
        document.body,
      )}
    </>
  );
}
