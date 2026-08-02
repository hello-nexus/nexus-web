import classNames from 'classnames';
import { useRef, type KeyboardEvent, type ReactNode } from 'react';
import { HoverTooltip } from '../HoverTooltip/HoverTooltip';

export interface ChipOption {
  readonly key: string;
  readonly label: ReactNode;
  readonly disabled?: boolean;
  // Accessible name for an icon-only chip whose visible `label` is a glyph.
  readonly ariaLabel?: string;
  // Hover tooltip body, rendered through the shared HoverTooltip. A disabled
  // chip is unfocusable, so its tooltip has no keyboard path - avoid pairing
  // tooltip with disabled.
  readonly tooltip?: string;
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
  /** Stretch the row to 100% width with each chip sharing it equally, for
   *  settings rows that read as a segmented control. Mirrors Tabs' fullWidth. */
  fullWidth?: boolean;
} & (ChipGroupSingleProps | ChipGroupMultiProps);

/**
 * Chip row for selecting from a small set of options.
 * Single-select (default): `activeKey` + `onChange` - one chip active at a
 * time, exposed as a radiogroup so assistive tech announces the options as
 * alternatives and arrow keys move between them.
 * Multi-select (`multiSelect: true`): `activeKeys` + `onToggleKey` - chips
 * toggle independently, so they stay `aria-pressed` toggle buttons in a group.
 */
export function ChipGroup(props: ChipGroupProps) {
  const { options, ariaLabel, className, fullWidth } = props;
  const groupRef = useRef<HTMLDivElement>(null);

  // Radio semantics put the whole group on one tab stop and arrows move inside
  // it. Movement does NOT select: callers commit real work on change - a keeb
  // chip writes keyboard firmware, a Lian Li chip rotates the physical screen -
  // and selection-follows-focus would fire one of those per keypress. ARIA APG
  // allows this variant; Space/Enter commits, which the native button already
  // does. Stepping is measured from the FOCUSED chip, not from activeKey, since
  // a device-derived activeKey lags its own commit and would stall the walk.
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (props.multiSelect) return;
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1
      : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1
        : 0;
    if (step === 0) return;
    const group = groupRef.current;
    if (!group) return;
    const chips = [...group.querySelectorAll<HTMLButtonElement>('[data-chip-key]')]
      .filter(el => !el.disabled);
    if (chips.length === 0) return;
    const focused = chips.indexOf(document.activeElement as HTMLButtonElement);
    const from = focused >= 0
      ? focused
      : Math.max(0, chips.findIndex(el => el.dataset.chipKey === props.activeKey));
    event.preventDefault();
    chips[((from + step) + chips.length) % chips.length].focus();
  };

  const singleSelect = !props.multiSelect;
  // Focus lands on the checked chip; with none checked the first selectable one
  // holds the tab stop so the group is never unreachable.
  const tabStopKey = singleSelect
    ? (options.find(o => o.key === props.activeKey && !o.disabled)
      ?? options.find(o => !o.disabled))?.key
    : undefined;

  return (
    <div
      ref={groupRef}
      className={classNames('chip-group', fullWidth && 'chip-group-full', className)}
      role={singleSelect ? 'radiogroup' : 'group'}
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
      {options.map(opt => {
        const active = props.multiSelect
          ? props.activeKeys.has(opt.key)
          : props.activeKey === opt.key;
        const handleClick = props.multiSelect
          ? () => props.onToggleKey(opt.key)
          : () => props.onChange(opt.key);
        const chip = (
          <button
            key={opt.key}
            type="button"
            data-chip-key={opt.key}
            role={singleSelect ? 'radio' : undefined}
            aria-checked={singleSelect ? active : undefined}
            aria-pressed={singleSelect ? undefined : active}
            tabIndex={singleSelect ? (opt.key === tabStopKey ? 0 : -1) : undefined}
            aria-label={opt.ariaLabel}
            disabled={opt.disabled}
            className={`chip-action${active ? ' chip-active' : ''}`}
            onClick={handleClick}
          >
            {opt.label}
          </button>
        );
        // HoverTooltip clones onto the button (no wrapper DOM), so the
        // chip-group layout and direct-child selectors are unaffected.
        return opt.tooltip
          ? <HoverTooltip key={opt.key} body={opt.tooltip}>{chip}</HoverTooltip>
          : chip;
      })}
    </div>
  );
}
