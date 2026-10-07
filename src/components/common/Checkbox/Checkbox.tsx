import type { ReactNode } from 'react';
import styles from './Checkbox.module.scss';

export interface CheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** The visible label beside the box; it is also the accessible name. */
  label: ReactNode;
  disabled?: boolean;
  className?: string;
}

/** A labelled native checkbox: the one tick-box for dialogs and forms (use Toggle for an immediate setting). */
export function Checkbox({ checked, onChange, label, disabled, className }: CheckboxProps) {
  return (
    <label className={`${styles.checkbox} ${disabled ? styles.disabled : ''} ${className ?? ''}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={e => onChange(e.target.checked)}
      />
      <span>{label}</span>
    </label>
  );
}
