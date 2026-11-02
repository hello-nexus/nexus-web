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
  /** Caps by default; pass false for a value that must keep its case (executable names, unit readouts). */
  uppercase?: boolean;
  /** Solid fill in the badge color with the contrast-paired text, for a badge that must stand out. */
  filled?: boolean;
  /** 'small' sets the label one step up from the default caption size. */
  size?: 'caption' | 'small';
  /** Hover explanation; also the badge's accessible name, since a tooltip is pointer-only. */
  tooltip?: { title?: string; body: string };
  /** Makes the badge a button; its keys and clicks stay off an enclosing clickable row. */
  onClick?: () => void;
  className?: string;
}

export function Badge({ label, color = 'var(--text)', icon, iconPosition = 'start', minWidth, compact, uppercase = true, filled, size = 'caption', tooltip, onClick, className }: BadgeProps) {
  const badgeClass = classNames(styles.badge, compact && styles.compact, uppercase && styles.uppercase, filled && styles.filled, size === 'small' && styles.small, onClick && styles.clickable, !tooltip && className);
  const badgeStyle = { '--badge-color': color, ...(minWidth ? { '--badge-min-width': minWidth } : {}) } as CSSProperties;
  const content = (
    <>
      {iconPosition === 'start' && icon}
      {label ?? ''}
      {iconPosition === 'end' && icon}
    </>
  );
  const name = tooltip ? (tooltip.title ? `${tooltip.title}. ${tooltip.body}` : tooltip.body) : undefined;
  if (onClick) {
    const button = (
      <button
        type="button"
        className={classNames(badgeClass, tooltip && className)}
        style={badgeStyle}
        aria-label={name ? `${label ?? ''}. ${name}` : undefined}
        onClick={e => { e.stopPropagation(); onClick(); }}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') e.stopPropagation(); }}
      >
        {content}
      </button>
    );
    return tooltip ? <HoverTooltip title={tooltip.title} body={tooltip.body} side="top">{button}</HoverTooltip> : button;
  }
  const badge = <span className={badgeClass} style={badgeStyle}>{content}</span>;
  if (!tooltip) return badge;
  return (
    <HoverTooltip title={tooltip.title} body={tooltip.body} side="top">
      <span className={classNames(styles.trigger, className)} role="img" aria-label={name}>{badge}</span>
    </HoverTooltip>
  );
}
