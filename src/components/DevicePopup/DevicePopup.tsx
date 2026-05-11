import { type ReactNode } from 'react';
import { X } from 'lucide-react';
import { Overlay } from '../Overlay/Overlay';
import styles from './DevicePopup.module.scss';

interface DevicePopupProps {
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

export function DevicePopup({ open, onClose, title, icon, large, wide, fullscreen, headerRight, children }: DevicePopupProps) {
  const variantClass = fullscreen ? styles.popupFullscreen
    : wide ? styles.popupWide
    : large ? styles.popupLarge
    : '';
  const surfaceClass = `${styles.popup} ${variantClass}`.trim();

  return (
    <Overlay open={open} onClose={onClose} variant="dialog" className={surfaceClass} ariaLabel={title}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          {icon && <span className={styles.icon}>{icon}</span>}
          <h3 className={styles.title}>{title}</h3>
        </div>
        <div className={styles.headerRight}>
          {headerRight}
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
      </div>
      <div className={`${styles.body} ${fullscreen ? styles.bodyFullscreen : wide ? styles.bodyWide : ''}`}>
        {children}
      </div>
    </Overlay>
  );
}
