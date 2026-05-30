import type { ButtonHTMLAttributes, ReactNode } from 'react';
import classNames from 'classnames';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import styles from './Button.module.scss';

export type ButtonSize = 'sm' | 'md' | 'lg';
export type ButtonTone = 'neutral' | 'accent' | 'danger' | 'ghost';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'size'> {
  size?: ButtonSize;
  tone?: ButtonTone;
  pill?: boolean;
  // Icon-only buttons render square; otherwise icon sits to the leading edge.
  icon?: ReactNode;
  iconTrailing?: ReactNode;
  // Visual loading state. Disables the button and renders a small spinner in
  // place of the icon. Don't use for slow async work that should be tracked
  // by external state - this is for the brief moment between click and
  // commit (~100-1000ms) where the user needs feedback that something fired.
  loading?: boolean;
  children?: ReactNode;
}

/*
 * Canonical button. Replaces the dozen+ ad-hoc .btn / .button / .iconButton /
 * .catalogBtn / .refreshBtn / etc. SCSS classes scattered across views.
 *
 * Size + tone + pill is the public API. For escape hatches use className - the
 * styles below are scoped via CSS modules so a custom class wins normal
 * cascade order.
 *
 * Storybook: Foundation > Inputs > Button (Storybook entry includes the full
 * size x tone matrix).
 */
export function Button({
  size = 'md',
  tone = 'neutral',
  pill = false,
  icon,
  iconTrailing,
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
    </button>
  );

  // Route `title` through the custom HoverTooltip rather than the native browser
  // tooltip, matching IconLabelButton / RgbStatusCard. Icon-only buttons are the
  // typical case (the label lives in the tooltip), but any caller passing
  // `title` gets the styled tooltip for free.
  return title ? <HoverTooltip body={title}>{btn}</HoverTooltip> : btn;
}
