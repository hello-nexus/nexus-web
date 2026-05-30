import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { SectionHeader } from '../../../../components/common/SectionHeader/SectionHeader';
import styles from './SettingsRow.module.scss';

// The settings row / toggle / select now come from the canonical shared
// component (components/common/SettingRow) so the panel widget settings render
// identically to the main Settings pages. Re-exported under the panel names so
// the existing widget-settings imports keep working. Only the panel-specific
// form utilities below (section wrapper, text input, action buttons, saved /
// hint chips) live here now.
export {
  SettingRow as SettingsRow,
  SettingToggle as SettingsToggle,
  SettingSelect as SettingsSelect,
} from '../../../../components/common/SettingRow/SettingRow';

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={styles.section}>
      <SectionHeader>{title}</SectionHeader>
      {children}
    </div>
  );
}

export function SettingsInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${styles.input} ${props.className ?? ''}`} />;
}

export function SettingsActions({ children }: { children: ReactNode }) {
  return <div className={styles.actions}>{children}</div>;
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
  return <span className={styles.hint}>{children}</span>;
}
