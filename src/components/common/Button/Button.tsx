import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';
import classNames from 'classnames';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';
import styles from './Button.module.scss';

export type ButtonSize = 'sm' | 'md' | 'lg';
export type ButtonTone = 'neutral' | 'accent' | 'danger' | 'danger-solid' | 'ghost';
export type ButtonStatus = 'online' | 'offline';

export interface ButtonProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'size'> {
  size?: ButtonSize;
  tone?: ButtonTone;
  pill?: boolean;
  // Icon-only buttons render square; otherwise icon sits to the leading edge.
  // There is no trailing slot: every button in the app puts its icon first.
  icon?: ReactNode;
  // Trailing green/red dot reflecting a live state (e.g. the OpenRGB subprocess).
  status?: ButtonStatus;
  // Disables the button and renders a spinner in place of the icon. For the
  // brief click-to-commit gap (~100-1000ms), not for state-tracked async work.
  loading?: boolean;
  // While loading, hide the label and center the spinner over it so the spinner
  // sits in place of the text. The label stays in the DOM (visibility:hidden)
  // to hold the button width, so there is no layout shift.
  loadingHidesLabel?: boolean;
  // When set, renders as an <a> link with identical styling - for actions that
  // navigate to an external URL (e.g. "Report a bug"), so links and buttons
  // share one component instead of a bespoke link style.
  href?: string;
  target?: string;
  rel?: string;
  children?: ReactNode;
  /** Focus handle for callers that manage focus (modal autofocus). Reaches the
   *  <button> only: the `href` branch renders an <a>, and `title` wraps the
   *  element in HoverTooltip, which clones it with its own ref. */
  ref?: Ref<HTMLButtonElement>;
}

/*
 * Canonical button. Size + tone + pill is the public API; className is the
 * escape hatch (CSS-module-scoped styles cede to a custom class in cascade
 * order). Storybook: Foundation > Inputs > Button.
 */
export function Button({
  ref,
  size = 'md',
  tone = 'neutral',
  pill = false,
  icon,
  status,
  loading = false,
  loadingHidesLabel = false,
  disabled,
  className,
  children,
  type = 'button',
  title,
  href,
  target,
  rel,
  ...rest
}: ButtonProps) {
  const isIconOnly = !children && Boolean(icon);
  const isDisabled = disabled || loading;
  const hideLabel = loading && loadingHidesLabel;

  const classes = classNames(
    styles.button,
    styles[`size-${size}`],
    styles[`tone-${tone}`],
    pill && styles.pill,
    isIconOnly && styles.iconOnly,
    hideLabel && styles.hidesLabel,
    className,
  );

  const content = (
    <>
      {loading
        ? <span className={classNames(styles.spinner, hideLabel && styles.spinnerCentered)} aria-hidden="true" />
        : icon && <span className={styles.icon}>{icon}</span>}
      {children && <span className={classNames(styles.label, hideLabel && styles.labelHidden)}>{children}</span>}
      {status && (
        <span
          className={classNames(styles.statusDot, status === 'online' ? styles.statusOnline : styles.statusOffline)}
          aria-hidden="true"
        />
      )}
    </>
  );

  const el = href ? (
    <a href={isDisabled ? undefined : href} target={target} rel={rel} className={classes}
       aria-disabled={isDisabled || undefined}>
      {content}
    </a>
  ) : (
    <button ref={ref} type={type} disabled={isDisabled} data-loading={loading || undefined} className={classes} {...rest}>
      {content}
    </button>
  );

  // Route `title` through HoverTooltip instead of the native browser tooltip,
  // matching IconLabelButton.
  return title ? <HoverTooltip body={title}>{el}</HoverTooltip> : el;
}
