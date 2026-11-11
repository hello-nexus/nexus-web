import type { ReactNode } from 'react';
import { Card } from '../Card/Card';
import styles from './StatusRow.module.scss';

/*
 * One list row for a monitored thing: the name on the left (wraps at word
 * boundaries), the reading with its status chip stacked beneath it and
 * right-aligned, then the on/off switch at the far right. Built on the shared
 * Card, so the selected treatment matches the app's other rails. Used by the
 * Watchlist and the Cooling fans list so both read identically.
 *
 * A row with no `value` and no `chip` (switched off) shows the name and switch
 * only; a row with no `toggle` (nothing to switch) shows the name and chip.
 */
interface StatusRowProps {
  name: ReactNode;
  /** The reading, rendered above the chip. Omit for a switched-off row. */
  value?: ReactNode;
  chip?: ReactNode;
  /** Extra small line beneath the chip (e.g. how long a state has held). */
  note?: ReactNode;
  toggle?: ReactNode;
  /** Makes the name a button that selects the row. Omit for a non-selectable row. */
  onSelect?: () => void;
  selected?: boolean;
  /** Dims the name and reading (the thing is switched off). */
  dimmed?: boolean;
  /** Draws the danger border. */
  danger?: boolean;
  className?: string;
}

export function StatusRow({ name, value, chip, note, toggle, onSelect, selected, dimmed, danger, className }: StatusRowProps) {
  const hasStatus = value !== undefined || chip !== undefined || note !== undefined;
  return (
    <Card
      compact
      interactive={Boolean(onSelect)}
      selected={selected}
      disableInteractiveRole
      onClick={onSelect}
      className={`${styles.card} ${dimmed ? styles.dimmed : ''} ${danger ? styles.danger : ''} ${className ?? ''}`}
    >
      <div className={styles.body}>
        {onSelect ? (
          <button type="button" className={styles.name} aria-pressed={Boolean(selected)} onClick={e => { e.stopPropagation(); onSelect(); }}>
            {name}
          </button>
        ) : (
          <span className={styles.name}>{name}</span>
        )}
        {hasStatus && (
          <span className={styles.status}>
            {value !== undefined && <span className={styles.value}>{value}</span>}
            {chip}
            {note !== undefined && <span className={styles.note}>{note}</span>}
          </span>
        )}
        {toggle !== undefined && (
          <span className={styles.toggle} role="presentation" onClick={e => e.stopPropagation()}>{toggle}</span>
        )}
      </div>
    </Card>
  );
}
