import type { CSSProperties, ReactNode } from 'react';
import classNames from 'classnames';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
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
  /** Renders the label in caps, for badges that read as a label on a heading
   *  rather than as a value. */
  uppercase?: boolean;
  /** Solid fill in the badge color with the contrast-paired text, for a badge that must stand out. */
  filled?: boolean;
  /** 'small' sets the label one step up from the default caption size. */
  size?: 'caption' | 'small';
  /** Hover explanation; also the badge's accessible name, since a tooltip is pointer-only. */
  tooltip?: { title?: string; body: string };
  className?: string;
}

export function Badge({ label, color = 'var(--text)', icon, iconPosition = 'start', minWidth, compact, uppercase, filled, size = 'caption', tooltip, className }: BadgeProps) {
  const badge = (
    <span
      className={classNames(styles.badge, compact && styles.compact, uppercase && styles.uppercase, filled && styles.filled, size === 'small' && styles.small, !tooltip && className)}
      style={{ '--badge-color': color, ...(minWidth ? { '--badge-min-width': minWidth } : {}) } as CSSProperties}
    >
      {iconPosition === 'start' && icon}
      {label ?? ''}
      {iconPosition === 'end' && icon}
    </span>
  );
  if (!tooltip) return badge;
  const name = tooltip.title ? `${tooltip.title}. ${tooltip.body}` : tooltip.body;
  return (
    <HoverTooltip title={tooltip.title} body={tooltip.body} side="top">
      <span className={classNames(styles.trigger, className)} role="img" aria-label={name}>{badge}</span>
    </HoverTooltip>
  );
}
