import type { CSSProperties, ReactNode } from 'react';
import classNames from 'classnames';
import styles from './Badge.module.scss';

export interface BadgeProps {
  label?: string;
  color?: string;
  icon?: ReactNode;
  /** Side of the label the icon renders on. Defaults to 'start' so every
   *  existing caller (icon before label) is unaffected. */
  iconPosition?: 'start' | 'end';
  /** Reserves a fixed width (e.g. '4ch', '3rem') and centers the label within
   *  it, so a badge whose label length changes (a live numeric readout)
   *  doesn't resize its container. Unset by default (shrinks to content). */
  minWidth?: string;
  /** Trims the horizontal padding, for a badge sized tightly around its own
   *  reserved minWidth (the monitoring tab chips) rather than the default
   *  roomier pill other badges use. */
  compact?: boolean;
}

export function Badge({ label, color = 'var(--text)', icon, iconPosition = 'start', minWidth, compact }: BadgeProps) {
  return (
    <span
      className={classNames(styles.badge, compact && styles.compact)}
      style={{ '--badge-color': color, ...(minWidth ? { '--badge-min-width': minWidth } : {}) } as CSSProperties}
    >
      {iconPosition === 'start' && icon}
      {label ?? ''}
      {iconPosition === 'end' && icon}
    </span>
  );
}
