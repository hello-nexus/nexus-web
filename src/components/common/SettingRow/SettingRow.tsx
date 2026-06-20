import type { ReactNode } from 'react';
import { Toggle } from '../Toggle/Toggle';
import { Select } from '../Select/Select';
import styles from './SettingRow.module.scss';

/**
 * Canonical settings row: a label (+ optional description) on the left and a
 * control on the right (no per-row divider - the rule belongs under section
 * headers, via SectionHeader). The one settings row for the whole app (main
 * Settings pages, lighting/keeb pages, panel editor sheet, panel Theme page,
 * device Settings tab), so they read identically. The panel `SettingsRow` name
 * re-exports this primitive.
 *
 * Uses `--text`, `--text-dim`, and `--border` so the row themes correctly
 * inside `.panel-root` (kiosk) and on the desktop dashboard.
 */
export function SettingRow({
  label,
  description,
  icon,
  children,
  disabled,
  anchorId,
}: {
  label?: string;
  description?: ReactNode;
  // Optional accent glyph rendered inline before the label text.
  icon?: ReactNode;
  children: ReactNode;
  disabled?: boolean;
  // Search deep-link target: stamps the row so the command palette can scroll
  // to + shine it. Optional; nothing else reads it.
  anchorId?: string;
}) {
  return (
    <div id={anchorId} data-search-anchor={anchorId} className={disabled ? `${styles.row} ${styles.disabled}` : styles.row}>
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
  anchorId,
}: {
  label: string;
  description?: ReactNode;
  icon?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  anchorId?: string;
}) {
  return (
    <SettingRow label={label} description={description} icon={icon} disabled={disabled} anchorId={anchorId}>
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
  description,
  anchorId,
}: {
  label?: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
  disabled?: boolean;
  description?: ReactNode;
  anchorId?: string;
}) {
  return (
    <SettingRow label={label} description={description} anchorId={anchorId}>
      <Select value={value} onChange={onChange} options={options} ariaLabel={label} disabled={disabled} />
    </SettingRow>
  );
}
