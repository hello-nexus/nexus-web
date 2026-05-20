import { useEffect, useRef, type ReactNode, type RefObject } from 'react';
import classNames from 'classnames';
import styles from './Popover.module.scss';

export type PopoverPlacement =
  | 'bottom-start'
  | 'bottom-end'
  | 'right-start'
  | 'right-end'
  | 'top-start'
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
}

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
}: PopoverProps) {
  const popoverRef = useRef<HTMLDivElement | null>(null);

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

  return (
    <div
      ref={popoverRef}
      role={role}
      aria-label={ariaLabel}
      className={classNames(styles.popover, styles[`placement_${placement.replace('-', '_')}`], className)}
    >
      {children}
    </div>
  );
}
