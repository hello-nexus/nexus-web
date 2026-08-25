import type { InputHTMLAttributes, ReactNode } from 'react';
import { Button, type ButtonProps } from '../../../../components/common/Button/Button';
import { SettingsSection as SettingsSectionBase } from '../../../../components/common/SettingsSection/SettingsSection';
import styles from './SettingsRow.module.scss';

// The settings row / toggle / select come from the canonical shared component
// (components/common/SettingRow) so panel widget settings render identically to
// the main Settings pages, re-exported under the panel names so existing
// widget-settings imports keep working. Only the panel-specific form utilities
// below (section wrapper, text input, action buttons, saved / hint chips) are
// local.
export {
  SettingRow as SettingsRow,
  SettingToggle as SettingsToggle,
  SettingSelect as SettingsSelect,
} from '../../../../components/common/SettingRow/SettingRow';

// Header-above-box settings group, shared with the dashboard Settings pages.
// `action` renders a trailing control on the title row (e.g. a delete button).
export function SettingsSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <SettingsSectionBase title={title} action={action}>{children}</SettingsSectionBase>;
}

export function SettingsInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${styles.input} ${props.className ?? ''}`} />;
}

export function SettingsActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions} data-settings-aside="true">{children}</div>;
}

/**
 * Settings-sheet action button. Delegates to the canonical Button so these
 * sheets match the main Settings pages, the same reason SettingRow above is
 * re-exported rather than reimplemented.
 */
export function SettingsButton({
  variant = 'primary',
  ...props
}: Omit<ButtonProps, 'tone' | 'size'> & { variant?: 'primary' | 'muted' }) {
  return <Button {...props} size="sm" tone={variant === 'muted' ? 'neutral' : 'accent'} />;
}

export function SettingsSaved({ children }: { children: ReactNode }) {
  return <span className={styles.saved}>{children}</span>;
}

/** `tone="warning"` marks a hint the user has to act on to proceed. */
export function SettingsHint({ children, tone }: { children: ReactNode; tone?: 'warning' }) {
  return <span className={styles.hint} data-tone={tone} data-settings-aside="true">{children}</span>;
}
