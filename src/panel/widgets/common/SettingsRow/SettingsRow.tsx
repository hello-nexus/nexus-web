import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
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
export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return <SettingsSectionBase title={title}>{children}</SettingsSectionBase>;
}

export function SettingsInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${styles.input} ${props.className ?? ''}`} />;
}

export function SettingsActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions} data-settings-aside="true">{children}</div>;
}

export function SettingsButton({
  variant = 'primary',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'muted' }) {
  const className = variant === 'muted' ? styles.buttonMuted : styles.button;
  return <button {...props} type={props.type ?? 'button'} className={`${className} ${props.className ?? ''}`} />;
}

export function SettingsSaved({ children }: { children: ReactNode }) {
  return <span className={styles.saved}>{children}</span>;
}

export function SettingsHint({ children }: { children: ReactNode }) {
  return <span className={styles.hint} data-settings-aside="true">{children}</span>;
}
