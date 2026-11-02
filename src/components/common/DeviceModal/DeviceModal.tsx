import { type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Overlay } from '../Overlay/Overlay';
import styles from './DeviceModal.module.scss';

interface DeviceModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Smaller dim line under the title - e.g. the hardware name a renamed device replaced. */
  subtitle?: string;
  icon?: ReactNode;
  large?: boolean;
  wide?: boolean;
  fullscreen?: boolean;
  /** Hug the content width instead of a fixed width - for small tables/lists. */
  fit?: boolean;
  /** Slightly wider than the default cap - use for content-heavy dialogs. */
  medium?: boolean;
  /** A step wider than medium - for dialogs whose sections need the room. */
  roomy?: boolean;
  /** When false the X button is hidden and Esc/backdrop-click do not close. Defaults to true. */
  closable?: boolean;
  headerRight?: ReactNode;
  children: ReactNode;
}

export function DeviceModal({ open, onClose, title, subtitle, icon, large, wide, fullscreen, fit, medium, roomy, closable = true, headerRight, children }: DeviceModalProps) {
  const { t } = useTranslation();
  const variantClass = fullscreen ? styles.modalFullscreen
    : wide ? styles.modalWide
    : large ? styles.modalLarge
    : fit ? styles.modalFit
    : roomy ? styles.modalRoomy
    : medium ? styles.modalMedium
    : '';
  const surfaceClass = `${styles.modal} ${variantClass}`.trim();

  // The fullscreen variant's top margin (DeviceModal.module.scss) pushes the
  // modal below the Windows caption strip and the Mac drag strip, which
  // would otherwise cover or swallow clicks on the header controls.
  return (
    <Overlay open={open} onClose={onClose} variant="dialog" className={surfaceClass} ariaLabel={title}
      noEscDismiss={!closable} noBackdropDismiss={!closable}>
      <div className={styles.header}>
        <div className={styles.titleRow}>
          {icon && <span className={styles.icon}>{icon}</span>}
          <div className={styles.titleStack}>
            <h3 className={styles.title}>{title}</h3>
            {subtitle && <span className={styles.subtitle}>{subtitle}</span>}
          </div>
        </div>
        <div className={styles.headerRight}>
          {headerRight}
          {closable && (
            <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={t('app.window.close')}>
              <X size={18} />
            </button>
          )}
        </div>
      </div>
      <div className={`${styles.body} ${fullscreen ? styles.bodyFullscreen : wide ? styles.bodyWide : ''}`}>
        {children}
      </div>
    </Overlay>
  );
}
