import classNames from 'classnames';
import type { ReactNode } from 'react';

export interface ChipOption {
  readonly key: string;
  readonly label: ReactNode;
  readonly disabled?: boolean;
}

export interface ChipGroupProps {
  options: readonly ChipOption[];
  activeKey: string;
  onChange: (key: string) => void;
  ariaLabel?: string;
  className?: string;
}

/**
 * Single-select chip row - the cooling curve/mode `.chip-action` buttons as a
 * reusable control. The selected option carries the solid-accent `.chip-active`
 * fill. For settings and listings that pick one of a small set of options.
 */
export function ChipGroup({ options, activeKey, onChange, ariaLabel, className }: ChipGroupProps) {
  return (
    <div className={classNames('chip-group', className)} role="group" aria-label={ariaLabel}>
      {options.map(opt => (
        <button
          key={opt.key}
          type="button"
          aria-pressed={opt.key === activeKey}
          disabled={opt.disabled}
          className={`chip-action${opt.key === activeKey ? ' chip-active' : ''}`}
          onClick={() => onChange(opt.key)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
