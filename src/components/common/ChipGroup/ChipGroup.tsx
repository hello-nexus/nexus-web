import classNames from 'classnames';
import type { ReactNode } from 'react';

export interface ChipOption {
  readonly key: string;
  readonly label: ReactNode;
  readonly disabled?: boolean;
  // Accessible name for an icon-only chip whose visible `label` is a glyph.
  readonly ariaLabel?: string;
}

type ChipGroupSingleProps = {
  multiSelect?: false;
  activeKey: string;
  onChange: (key: string) => void;
};

type ChipGroupMultiProps = {
  multiSelect: true;
  activeKeys: ReadonlySet<string>;
  onToggleKey: (key: string) => void;
};

export type ChipGroupProps = {
  options: readonly ChipOption[];
  ariaLabel?: string;
  className?: string;
} & (ChipGroupSingleProps | ChipGroupMultiProps);

/**
 * Chip row for selecting from a small set of options.
 * Single-select (default): `activeKey` + `onChange` - one chip active at a time.
 * Multi-select (`multiSelect: true`): `activeKeys` + `onToggleKey` - chips toggle independently.
 */
export function ChipGroup(props: ChipGroupProps) {
  const { options, ariaLabel, className } = props;
  return (
    <div className={classNames('chip-group', className)} role="group" aria-label={ariaLabel}>
      {options.map(opt => {
        const active = props.multiSelect
          ? props.activeKeys.has(opt.key)
          : props.activeKey === opt.key;
        const handleClick = props.multiSelect
          ? () => props.onToggleKey(opt.key)
          : () => props.onChange(opt.key);
        return (
          <button
            key={opt.key}
            type="button"
            aria-pressed={active}
            aria-label={opt.ariaLabel}
            disabled={opt.disabled}
            className={`chip-action${active ? ' chip-active' : ''}`}
            onClick={handleClick}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
