import type { ReactNode } from 'react';
import { Info, OctagonAlert, TriangleAlert, X } from 'lucide-react';
import { Button } from '../Button/Button';
import styles from './Notice.module.scss';

export interface NoticeProps {
  /**
   * info: guidance, never a problem; neutral so a red accent cannot read as an error.
   * warning: something may need attention (warn colour). critical: something went wrong (bad colour).
   */
  tone: 'info' | 'warning' | 'critical';
  /** alert for something that interrupts, status for something that merely appears. */
  role?: 'alert' | 'status';
  children: ReactNode;
  /** Right-hand controls: buttons or short status text. */
  actions?: ReactNode;
  className?: string;
  /** Adds a close button after the actions; the caller decides when the notice may return. */
  onDismiss?: () => void;
  /** Accessible name of the close button. */
  dismissLabel?: string;
}

const ICONS = { info: Info, warning: TriangleAlert, critical: OctagonAlert } as const;

/**
 * The one inline notice block: a soft fill, border and icon in the level's colour, with
 * primary text in --text and an optional actions slot on the right. Put a
 * dimmer line under the main text with NoticeSecondary. Pages use this rather
 * than building their own bordered banner.
 */
export function Notice({ tone, role, children, actions, className, onDismiss, dismissLabel }: NoticeProps) {
  const Icon = ICONS[tone];
  return (
    <div className={`${styles.notice} ${styles[tone]} ${className ?? ''}`} role={role} data-tone={tone}>
      <div className={styles.row}>
        <div className={styles.main}>
          <Icon className={styles.icon} size={18} aria-hidden />
          <div className={styles.body}>{children}</div>
        </div>
        {(actions || onDismiss) && (
          <div className={styles.actions}>
            {actions}
            {onDismiss && <Button size="sm" tone="ghost" icon={<X size={14} aria-hidden />} aria-label={dismissLabel} onClick={onDismiss} />}
          </div>
        )}
      </div>
    </div>
  );
}

/** A dimmer line under a notice's main text. */
export function NoticeSecondary({ children }: { children: ReactNode }) {
  return <span className={styles.secondary}>{children}</span>;
}
