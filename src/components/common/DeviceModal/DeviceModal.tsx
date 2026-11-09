import { type ReactNode } from 'react';
import { X } from 'lucide-react';
import { useTranslation } from '../../../lib/i18n';
import { Overlay } from '../Overlay/Overlay';
import { Button } from '../Button/Button';
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
  /** When false the X button and footer are hidden and Esc/backdrop-click do not close. Defaults to true. */
  closable?: boolean;
  /**
   * Submit buttons, rendered at the right of the footer. Passing `footer` or
   * `cancelLabel` switches the modal to footer mode: Cancel on the left, no
   * header X. Without either, the modal has a header X and no footer.
   */
  footer?: ReactNode;
  /** Footer mode with a custom left button label (default Cancel). */
  cancelLabel?: string;
  /** Disables the left button, e.g. while an async submit is in flight. */
  cancelDisabled?: boolean;
  headerRight?: ReactNode;
  children: ReactNode;
}

export function DeviceModal({ open, onClose, title, subtitle, icon, large, wide, fullscreen, fit, medium, roomy, closable = true, footer, cancelLabel, cancelDisabled, headerRight, children }: DeviceModalProps) {
  const { t } = useTranslation();
  const footerMode = footer != null || cancelLabel != null;
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
          {closable && !footerMode && (
            <button type="button" className={styles.closeBtn} onClick={onClose} aria-label={t('app.window.close')}>
              <X size={18} />
            </button>
          )}
        </div>
      </div>
      <div className={`${styles.body} ${fullscreen ? styles.bodyFullscreen : wide ? styles.bodyWide : ''}`}>
        {children}
      </div>
      {closable && footerMode && (
        <div className={styles.footer}>
          <Button tone="neutral" size="md" onClick={onClose} disabled={cancelDisabled}>
            {cancelLabel ?? t('confirm.cancel')}
          </Button>
          {footer && <div className={styles.footerEnd}>{footer}</div>}
        </div>
      )}
    </Overlay>
  );
}
