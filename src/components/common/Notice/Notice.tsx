import type { ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import styles from './Notice.module.scss';

export interface NoticeProps {
  /** warning: border and icon in the warn colour. critical: both in the bad colour. */
  tone: 'warning' | 'critical';
  /** alert for something that interrupts, status for something that merely appears. */
  role?: 'alert' | 'status';
  children: ReactNode;
  /** Right-hand controls: buttons or short status text. */
  actions?: ReactNode;
  className?: string;
}

/**
 * The one inline warning block: a toned border and triangle on a surface, with
 * primary text in --text and an optional actions slot on the right. Put a
 * dimmer line under the main text with NoticeSecondary. Pages use this rather
 * than building their own bordered banner.
 */
export function Notice({ tone, role, children, actions, className }: NoticeProps) {
  return (
    <div className={`${styles.notice} ${tone === 'critical' ? styles.critical : styles.warning} ${className ?? ''}`} role={role} data-tone={tone}>
      <div className={styles.row}>
        <TriangleAlert className={styles.icon} size={18} aria-hidden />
        <div className={styles.body}>{children}</div>
        {actions && <div className={styles.actions}>{actions}</div>}
      </div>
    </div>
  );
}

/** A dimmer line under a notice's main text. */
export function NoticeSecondary({ children }: { children: ReactNode }) {
  return <span className={styles.secondary}>{children}</span>;
}
