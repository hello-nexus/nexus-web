import { type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
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
  /** Hug the content width instead of a fixed width — for small tables/lists. */
  fit?: boolean;
  headerRight?: ReactNode;
  children: ReactNode;
}

export function DeviceModal({ open, onClose, title, icon, large, wide, fullscreen, fit, headerRight, children }: DeviceModalProps) {
  const { t } = useTranslation();
  const variantClass = fullscreen ? styles.modalFullscreen
    : wide ? styles.modalWide
    : large ? styles.modalLarge
    : fit ? styles.modalFit
    : '';
  const surfaceClass = `${styles.modal} ${variantClass}`.trim();

  // The fullscreen variant's top margin (DeviceModal.module.scss) pushes
  // the modal below the 32px Windows caption strip in the Nexus shell, so
  // the inline header X is no longer obscured by the caption buttons.
  return (
    <Overlay open={open} onClose={onClose} variant="dialog" className={surfaceClass} ariaLabel={title}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          {icon && <span className={styles.icon}>{icon}</span>}
          <h3 className={styles.title}>{title}</h3>
        </div>
        <div className={styles.headerRight}>
          {headerRight}
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={t('app.window.close')}>
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
