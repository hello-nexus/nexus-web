import type { ReactNode } from 'react';
import { Toggle } from '../Toggle/Toggle';
import { Select } from '../Select/Select';
import styles from './SettingRow.module.scss';

/**
 * Canonical settings row: a label (+ optional description) on the left and a
 * control on the right (no per-row divider — the rule belongs under section
 * headers, via SectionHeader). The one settings row for the whole app (main
 * Settings pages, lighting/keeb pages, panel editor sheet, panel Theme page,
 * device Settings tab), so they read identically. The panel `SettingsRow` name
 * re-exports this primitive.
 *
 * Tokens fall back to the app globals (`--text`/`--border`/`--text-faded`) so
 * the row themes correctly both inside `.panel-root` (kiosk, where the
 * `--panel-*` aliases are defined and carry the per-device theme) and outside
 * it (the desktop dashboard).
 */
export function SettingRow({
  label,
  description,
  icon,
  children,
  disabled,
}: {
  label?: string;
  description?: ReactNode;
  // Optional accent glyph rendered inline before the label text.
  icon?: ReactNode;
  children: ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className={disabled ? `${styles.row} ${styles.disabled}` : styles.row}>
      {(label || description) && (
        <div className={styles.info}>
          {label && (
            <span className={styles.label}>
              {icon && <span className={styles.labelIcon} aria-hidden="true">{icon}</span>}
              {label}
            </span>
          )}
          {description && <span className={styles.desc}>{description}</span>}
        </div>
      )}
      <div className={styles.control}>{children}</div>
    </div>
  );
}

export function SettingToggle({
  label,
  description,
  icon,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  description?: ReactNode;
  icon?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <SettingRow label={label} description={description} icon={icon} disabled={disabled}>
      <Toggle checked={checked} onChange={onChange} disabled={disabled} ariaLabel={label} />
    </SettingRow>
  );
}

export function SettingSelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <SettingRow label={label}>
      <Select value={value} onChange={onChange} options={options} ariaLabel={label} disabled={disabled} />
    </SettingRow>
  );
}
