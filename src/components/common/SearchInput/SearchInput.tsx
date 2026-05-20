import { Search, X } from 'lucide-react';
import type { ChangeEvent } from 'react';
import styles from './SearchInput.module.scss';

/**
 * Themed search input. Wraps a native text input with the standard
 * lucide search icon on the left and an optional clear button on the
 * right. Used by SupportedDevicesModal, AppPicker, and the panel
 * add-widget filter.
 *
 * Pass `autoFocus` only on surfaces where immediately opening the
 * keyboard is intentional; avoid it on scrollable phone sheets.
 */
export interface SearchInputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  ariaLabel?: string;
  className?: string;
}

export function SearchInput({
  value, onChange, placeholder, autoFocus, ariaLabel, className,
}: SearchInputProps) {
  const hasValue = value.length > 0;
  return (
    <div className={`${styles.root} ${className ?? ''}`}>
      <Search size={14} className={styles.icon} aria-hidden="true" />
      <input
        type="text"
        className={styles.input}
        value={value}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={ariaLabel ?? placeholder}
      />
      {hasValue && (
        <button
          type="button"
          className={styles.clear}
          onClick={() => onChange('')}
          aria-label="Clear search"
        >
          <X size={12} />
        </button>
      )}
    </div>
  );
}
