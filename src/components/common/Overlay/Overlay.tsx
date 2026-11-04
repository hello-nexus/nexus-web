import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useModalA11y } from './useModalA11y';
import { useOverlayScale } from './overlayScale';
import { acquireBlurScrim, releaseBlurScrim } from './blurScrimGuard';
import styles from './Overlay.module.scss';

/**
 * Canonical modal/sheet base.
 *
 * Renders a fixed backdrop with click-outside dismiss and an inner surface
 * element that absorbs pointer events. Each consumer brings their own
 * header/body/footer chrome. useModalA11y registers the surface with the
 * shared open-stack (Escape/Enter/Tab arbitrated against the topmost open
 * modal only), traps Tab within the surface, locks background scroll, and
 * restores focus to the trigger on close.
 *
 * Variants control surface placement + a11y role:
 *   - 'dialog' : centered modal (default; non-blocking - DeviceModal et al)
 *   - 'alert'  : centered modal with role=alertdialog (ConfirmModal)
 *   - 'sheet'  : right-anchored slide drawer (AnimateDrawer)
 *
 * Use `noBackdropDismiss` for sheets that need internal pointer events to
 * dominate (gesture-driven swipe close). Use `onEnter` to wire Enter-to-
 * confirm in alert dialogs.
 *
 * The surface receives `className` so consumers can keep their existing
 * size/shape classes (modalLarge, modalFullscreen, etc.) without rewriting
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
  /** Initial focus on open: the first focusable element (default) or the surface itself. */
  autoFocus?: 'first' | 'container';
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
  autoFocus,
  children,
}: OverlayProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const scale = useOverlayScale();
  useModalA11y({ open, onClose, onEnter, noEscDismiss, autoFocus, containerRef: surfaceRef });

  // Only the centered variants paint a blurring backdrop; sheets bring their
  // own scrim (Slideout) and never blur.
  const blursBackdrop = open && variant !== 'sheet';
  useEffect(() => {
    if (!blursBackdrop) return;
    acquireBlurScrim();
    return releaseBlurScrim;
  }, [blursBackdrop]);

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

  // Portal to <body> so position:fixed anchors to the viewport regardless of
  // ancestor transforms / filters / contain rules (which silently re-anchor
  // fixed children to their bounding box - that's what made dialogs render
  // squished inside animated header slots etc.).
  const portalTarget = typeof document !== 'undefined' ? document.body : null;

  const content = (
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
        ref={surfaceRef}
        className={`${styles.surface} ${className ?? ''}`}
        // Sheets are placed by their owner; only centered dialogs follow the host's scale.
        style={variant !== 'sheet' && scale !== 1 ? scaledSurfaceStyle(scale) : undefined}
        tabIndex={-1}
        onPointerDown={e => { pointerDownInSurface.current = true; e.stopPropagation(); }}
        onClick={e => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );

  return portalTarget ? createPortal(content, portalTarget) : content;
}

// Zoom multiplies every length inside, vh-based limits included, so the
// viewport caps are divided by the scale (as the editor sheet does) and a
// dialog taller than the screen scrolls instead of spilling off it. The 4rem is
// the centered backdrop's 2rem padding on both sides.
function scaledSurfaceStyle(scale: number): CSSProperties {
  return {
    zoom: scale,
    maxWidth: `calc((100vw - 4rem) / ${scale})`,
    maxHeight: `calc((100dvh - 4rem) / ${scale})`,
    overflowY: 'auto',
  };
}
