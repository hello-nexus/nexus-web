import { useCallback, useEffect, useRef, type ReactNode } from 'react';
import styles from './Overlay.module.scss';

/**
 * Canonical modal/sheet base.
 *
 * Renders a fixed backdrop with click-outside dismiss, an Esc-to-close key
 * handler, and an inner surface element that absorbs pointer events. Each
 * consumer brings their own header/body/footer chrome.
 *
 * Variants control surface placement + a11y role:
 *   - 'dialog' : centered modal (default; non-blocking - DevicePopup et al)
 *   - 'alert'  : centered modal with role=alertdialog (ConfirmDialog)
 *   - 'sheet'  : right-anchored slide drawer (AnimateDrawer)
 *
 * Use `noBackdropDismiss` for sheets that need internal pointer events to
 * dominate (gesture-driven swipe close). Use `onEnter` to wire Enter-to-
 * confirm in alert dialogs.
 *
 * The surface receives `className` so consumers can keep their existing
 * size/shape classes (popupLarge, popupFullscreen, etc.) without rewriting
 * style sheets.
 */
export interface OverlayProps {
  open: boolean;
  onClose: () => void;
  variant?: 'dialog' | 'alert' | 'sheet';
  noEscDismiss?: boolean;
  noBackdropDismiss?: boolean;
  onEnter?: () => void;
  ariaLabel?: string;
  className?: string;
  backdropClassName?: string;
  children: ReactNode;
}

export function Overlay({
  open,
  onClose,
  variant = 'dialog',
  noEscDismiss = false,
  noBackdropDismiss = false,
  onEnter,
  ariaLabel,
  className,
  backdropClassName,
  children,
}: OverlayProps) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!noEscDismiss && e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (onEnter && e.key === 'Enter') {
      e.preventDefault();
      onEnter();
    }
  }, [noEscDismiss, onClose, onEnter]);

  useEffect(() => {
    if (!open) return;
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  // Track whether the pointer went down inside the surface. A drag that
  // starts inside and ends outside should not dismiss; only a clean
  // backdrop-only click does.
  const pointerDownInSurface = useRef(false);

  if (!open) return null;

  const role = variant === 'alert' ? 'alertdialog' : 'dialog';
  const variantClass = variant === 'sheet'
    ? styles.backdropSheet
    : variant === 'alert'
      ? styles.backdropAlert
      : styles.backdropDialog;

  return (
    <div
      className={`${styles.backdrop} ${variantClass} ${backdropClassName ?? ''}`}
      role={role}
      aria-modal="true"
      aria-label={ariaLabel}
      onPointerDown={() => { pointerDownInSurface.current = false; }}
      onClick={() => {
        if (noBackdropDismiss) return;
        if (!pointerDownInSurface.current) onClose();
      }}
    >
      <div
        className={`${styles.surface} ${className ?? ''}`}
        onPointerDown={e => { pointerDownInSurface.current = true; e.stopPropagation(); }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
