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
 * Pass `hero` for a page that opens with nothing to show: the icon sits in
 * an accent halo, the title reads as a heading, and `points` lists what
 * the feature does.
 */
export interface EmptyStatePoint {
  icon: ReactNode;
  text: ReactNode;
}

export interface EmptyStateProps {
  icon?: ReactNode;
  title: ReactNode;
  hint?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  hero?: boolean;
  points?: EmptyStatePoint[];
  className?: string;
}

export function EmptyState({ icon, title, hint, action, compact, hero, points, className }: EmptyStateProps) {
  const variant = hero ? styles.hero : compact ? styles.compact : '';
  return (
    <div className={`${styles.root} ${variant} ${className ?? ''}`} role="status">
      {icon && (
        <div className={styles.icon} aria-hidden="true">
          {hero && <span className={styles.iconDisc} />}
          {icon}
        </div>
      )}
      <div className={styles.title}>{title}</div>
      {hint && <div className={styles.hint}>{hint}</div>}
      {points && points.length > 0 && (
        <ul className={styles.points}>
          {points.map((p, i) => (
            <li key={i} className={styles.point}>
              <span className={styles.pointIcon} aria-hidden="true">{p.icon}</span>
              {p.text}
            </li>
          ))}
        </ul>
      )}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  );
}
