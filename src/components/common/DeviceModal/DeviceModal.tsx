import { type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { Overlay } from '../Overlay/Overlay';
import styles from './DeviceModal.module.scss';

interface DeviceModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  icon?: ReactNode;
  large?: boolean;
  wide?: boolean;
  fullscreen?: boolean;
  headerRight?: ReactNode;
  children: ReactNode;
}

export function DeviceModal({ open, onClose, title, icon, large, wide, fullscreen, headerRight, children }: DeviceModalProps) {
  const variantClass = fullscreen ? styles.modalFullscreen
    : wide ? styles.modalWide
    : large ? styles.modalLarge
    : '';
  const surfaceClass = `${styles.modal} ${variantClass}`.trim();

  // The fullscreen variant fills the window; its top-right close button
  // ends up directly underneath the Qos Windows-shell caption buttons +
  // window drag strip (both z-index 2000+). The modal lives inside the
  // backdrop's z-index:1000 stacking context, so children can't raise
  // themselves out. Portal the close button to <body> instead so it
  // gets its own root-level stacking — z-index 2500 in the SCSS sits
  // above every piece of window chrome. Centered (non-fullscreen)
  // modals don't collide, so they keep the inline close button.
  const fullscreenCloseBtn = fullscreen && open
    ? createPortal(
        <button
          type="button"
          className={styles.closeBtnFloating}
          onClick={onClose}
          aria-label="Close"
        >
          <X size={18} />
        </button>,
        document.body,
      )
    : null;

  return (
    <>
      <Overlay open={open} onClose={onClose} variant="dialog" className={surfaceClass} ariaLabel={title}>
        <div className={styles.header}>
          <div className={styles.titleRow}>
            {icon && <span className={styles.icon}>{icon}</span>}
            <h3 className={styles.title}>{title}</h3>
          </div>
          <div className={styles.headerRight}>
            {headerRight}
            {!fullscreen && (
              <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
                <X size={18} />
              </button>
            )}
          </div>
        </div>
        <div className={`${styles.body} ${fullscreen ? styles.bodyFullscreen : wide ? styles.bodyWide : ''}`}>
          {children}
        </div>
      </Overlay>
      {fullscreenCloseBtn}
    </>
  );
}
