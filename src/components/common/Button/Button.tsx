import type { ButtonHTMLAttributes, ReactNode } from 'react';
import classNames from 'classnames';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import styles from './Button.module.scss';

export type ButtonSize = 'sm' | 'md' | 'lg';
export type ButtonTone = 'neutral' | 'accent' | 'danger' | 'ghost';
export type ButtonStatus = 'online' | 'offline';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'size'> {
  size?: ButtonSize;
  tone?: ButtonTone;
  pill?: boolean;
  // Icon-only buttons render square; otherwise icon sits to the leading edge.
  icon?: ReactNode;
  iconTrailing?: ReactNode;
  // Trailing green/red dot reflecting a live state (e.g. the OpenRGB subprocess).
  status?: ButtonStatus;
  // Disables the button and renders a spinner in place of the icon. For the
  // brief click-to-commit gap (~100-1000ms), not for state-tracked async work.
  loading?: boolean;
  children?: ReactNode;
}

/*
 * Canonical button. Size + tone + pill is the public API; className is the
 * escape hatch (CSS-module-scoped styles cede to a custom class in cascade
 * order). Storybook: Foundation > Inputs > Button.
 */
export function Button({
  size = 'md',
  tone = 'neutral',
  pill = false,
  icon,
  iconTrailing,
  status,
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  title,
  ...rest
}: ButtonProps) {
  const isIconOnly = !children && Boolean(icon || iconTrailing);
  const isDisabled = disabled || loading;

  const btn = (
    <button
      type={type}
      disabled={isDisabled}
      data-loading={loading || undefined}
      className={classNames(
        styles.button,
        styles[`size-${size}`],
        styles[`tone-${tone}`],
        pill && styles.pill,
        isIconOnly && styles.iconOnly,
        className,
      )}
      {...rest}
    >
      {loading
        ? <span className={styles.spinner} aria-hidden="true" />
        : icon && <span className={styles.icon}>{icon}</span>}
      {children && <span className={styles.label}>{children}</span>}
      {!loading && iconTrailing && <span className={styles.iconTrailing}>{iconTrailing}</span>}
      {status && (
        <span
          className={classNames(styles.statusDot, status === 'online' ? styles.statusOnline : styles.statusOffline)}
          aria-hidden="true"
        />
      )}
    </button>
  );

  // Route `title` through HoverTooltip instead of the native browser tooltip,
  // matching IconLabelButton.
  return title ? <HoverTooltip body={title}>{btn}</HoverTooltip> : btn;
}
