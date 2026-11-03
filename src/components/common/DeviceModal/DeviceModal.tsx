import { type ReactNode } from 'react';
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
  /** When false the footer Cancel/Close is hidden and Esc/backdrop-click do not close. Defaults to true. */
  closable?: boolean;
  /**
   * Submit buttons, rendered at the right of the footer. The footer's left
   * slot is always the Cancel (or Close, when there is nothing to submit)
   * button; there is no header X.
   */
  footer?: ReactNode;
  /** Overrides the left button label: Cancel when `footer` is set, Close otherwise. */
  cancelLabel?: string;
  /** Disables the left button, e.g. while an async submit is in flight. */
  cancelDisabled?: boolean;
  headerRight?: ReactNode;
  children: ReactNode;
}

export function DeviceModal({ open, onClose, title, subtitle, icon, large, wide, fullscreen, fit, medium, roomy, closable = true, footer, cancelLabel, cancelDisabled, headerRight, children }: DeviceModalProps) {
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
        </div>
      </div>
      <div className={`${styles.body} ${fullscreen ? styles.bodyFullscreen : wide ? styles.bodyWide : ''}`}>
        {children}
      </div>
      {closable && (
        <div className={styles.footer}>
          <Button tone="neutral" size="md" onClick={onClose} disabled={cancelDisabled}>
            {cancelLabel ?? (footer ? t('confirm.cancel') : t('app.window.close'))}
          </Button>
          {footer && <div className={styles.footerEnd}>{footer}</div>}
        </div>
      )}
    </Overlay>
  );
}
