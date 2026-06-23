import type { CSSProperties, ReactNode } from 'react';
import styles from './Badge.module.scss';

export interface BadgeProps {
  label?: string;
  color?: string;
  icon?: ReactNode;
}

export function Badge({ label, color = 'var(--text)', icon }: BadgeProps) {
  return (
    <span
      className={styles.badge}
      style={{ '--badge-color': color } as CSSProperties}
    >
      {icon}
      {label ?? ''}
    </span>
  );
}
