import { useEffect, useId, useRef, type RefObject } from 'react';
import { getFocusableElements, pushModalStackEntry, removeModalStackEntry } from './modalStack';
import { lockBackground, unlockBackground } from './backgroundLock';

export interface UseModalA11yOptions {
  open: boolean;
  onClose: () => void;
  containerRef: RefObject<HTMLElement | null>;
  onEnter?: () => void;
  /** Suppresses Escape-to-close. Tab-trap/scroll-lock/focus-restore still apply. */
  noEscDismiss?: boolean;
  /** Traps Tab within containerRef and wraps at the boundary. Default true. */
  trapFocus?: boolean;
  /** Locks page scroll and aria-hides the app root while open. Default true. */
  lockBackground?: boolean;
  /** Moves focus into the container on open and restores it to the trigger on close. Default true. */
  restoreFocus?: boolean;
}

/**
 * Registers a modal/overlay with the shared open-stack so Escape/Enter/Tab
 * are arbitrated against the topmost entry only, and applies the standard
 * modal a11y behaviors (focus trap, scroll lock, focus restore) each
 * consumer would otherwise have to hand-roll.
 */
export function useModalA11y({
  open,
  onClose,
  containerRef,
  onEnter,
  noEscDismiss = false,
  trapFocus = true,
  lockBackground: shouldLockBackground = true,
  restoreFocus = true,
}: UseModalA11yOptions): void {
  const id = useId();
  const latestRef = useRef({ onClose, onEnter, noEscDismiss });
  useEffect(() => {
    latestRef.current = { onClose, onEnter, noEscDismiss };
  });

  useEffect(() => {
    if (!open) return undefined;

    const trigger = restoreFocus && document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;

    if (shouldLockBackground) lockBackground();

    pushModalStackEntry({
      id,
      containerRef,
      trapFocus,
      onEscape: () => {
        if (latestRef.current.noEscDismiss) return false;
        latestRef.current.onClose();
        return true;
      },
      onEnter: () => {
        const fn = latestRef.current.onEnter;
        if (!fn) return false;
        fn();
        return true;
      },
    });

    if (restoreFocus) {
      const container = containerRef.current;
      if (container && !container.contains(document.activeElement)) {
        const [first] = getFocusableElements(container);
        (first ?? container).focus();
      }
    }

    return () => {
      if (shouldLockBackground) unlockBackground();
      removeModalStackEntry(id);
      if (trigger && document.body.contains(trigger)) trigger.focus();
    };
    // containerRef is a stable ref object; onClose/onEnter/noEscDismiss read
    // from latestRef so they don't need to retrigger this registration
    // effect; trapFocus/shouldLockBackground/restoreFocus are static
    // per-caller configuration, not reactive state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, id]);
}
