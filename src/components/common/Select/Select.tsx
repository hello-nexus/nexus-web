import { ChevronDown } from 'lucide-react';
import type { ChangeEvent } from 'react';
import styles from './Select.module.scss';

/**
 * Themed wrapper around native `<select>`. Wraps the native element in a
 * relative span to overlay a lucide ChevronDown icon on the right edge; the
 * native popup still opens on click.
 *
 * Use `options` for simple flat lists; pass `children` directly when
 * you need optgroups or option-level customisations. The wrapper
 * accepts `className` so consumers can size it (width: 100%, flex: 1,
 * etc.) without fighting the chevron positioning.
 */
export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options?: readonly SelectOption[];
  children?: React.ReactNode;
  disabled?: boolean;
  ariaLabel?: string;
  className?: string;
  /** 'standard' (default) renders the boxed dropdown chrome. 'ghost'
   *  drops the border and background so the value reads as text with
   *  just the chevron - used in contexts where the dropdown sits
   *  inside an already-bordered card (cooling fan / curve rows). */
  variant?: 'standard' | 'ghost';
}

export function Select({
  value, onChange, options, children, disabled,
  ariaLabel, className, variant = 'standard',
}: SelectProps) {
  const handle = (e: ChangeEvent<HTMLSelectElement>) => onChange(e.target.value);
  const variantClass = variant === 'ghost' ? styles.ghost : '';
  return (
    <span className={`${styles.wrapper} ${variantClass} ${className ?? ''}`}>
      <select
        value={value}
        onChange={handle}
        disabled={disabled}
        aria-label={ariaLabel}
        className={styles.select}
      >
        {options
          ? options.map(opt => (
              <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </option>
            ))
          : children}
      </select>
      <ChevronDown
        className={styles.chevron}
        size={14}
        strokeWidth={2}
        aria-hidden="true"
      />
    </span>
  );
}
