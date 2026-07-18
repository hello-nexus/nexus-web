import type { CSSProperties, ReactNode } from 'react';
import styles from './Badge.module.scss';

export interface BadgeProps {
  label?: string;
  color?: string;
  icon?: ReactNode;
  /** Reserves a fixed width (e.g. '4ch', '3rem') and centers the label within
   *  it, so a badge whose label length changes (a live numeric readout)
   *  doesn't resize its container. Unset by default (shrinks to content). */
  minWidth?: string;
}

export function Badge({ label, color = 'var(--text)', icon, minWidth }: BadgeProps) {
  return (
    <span
      className={styles.badge}
      style={{ '--badge-color': color, ...(minWidth ? { '--badge-min-width': minWidth } : {}) } as CSSProperties}
    >
      {icon}
      {label ?? ''}
    </span>
  );
}
