import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';
import { Toggle } from '../../../components/common/Toggle/Toggle';
import { Select } from '../../../components/common/Select/Select';
import styles from './SettingsRow.module.scss';

interface SettingsRowProps {
  label: string;
  children: ReactNode;
}

export function SettingsRow({ label, children }: SettingsRowProps) {
  return (
    <div className={styles.row}>
      <label className={styles.label}>{label}</label>
      <div className={styles.control}>{children}</div>
    </div>
  );
}

interface SettingsToggleProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export function SettingsToggle({ label, checked, onChange }: SettingsToggleProps) {
  return (
    <div className={styles.row}>
      <label className={styles.label}>{label}</label>
      <Toggle checked={checked} onChange={onChange} ariaLabel={label} />
    </div>
  );
}

interface SettingsSelectProps {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}

export function SettingsSelect({ label, value, options, onChange }: SettingsSelectProps) {
  return (
    <div className={styles.row}>
      <label className={styles.label}>{label}</label>
      <Select value={value} onChange={onChange} options={options} ariaLabel={label} />
    </div>
  );
}

interface SettingsSectionProps {
  title: string;
  children: ReactNode;
}

export function SettingsSection({ title, children }: SettingsSectionProps) {
  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>{title}</div>
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
