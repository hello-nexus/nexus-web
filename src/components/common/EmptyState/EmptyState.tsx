import type { ReactNode } from 'react';
import styles from './EmptyState.module.scss';

/**
 * Generic empty state. Centered icon + title (+ optional hint). Used by
 * panel widgets when their data source has no entries (no displays, no
 * media playing, no detected devices) and by app views to convey
 * "nothing to show here yet" without each surface re-implementing the
 * stack.
 *
 * Pass `compact` for tight panel widget contexts (smaller icon, no
 * surrounding padding); the default is the roomier app-view layout.
 */
export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  className?: string;
}

export function EmptyState({ icon, title, hint, action, compact, className }: EmptyStateProps) {
  return (
    <div
      className={`${styles.root} ${compact ? styles.compact : ''} ${className ?? ''}`}
      role="status"
    >
      {icon && <div className={styles.icon} aria-hidden="true">{icon}</div>}
      <div className={styles.title}>{title}</div>
      {hint && <div className={styles.hint}>{hint}</div>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
